-- Game catalog / server templates foundation.
-- Security/safety note:
-- - additive and non destructive migration
-- - no table drops, data deletes, truncates, or column removals
-- - existing plans.allowed_eggs remains the application fallback
-- - internal provider IDs stay server/admin-only

create table if not exists public.game_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  icon_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.server_templates (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.game_catalog(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  provider text not null default 'internal',
  internal_nest_id integer not null,
  internal_egg_id integer not null,
  docker_image text,
  startup text,
  environment jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint server_templates_game_slug_unique unique (game_id, slug)
);

create table if not exists public.server_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.server_templates(id) on delete cascade,
  label text not null,
  minecraft_version text,
  loader text,
  loader_version text,
  java_version text,
  environment_overrides jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint server_template_versions_template_label_unique unique (template_id, label)
);

create table if not exists public.plan_template_compatibilities (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  template_id uuid not null references public.server_templates(id) on delete cascade,
  min_ram_mb integer,
  recommended_ram_mb integer,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_template_compatibilities_unique unique (plan_id, template_id)
);

create index if not exists idx_game_catalog_active_sort
on public.game_catalog(is_active, sort_order);

create index if not exists idx_server_templates_game_active_sort
on public.server_templates(game_id, is_active, sort_order);

create index if not exists idx_server_template_versions_template_active_sort
on public.server_template_versions(template_id, is_active, sort_order);

create index if not exists idx_plan_template_compatibilities_plan_active_sort
on public.plan_template_compatibilities(plan_id, is_active, sort_order);

create index if not exists idx_plan_template_compatibilities_template
on public.plan_template_compatibilities(template_id);

grant select on public.game_catalog to anon, authenticated;
grant select on public.server_templates to anon, authenticated;
grant select on public.server_template_versions to anon, authenticated;
grant select on public.plan_template_compatibilities to anon, authenticated;
grant all on public.game_catalog to service_role;
grant all on public.server_templates to service_role;
grant all on public.server_template_versions to service_role;
grant all on public.plan_template_compatibilities to service_role;

alter table public.game_catalog enable row level security;
alter table public.server_templates enable row level security;
alter table public.server_template_versions enable row level security;
alter table public.plan_template_compatibilities enable row level security;

