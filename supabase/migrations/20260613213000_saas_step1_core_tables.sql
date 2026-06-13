-- SaaS step 1: additive core tables.
-- Security/safety note:
-- - additive and non destructive migration
-- - no table drops, data deletes, truncates, or column removals
-- - policy/trigger drops below only replace objects created by this migration
-- This migration is intentionally compatible with the current application:
-- - existing plans and server_orders stay functional
-- - new foreign keys are nullable
-- - backfill creates commercial orders without changing current flows

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'saas_order_status'
  ) then
    create type public.saas_order_status as enum (
      'draft',
      'pending_payment',
      'paid',
      'provisioning',
      'active',
      'suspended',
      'cancelled',
      'failed',
      'refunded'
    );
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'payment_status'
  ) then
    create type public.payment_status as enum (
      'pending',
      'requires_action',
      'authorized',
      'paid',
      'failed',
      'cancelled',
      'refunded',
      'partially_refunded'
    );
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'invoice_status'
  ) then
    create type public.invoice_status as enum (
      'draft',
      'open',
      'paid',
      'void',
      'uncollectible',
      'refunded'
    );
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'ticket_status'
  ) then
    create type public.ticket_status as enum (
      'open',
      'pending',
      'answered',
      'resolved',
      'closed'
    );
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'ticket_priority'
  ) then
    create type public.ticket_priority as enum (
      'low',
      'normal',
      'high',
      'urgent'
    );
  end if;
