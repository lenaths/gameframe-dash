-- Critical beta hardening: prevent two server_orders for one paid SaaS order.
-- Security/safety note:
-- - additive and non destructive migration
-- - no table drops, data deletes, truncates, or column removals
-- - if duplicates already exist, this migration stops with a clear error
--   so an operator can inspect and resolve them manually.

do $$
declare
  duplicate_count integer;
begin
  select count(*)
  into duplicate_count
  from (
    select order_id
    from public.server_orders
    where order_id is not null
    group by order_id
    having count(*) > 1
  ) duplicates;

  if duplicate_count > 0 then
    raise exception
      'Cannot create unique index idx_server_orders_order_id_unique: % order_id value(s) already have duplicate server_orders. Resolve duplicates manually before applying this migration.',
      duplicate_count;
  end if;
end $$;

create unique index if not exists idx_server_orders_order_id_unique
on public.server_orders(order_id)
where order_id is not null;
