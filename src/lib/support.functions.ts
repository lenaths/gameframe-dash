import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SupabaseAny = {
  from: (table: string) => SupabaseQuery;
};

type SupabaseResult<T = unknown> = {
  data: T | null;
  error: { message: string } | null;
};

type SupabaseQuery<T = unknown> = PromiseLike<SupabaseResult<T>> & {
  select: (columns: string) => SupabaseQuery<T>;
  eq: (column: string, value: unknown) => SupabaseQuery<T>;
  order: (column: string, options?: Record<string, unknown>) => SupabaseQuery<T>;
  insert: (values: unknown) => SupabaseQuery<T>;
  update: (values: unknown) => SupabaseQuery<T>;
  single: () => Promise<SupabaseResult<T>>;
  maybeSingle: () => Promise<SupabaseResult<T>>;
};

type TicketSummary = {
  id: string;
  user_id: string;
  server_order_id: string | null;
  subject: string;
};

const createTicketInput = z.object({
  subject: z.string().trim().min(3).max(160),
  body: z.string().trim().min(3).max(5000),
  category: z.string().trim().max(80).optional(),
  serverOrderId: z.string().uuid().optional().nullable(),
});

const replyTicketInput = z.object({
  ticketId: z.string().uuid(),
  body: z.string().trim().min(1).max(5000),
});

async function assertAdmin(userId: string, db: SupabaseAny) {
  const { data } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Admin access required.");
}

async function logActivity(
  db: SupabaseAny,
  input: {
    userId: string;
    ticketId: string;
    action: string;
    description: string;
    serverOrderId?: string | null;
  },
) {
  await db.from("activity_logs").insert({
    user_id: input.userId,
    server_order_id: input.serverOrderId ?? null,
    action: input.action,
    description: input.description,
    metadata: { ticket_id: input.ticketId },
  });
}

export const listMyTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;

    const { data, error } = await db
      .from("tickets")
      .select(
        "id, subject, status, priority, category, server_order_id, order_id, assigned_to, last_message_at, closed_at, created_at, updated_at, ticket_messages(id, user_id, is_staff, body, created_at)",
      )
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .order("created_at", { referencedTable: "ticket_messages", ascending: true });

    if (error) throw new Error(error.message);
    return { tickets: data ?? [] };
  });

export const createTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => createTicketInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;

    if (data.serverOrderId) {
      const { data: serverOrder, error: serverOrderError } = await db
        .from("server_orders")
        .select("id")
        .eq("id", data.serverOrderId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (serverOrderError || !serverOrder) throw new Error("Server not found.");
    }

    const { data: ticket, error: ticketError } = await db
      .from("tickets")
      .insert({
        user_id: context.userId,
        server_order_id: data.serverOrderId ?? null,
        subject: data.subject,
        category: data.category || null,
        status: "open",
        priority: "normal",
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (ticketError || !ticket) throw new Error(ticketError?.message ?? "Could not create ticket.");
    const createdTicket = ticket as TicketSummary;

    const { error: messageError } = await db.from("ticket_messages").insert({
      ticket_id: createdTicket.id,
      user_id: context.userId,
      is_staff: false,
      body: data.body,
    });
    if (messageError) throw new Error(messageError.message);

    await logActivity(db, {
      userId: context.userId,
      ticketId: createdTicket.id,
      serverOrderId: data.serverOrderId ?? null,
      action: "ticket.created",
      description: `Ticket created: ${data.subject}`,
    });

    return { ok: true, ticketId: createdTicket.id };
  });

export const replyToTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => replyTicketInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;

    const { data: ticket, error: ticketError } = await db
      .from("tickets")
      .select("id, user_id, server_order_id, subject")
      .eq("id", data.ticketId)
      .eq("user_id", context.userId)
      .single();
    if (ticketError || !ticket) throw new Error("Ticket not found.");
    const currentTicket = ticket as TicketSummary;

    const { error: messageError } = await db.from("ticket_messages").insert({
      ticket_id: data.ticketId,
      user_id: context.userId,
      is_staff: false,
      body: data.body,
    });
    if (messageError) throw new Error(messageError.message);

    await db
      .from("tickets")
      .update({ status: "open", last_message_at: new Date().toISOString() })
      .eq("id", data.ticketId);

    await logActivity(db, {
      userId: context.userId,
      ticketId: data.ticketId,
      serverOrderId: currentTicket.server_order_id,
      action: "ticket.replied",
      description: `Reply added to ticket: ${currentTicket.subject}`,
    });

    return { ok: true };
  });

export const adminListTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    await assertAdmin(context.userId, db);

    const { data, error } = await db
      .from("tickets")
      .select(
        "id, user_id, subject, status, priority, category, server_order_id, assigned_to, last_message_at, created_at, updated_at, ticket_messages(id, user_id, is_staff, body, created_at)",
      )
      .order("updated_at", { ascending: false })
      .order("created_at", { referencedTable: "ticket_messages", ascending: true });

    if (error) throw new Error(error.message);
    return { tickets: data ?? [] };
  });

export const adminReplyToTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => replyTicketInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    await assertAdmin(context.userId, db);

    const { data: ticket, error: ticketError } = await db
      .from("tickets")
      .select("id, user_id, server_order_id, subject")
      .eq("id", data.ticketId)
      .single();
    if (ticketError || !ticket) throw new Error("Ticket not found.");
    const currentTicket = ticket as TicketSummary;

    const { error: messageError } = await db.from("ticket_messages").insert({
      ticket_id: data.ticketId,
      user_id: context.userId,
      is_staff: true,
      body: data.body,
    });
    if (messageError) throw new Error(messageError.message);

    await db
      .from("tickets")
      .update({
        assigned_to: context.userId,
        status: "answered",
        last_message_at: new Date().toISOString(),
      })
      .eq("id", data.ticketId);

    await logActivity(db, {
      userId: currentTicket.user_id,
      ticketId: data.ticketId,
      serverOrderId: currentTicket.server_order_id,
      action: "ticket.staff_replied",
      description: `Staff reply added to ticket: ${currentTicket.subject}`,
    });

    await db.from("audit_logs").insert({
      actor_user_id: context.userId,
      target_user_id: currentTicket.user_id,
      entity_type: "ticket",
      entity_id: data.ticketId,
      action: "ticket.staff_replied",
      after: { ticket_id: data.ticketId },
    });

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("email")
      .eq("id", currentTicket.user_id)
      .maybeSingle();
    if (profileError) {
      console.warn(
        `[Email] Could not load profile email for ticket=${data.ticketId}: ${profileError.message}`,
      );
    }
    const { sendTransactionalEmail, ticketRepliedEmail } = await import("@/lib/email.server");
    await sendTransactionalEmail(
      ticketRepliedEmail({
        to: (profile as { email?: string | null } | null)?.email ?? null,
        subject: currentTicket.subject,
        replyPreview: data.body.slice(0, 500),
      }),
    );

    return { ok: true };
  });