end $$;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  game text not null,
  description text,
  cover_image_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.plans
  add column if not exists product_id uuid references public.products(id) on delete set null,
  add column if not exists billing_interval text not null default 'monthly',
  add column if not exists setup_fee_cents integer not null default 0,
  add column if not exists currency text not null default 'EUR',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  plan_id uuid references public.plans(id) on delete set null,
  status public.saas_order_status not null default 'draft',
  currency text not null default 'EUR',
  subtotal_cents integer not null default 0,
  tax_cents integer not null default 0,
  total_cents integer not null default 0,
  billing_interval text not null default 'monthly',
  starts_at timestamptz,
  renews_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.server_orders
  add column if not exists order_id uuid references public.orders(id) on delete set null,
  add column if not exists product_id uuid references public.products(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  provider text not null,
  provider_payment_id text,
  status public.payment_status not null default 'pending',
  currency text not null default 'EUR',
  amount_cents integer not null,
  refunded_cents integer not null default 0,
  raw_provider_payload jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  invoice_number text not null unique,
  status public.invoice_status not null default 'draft',
  currency text not null default 'EUR',
  subtotal_cents integer not null default 0,
  tax_cents integer not null default 0,
  total_cents integer not null default 0,
  due_at timestamptz,
  paid_at timestamptz,
  billing_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity integer not null default 1,
  unit_amount_cents integer not null,
  total_cents integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_to uuid references auth.users(id) on delete set null,
  server_order_id uuid references public.server_orders(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  subject text not null,
  status public.ticket_status not null default 'open',
  priority public.ticket_priority not null default 'normal',
  category text,
  last_message_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_staff boolean not null default false,
  body text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  server_order_id uuid references public.server_orders(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  action text not null,
  description text,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  before jsonb,
  after jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_products_active_sort on public.products(is_active, sort_order);
create index if not exists idx_plans_product_id on public.plans(product_id);
create index if not exists idx_orders_user_id on public.orders(user_id);
create index if not exists idx_orders_plan_id on public.orders(plan_id);
create index if not exists idx_server_orders_order_id on public.server_orders(order_id);
create index if not exists idx_server_orders_product_id on public.server_orders(product_id);
create index if not exists idx_payments_user_id on public.payments(user_id);
create index if not exists idx_payments_order_id on public.payments(order_id);
create index if not exists idx_invoices_user_id on public.invoices(user_id);
create index if not exists idx_invoices_order_id on public.invoices(order_id);
create index if not exists idx_invoice_items_invoice_id on public.invoice_items(invoice_id);
create index if not exists idx_tickets_user_id on public.tickets(user_id);
create index if not exists idx_tickets_assigned_to on public.tickets(assigned_to);
create index if not exists idx_ticket_messages_ticket_id on public.ticket_messages(ticket_id);
create index if not exists idx_activity_logs_user_id_created on public.activity_logs(user_id, created_at desc);
create index if not exists idx_activity_logs_server_order_id on public.activity_logs(server_order_id);
create index if not exists idx_audit_logs_actor_created on public.audit_logs(actor_user_id, created_at desc);
create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);

grant select on public.products to anon, authenticated;
grant all on public.products to service_role;
grant select on public.orders to authenticated;
grant all on public.orders to service_role;
grant select on public.payments to authenticated;
grant all on public.payments to service_role;
grant select on public.invoices to authenticated;
grant all on public.invoices to service_role;
grant select on public.invoice_items to authenticated;
grant all on public.invoice_items to service_role;
grant select on public.tickets to authenticated;
grant all on public.tickets to service_role;
grant select on public.ticket_messages to authenticated;
grant all on public.ticket_messages to service_role;
grant select on public.activity_logs to authenticated;
grant all on public.activity_logs to service_role;
grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;

alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.payments enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.activity_logs enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "public reads active products" on public.products;
create policy "public reads active products"
on public.products for select
to anon, authenticated
using (is_active = true or public.has_role(auth.uid(), 'admin'));

drop policy if exists "users read own orders" on public.orders;
create policy "users read own orders"
on public.orders for select
to authenticated
using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

drop policy if exists "users read own payments" on public.payments;
create policy "users read own payments"
on public.payments for select
to authenticated
using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

drop policy if exists "users read own invoices" on public.invoices;
create policy "users read own invoices"
on public.invoices for select
to authenticated
using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

drop policy if exists "users read own invoice items" on public.invoice_items;
create policy "users read own invoice items"
on public.invoice_items for select
to authenticated
using (
  exists (
    select 1
    from public.invoices i
    where i.id = invoice_id
      and (i.user_id = auth.uid() or public.has_role(auth.uid(), 'admin'))
  )
);

drop policy if exists "users read own tickets" on public.tickets;
create policy "users read own tickets"
on public.tickets for select
to authenticated
using (
  auth.uid() = user_id
  or assigned_to = auth.uid()
  or public.has_role(auth.uid(), 'admin')
);

drop policy if exists "users read visible ticket messages" on public.ticket_messages;
create policy "users read visible ticket messages"
on public.ticket_messages for select
to authenticated
using (
  exists (
    select 1
    from public.tickets t
    where t.id = ticket_id
      and (
        t.user_id = auth.uid()
        or t.assigned_to = auth.uid()
        or public.has_role(auth.uid(), 'admin')
      )
  )
);

drop policy if exists "users read own activity logs" on public.activity_logs;
create policy "users read own activity logs"
on public.activity_logs for select
to authenticated
using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins read audit logs" on public.audit_logs;
create policy "admins read audit logs"
on public.audit_logs for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated
before update on public.products
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_saas_orders_updated on public.orders;
create trigger trg_saas_orders_updated
before update on public.orders
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_payments_updated on public.payments;
create trigger trg_payments_updated
before update on public.payments
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_invoices_updated on public.invoices;
create trigger trg_invoices_updated
before update on public.invoices
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_tickets_updated on public.tickets;
create trigger trg_tickets_updated
before update on public.tickets
for each row execute function public.update_updated_at_column();

-- Backfill: default Minecraft product, current plans, and commercial orders.
insert into public.products (slug, name, game, description, sort_order)
values (
  'minecraft',
  'Minecraft',
  'Minecraft',
  'Default Minecraft hosting product created during SaaS step 1 migration.',
  10
)
on conflict (slug) do nothing;

update public.plans p
set product_id = pr.id
from public.products pr
where pr.slug = 'minecraft'
  and p.product_id is null
  and lower(p.game) = 'minecraft';

insert into public.orders (
  user_id,
  product_id,
  plan_id,
  status,
  currency,
  subtotal_cents,
  total_cents,
  billing_interval,
  starts_at,
  metadata,
  created_at,
  updated_at
)
select
  so.user_id,
  p.product_id,
  so.plan_id,
  case
    when so.status = 'active' then 'active'::public.saas_order_status
    when so.status = 'provisioning' then 'provisioning'::public.saas_order_status
    when so.status = 'pending' then 'pending_payment'::public.saas_order_status
    when so.status = 'suspended' then 'suspended'::public.saas_order_status
    when so.status = 'cancelled' then 'cancelled'::public.saas_order_status
    when so.status = 'failed' then 'failed'::public.saas_order_status
    else 'draft'::public.saas_order_status
  end,
  coalesce(p.currency, 'EUR'),
  coalesce(p.price_monthly_cents, 0),
  coalesce(p.price_monthly_cents, 0),
  coalesce(p.billing_interval, 'monthly'),
  so.created_at,
  jsonb_build_object('backfilled_from_server_order_id', so.id),
  so.created_at,
  so.updated_at
from public.server_orders so
join public.plans p on p.id = so.plan_id
where so.order_id is null
  and not exists (
    select 1
    from public.orders o
    where o.metadata->>'backfilled_from_server_order_id' = so.id::text
  );

update public.server_orders so
set
  order_id = o.id,
  product_id = o.product_id
from public.orders o
where so.order_id is null
  and o.metadata->>'backfilled_from_server_order_id' = so.id::text;