drop policy if exists "public reads active game catalog" on public.game_catalog;
create policy "public reads active game catalog"
on public.game_catalog for select
to anon, authenticated
using (is_active = true or public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins manage game catalog" on public.game_catalog;
create policy "admins manage game catalog"
on public.game_catalog for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "public reads active server templates" on public.server_templates;
create policy "public reads active server templates"
on public.server_templates for select
to anon, authenticated
using (
  is_active = true
  or public.has_role(auth.uid(), 'admin')
);

drop policy if exists "admins manage server templates" on public.server_templates;
create policy "admins manage server templates"
on public.server_templates for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "public reads active template versions" on public.server_template_versions;
create policy "public reads active template versions"
on public.server_template_versions for select
to anon, authenticated
using (
  is_active = true
  or public.has_role(auth.uid(), 'admin')
);

drop policy if exists "admins manage template versions" on public.server_template_versions;
create policy "admins manage template versions"
on public.server_template_versions for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "public reads active plan template compatibilities" on public.plan_template_compatibilities;
create policy "public reads active plan template compatibilities"
on public.plan_template_compatibilities for select
to anon, authenticated
using (
  is_active = true
  or public.has_role(auth.uid(), 'admin')
);

drop policy if exists "admins manage plan template compatibilities" on public.plan_template_compatibilities;
create policy "admins manage plan template compatibilities"
on public.plan_template_compatibilities for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop trigger if exists trg_game_catalog_updated on public.game_catalog;
create trigger trg_game_catalog_updated
before update on public.game_catalog
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_server_templates_updated on public.server_templates;
create trigger trg_server_templates_updated
before update on public.server_templates
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_server_template_versions_updated on public.server_template_versions;
create trigger trg_server_template_versions_updated
before update on public.server_template_versions
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_plan_template_compatibilities_updated on public.plan_template_compatibilities;
create trigger trg_plan_template_compatibilities_updated
before update on public.plan_template_compatibilities
for each row execute function public.update_updated_at_column();

-- Backfill games from active plans.
insert into public.game_catalog (slug, name, description, sort_order, metadata)
select distinct
  lower(regexp_replace(p.game, '[^a-zA-Z0-9]+', '-', 'g')) as slug,
  p.game as name,
  p.game || ' server hosting',
  min(p.sort_order) over (partition by p.game),
  jsonb_build_object('backfilled_from', 'plans.game')
from public.plans p
where p.game is not null
on conflict (slug) do update
set
  name = excluded.name,
  description = coalesce(public.game_catalog.description, excluded.description),
  sort_order = least(public.game_catalog.sort_order, excluded.sort_order);

-- Backfill template rows from allowed_eggs when present, otherwise plan default configuration.
with plan_variants as (
  select
    p.id as plan_id,
    p.game,
    coalesce(nullif(v.value->>'label', ''), p.name) as template_name,
    coalesce((v.value->>'nest_id')::integer, p.pterodactyl_nest_id) as nest_id,
    coalesce((v.value->>'egg_id')::integer, p.pterodactyl_egg_id) as egg_id,
    nullif(v.value->>'docker_image', '') as docker_image,
    nullif(v.value->>'startup', '') as startup,
    p.environment as plan_environment,
    coalesce(v.ordinality::integer - 1, 0) as variant_index,
    p.ram_mb
  from public.plans p
  left join lateral jsonb_array_elements(
    case
      when jsonb_typeof(p.allowed_eggs) = 'array' and jsonb_array_length(p.allowed_eggs) > 0 then p.allowed_eggs
      else jsonb_build_array(jsonb_build_object(
        'label', p.name,
        'nest_id', p.pterodactyl_nest_id,
        'egg_id', p.pterodactyl_egg_id,
        'docker_image', p.docker_image,
        'startup', p.startup
      ))
    end
  ) with ordinality as v(value, ordinality) on true
  where p.is_active = true
),
templates as (
  insert into public.server_templates (
    game_id,
    slug,
    name,
    description,
    provider,
    internal_nest_id,
    internal_egg_id,
    docker_image,
    startup,
    environment,
    sort_order,
    metadata
  )
  select distinct on (g.id, lower(regexp_replace(pv.template_name, '[^a-zA-Z0-9]+', '-', 'g')))
    g.id,
    lower(regexp_replace(pv.template_name, '[^a-zA-Z0-9]+', '-', 'g')) as slug,
    pv.template_name,
    case
      when lower(pv.template_name) like '%paper%' then 'Performance optimisée pour serveurs avec plugins.'
      when lower(pv.template_name) like '%forge%' then 'Serveur prêt pour mods Forge.'
      when lower(pv.template_name) like '%fabric%' then 'Serveur prêt pour mods Fabric.'
      when lower(pv.template_name) like '%purpur%' then 'Performances avancées et réglages poussés.'
      when lower(pv.template_name) like '%spigot%' then 'Compatibilité plugins classiques.'
      when lower(pv.template_name) like '%vanilla%' then 'Expérience officielle Minecraft, simple et stable.'
      else 'Template serveur compatible.'
    end,
    'internal',
    pv.nest_id,
    pv.egg_id,
    pv.docker_image,
    pv.startup,
    '{}'::jsonb,
    pv.variant_index,
    jsonb_build_object('backfilled_from', 'plans.allowed_eggs')
  from plan_variants pv
  join public.game_catalog g on g.slug = lower(regexp_replace(pv.game, '[^a-zA-Z0-9]+', '-', 'g'))
  where pv.nest_id is not null and pv.egg_id is not null
  order by
    g.id,
    lower(regexp_replace(pv.template_name, '[^a-zA-Z0-9]+', '-', 'g')),
    pv.variant_index
  on conflict (game_id, slug) do update
  set
    name = excluded.name,
    description = coalesce(public.server_templates.description, excluded.description),
    provider = excluded.provider,
    internal_nest_id = excluded.internal_nest_id,
    internal_egg_id = excluded.internal_egg_id,
    docker_image = coalesce(public.server_templates.docker_image, excluded.docker_image),
    startup = coalesce(public.server_templates.startup, excluded.startup),
    sort_order = least(public.server_templates.sort_order, excluded.sort_order)
  returning id, game_id, slug
)
insert into public.plan_template_compatibilities (
  plan_id,
  template_id,
  min_ram_mb,
  recommended_ram_mb,
  sort_order,
  metadata
)
select distinct
  pv.plan_id,
  st.id,
  null::integer,
  pv.ram_mb::integer,
  pv.variant_index::integer,
  jsonb_build_object(
    'backfilled_from', 'plans.allowed_eggs',
    'legacy_variant_index', pv.variant_index
  )
from plan_variants pv
join public.game_catalog g on g.slug = lower(regexp_replace(pv.game, '[^a-zA-Z0-9]+', '-', 'g'))
join public.server_templates st
  on st.game_id = g.id
 and st.slug = lower(regexp_replace(pv.template_name, '[^a-zA-Z0-9]+', '-', 'g'))
on conflict (plan_id, template_id) do update
set
  recommended_ram_mb = coalesce(public.plan_template_compatibilities.recommended_ram_mb, excluded.recommended_ram_mb),
  sort_order = least(public.plan_template_compatibilities.sort_order, excluded.sort_order);

-- Minimal default versions for backfilled Minecraft templates.
insert into public.server_template_versions (
  template_id,
  label,
  minecraft_version,
  loader,
  environment_overrides,
  sort_order,
  metadata
)
select
  st.id,
  'latest'::text,
  'latest'::text,
  case
    when lower(st.name) like '%paper%' then 'paper'::text
    when lower(st.name) like '%forge%' then 'forge'::text
    when lower(st.name) like '%fabric%' then 'fabric'::text
    when lower(st.name) like '%purpur%' then 'purpur'::text
    when lower(st.name) like '%spigot%' then 'spigot'::text
    when lower(st.name) like '%vanilla%' then 'vanilla'::text
    else null::text
  end,
  '{}'::jsonb,
  0::integer,
  jsonb_build_object('backfilled_from', 'default_latest')
from public.server_templates st
join public.game_catalog g on g.id = st.game_id
where lower(g.slug) = 'minecraft'
on conflict (template_id, label) do nothing;
