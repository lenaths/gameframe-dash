-- XNT Servers private beta notifications.
-- Additive and non destructive: no table/column is dropped or truncated.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_activity_log_id uuid references public.activity_logs(id) on delete set null,
  type text not null,
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_activity_log_id)
);

create index if not exists idx_notifications_user_created
on public.notifications(user_id, created_at desc);

create index if not exists idx_notifications_user_unread
on public.notifications(user_id, created_at desc)
where read_at is null;

alter table public.notifications enable row level security;

grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;

drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications"
on public.notifications for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users mark own notifications read" on public.notifications;
create policy "users mark own notifications read"
on public.notifications for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "admins read all notifications" on public.notifications;
create policy "admins read all notifications"
on public.notifications for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));
