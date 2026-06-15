import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LifeBuoy, MessageSquare, RefreshCw, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/site-header";
import { createTicket, listMyTickets, replyToTicket } from "@/lib/support.functions";
import { toast } from "sonner";

const supportSearchSchema = z.object({
  subject: z.string().optional(),
  orderId: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/support")({
  validateSearch: supportSearchSchema,
  head: () => ({ meta: [{ title: "Support · XntServers" }] }),
  component: Support,
});

type TicketMessage = {
  id: string;
  user_id: string;
  is_staff: boolean;
  body: string;
  created_at: string;
};

type Ticket = {
  id: string;
  subject: string;
  status: string;
  priority: string;
  category: string | null;
  created_at: string;
  updated_at: string;
  ticket_messages?: TicketMessage[];
};

function Support() {
  const search = Route.useSearch();
  const fetchTickets = useServerFn(listMyTickets);
  const createTicketFn = useServerFn(createTicket);
  const replyTicketFn = useServerFn(replyToTicket);
  const qc = useQueryClient();

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [body, setBody] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (search.subject) setSubject(search.subject);
    if (search.orderId && !body) {
      setBody(`Bonjour,\n\nJ'ai besoin d'aide pour le serveur/order ${search.orderId}.\n`);
    }
  }, [body, search.orderId, search.subject]);

  const ticketsQuery = useQuery({
    queryKey: ["my-tickets"],
    queryFn: () => fetchTickets(),
  });

  const tickets = (ticketsQuery.data?.tickets ?? []) as Ticket[];

  const create = useMutation({
    mutationFn: () =>
      createTicketFn({
        data: {
          subject,
          category: category || undefined,
          body,
        },
      }),
    onSuccess: () => {
      toast.success("Ticket created");
      setSubject("");
      setCategory("");
      setBody("");
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reply = useMutation({
    mutationFn: (ticketId: string) =>
      replyTicketFn({ data: { ticketId, body: replyDrafts[ticketId] ?? "" } }),
    onSuccess: (_result, ticketId) => {
      toast.success("Reply sent");
      setReplyDrafts((drafts) => ({ ...drafts, [ticketId]: "" }));
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="xnt-page min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
              Private beta support
            </div>
            <h1 className="font-display text-4xl font-bold">Support</h1>
            <p className="mt-1 text-muted-foreground">Open a ticket and follow staff replies.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => ticketsQuery.refetch()}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
        </div>

        <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
          <section className="xnt-card rounded-xl p-5">
            <div className="mb-4 flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-primary" />
              <h2 className="font-display text-xl font-semibold">New ticket</h2>
            </div>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Subject"
                maxLength={160}
                required
              />
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Category, optional"
                maxLength={80}
              />
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Describe the issue…"
                className="min-h-[160px]"
                required
              />
              <Button
                type="submit"
                disabled={create.isPending || subject.trim().length < 3 || body.trim().length < 3}
                className="w-full bg-primary text-primary-foreground shadow-[0_0_26px_rgba(0,191,255,0.2)] hover:bg-primary/90"
              >
                <Send className="mr-1.5 h-4 w-4" />
                {create.isPending ? "Creating…" : "Create ticket"}
              </Button>
            </form>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <h2 className="font-display text-xl font-semibold">Your tickets</h2>
            </div>

            {ticketsQuery.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading tickets…</div>
            ) : ticketsQuery.error ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {(ticketsQuery.error as Error).message}
              </div>
            ) : tickets.length === 0 ? (
              <div className="xnt-card rounded-xl border-dashed p-8 text-sm text-muted-foreground">
                No support tickets yet.
              </div>
            ) : (
              tickets.map((ticket) => (
                <article key={ticket.id} className="xnt-card rounded-xl">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 p-4">
                    <div>
                      <h3 className="font-display text-lg font-semibold">{ticket.subject}</h3>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Created {formatDate(ticket.created_at)}
                      </div>
                    </div>
                    <Badge variant="outline" className={`capitalize xnt-status-${ticket.status}`}>
                      {ticket.status}
                    </Badge>
                  </div>
                  <div className="space-y-3 p-4">
                    {(ticket.ticket_messages ?? []).map((message) => (
                      <div
                        key={message.id}
                        className={`rounded-lg border p-3 ${
                          message.is_staff
                            ? "border-primary/30 bg-primary/10 shadow-[0_0_20px_rgba(0,191,255,0.08)]"
                            : "border-border/60 bg-background/40"
                        }`}
                      >
                        <div className="mb-1 text-xs text-muted-foreground">
                          {message.is_staff ? "Staff" : "You"} · {formatDate(message.created_at)}
                        </div>
                        <p className="whitespace-pre-wrap text-sm">{message.body}</p>
                      </div>
                    ))}
                    <form
                      className="flex flex-col gap-2 sm:flex-row"
                      onSubmit={(e) => {
                        e.preventDefault();
                        reply.mutate(ticket.id);
                      }}
                    >
                      <Input
                        value={replyDrafts[ticket.id] ?? ""}
                        onChange={(e) =>
                          setReplyDrafts((drafts) => ({
                            ...drafts,
                            [ticket.id]: e.target.value,
                          }))
                        }
                        placeholder="Reply…"
                      />
                      <Button
                        type="submit"
                        disabled={reply.isPending || !(replyDrafts[ticket.id] ?? "").trim()}
                      >
                        Reply
                      </Button>
                    </form>
                  </div>
                </article>
              ))
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}
