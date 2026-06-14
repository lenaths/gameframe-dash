-- Stripe database preparation.
-- Security/safety note:
-- - additive and non destructive migration
-- - no table drops, data deletes, truncates, or column removals
-- - no Stripe application integration is added here
-- - existing provisioning and SaaS flows remain unchanged

alter table public.profiles
  add column if not exists stripe_customer_id text;

alter table public.plans
  add column if not exists stripe_product_id text,
  add column if not exists stripe_price_id text;

alter table public.orders
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_price_id text,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists trial_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false;

alter table public.payments
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_charge_id text,
  add column if not exists stripe_invoice_id text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_event_id text;

alter table public.invoices
  add column if not exists stripe_invoice_id text,
  add column if not exists stripe_hosted_invoice_url text,
  add column if not exists stripe_invoice_pdf text,
  add column if not exists period_start timestamptz,
  add column if not exists period_end timestamptz;

create table if not exists public.stripe_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  type text not null,
  processed_at timestamptz,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_profiles_stripe_customer_id
on public.profiles(stripe_customer_id)
where stripe_customer_id is not null;

create index if not exists idx_plans_stripe_product_id
on public.plans(stripe_product_id)
where stripe_product_id is not null;

create index if not exists idx_plans_stripe_price_id
on public.plans(stripe_price_id)
where stripe_price_id is not null;

create index if not exists idx_orders_stripe_customer_id
on public.orders(stripe_customer_id)
where stripe_customer_id is not null;

create unique index if not exists idx_orders_stripe_checkout_session_id
on public.orders(stripe_checkout_session_id)
where stripe_checkout_session_id is not null;

create unique index if not exists idx_orders_stripe_subscription_id
on public.orders(stripe_subscription_id)
where stripe_subscription_id is not null;

create index if not exists idx_orders_current_period_end
on public.orders(current_period_end)
where current_period_end is not null;

create index if not exists idx_payments_stripe_payment_intent_id
on public.payments(stripe_payment_intent_id)
where stripe_payment_intent_id is not null;

create index if not exists idx_payments_stripe_invoice_id
on public.payments(stripe_invoice_id)
where stripe_invoice_id is not null;

create index if not exists idx_payments_stripe_checkout_session_id
on public.payments(stripe_checkout_session_id)
where stripe_checkout_session_id is not null;

create unique index if not exists idx_payments_stripe_event_id
on public.payments(stripe_event_id)
where stripe_event_id is not null;

create unique index if not exists idx_invoices_stripe_invoice_id
on public.invoices(stripe_invoice_id)
where stripe_invoice_id is not null;

create index if not exists idx_invoices_period_end
on public.invoices(period_end)
where period_end is not null;

create index if not exists idx_stripe_events_type_created
on public.stripe_events(type, created_at desc);

grant all on public.stripe_events to service_role;
grant select on public.stripe_events to authenticated;

alter table public.stripe_events enable row level security;

drop policy if exists "admins read stripe events" on public.stripe_events;
create policy "admins read stripe events"
on public.stripe_events for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));
