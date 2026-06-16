import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SupabaseAny = {
  from: (table: string) => SupabaseQuery;
};

type SupabaseResult<T = unknown> = {
  data: T | null;
  error: { message: string; code?: string } | null;
};

type SupabaseQuery<T = unknown> = PromiseLike<SupabaseResult<T>> & {
  select: (columns: string) => SupabaseQuery<T>;
  eq: (column: string, value: unknown) => SupabaseQuery<T>;
  in: (column: string, values: unknown[]) => SupabaseQuery<T>;
  order: (column: string, options?: Record<string, unknown>) => SupabaseQuery<T>;
  limit: (count: number) => SupabaseQuery<T>;
  insert: (values: unknown) => SupabaseQuery<T>;
  update: (values: unknown) => SupabaseQuery<T>;
};

type ActivityLogRow = {
  id: string;
  user_id: string;
  order_id: string | null;
  server_order_id: string | null;
  action: string;
  description: string | null;
  created_at: string;
};

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

const NOTIFICATION_ACTIONS = [
  "payment_received",
  "provisioning_started",
  "provisioning_succeeded",
  "provisioning_failed",
  "ticket.staff_replied",
];

function notificationFromActivity(log: ActivityLogRow) {
  const href = log.server_order_id
    ? `/manage/${log.server_order_id}`
    : log.action.startsWith("ticket.")
      ? "/support"
      : log.order_id
        ? "/billing"
        : "/dashboard";

  const map: Record<string, { title: string; type: string }> = {
    payment_received: { title: "Paiement reçu", type: "payment" },
    provisioning_started: { title: "Provisioning démarré", type: "provisioning" },
    provisioning_succeeded: { title: "Serveur prêt", type: "server_ready" },
    provisioning_failed: { title: "Erreur provisioning", type: "provisioning_failed" },
    "ticket.staff_replied": { title: "Ticket répondu", type: "support" },
  };
  const item = map[log.action] ?? { title: log.action, type: "activity" };
  return {
    user_id: log.user_id,
    source_activity_log_id: log.id,
    type: item.type,
    title: item.title,
    body: log.description,
    href,
    created_at: log.created_at,
  };
}

async function syncNotificationsForUser(db: SupabaseAny, userId: string) {
  const { data, error } = await db
    .from("activity_logs")
    .select("id, user_id, order_id, server_order_id, action, description, created_at")
    .eq("user_id", userId)
    .in("action", NOTIFICATION_ACTIONS)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);

  for (const log of (data ?? []) as ActivityLogRow[]) {
    const { error: insertError } = await db
      .from("notifications")
      .insert(notificationFromActivity(log));
    if (insertError && insertError.code !== "23505") {
      console.warn(`[Notifications] sync failed for ${log.id}: ${insertError.message}`);
    }
  }
}

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    await syncNotificationsForUser(db, context.userId);

    const { data, error } = await db
      .from("notifications")
      .select("id, type, title, body, href, read_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);

    const notifications = (data ?? []) as NotificationRow[];
    return {
      notifications,
      unreadCount: notifications.filter((notification) => !notification.read_at).length,
    };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ notificationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    const { error } = await db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.notificationId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseAny;
    const { error } = await db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
