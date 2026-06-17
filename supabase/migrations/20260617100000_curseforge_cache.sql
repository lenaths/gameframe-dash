-- CurseForge cache foundation.
-- Security/safety note:
-- - additive and non destructive migration
-- - no table drops, data deletes, truncates, or column removals
-- - no secrets are stored in these tables
-- - API synchronization will be added later server-side only

create table if not exists public.curseforge_modpacks (
  id uuid primary key default gen_random_uuid(),
  curseforge_mod_id integer not null unique,
  game_id uuid references public.game_catalog(id) on delete set null,
  slug text,
  name text not null,
  summary text,
  logo_url text,
  website_url text,
  download_count bigint,
  class_id integer,
  primary_category_id integer,
  is_active boolean not null default false,
  is_featured boolean not null default false,
  last_synced_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.curseforge_modpack_versions (
  id uuid primary key default gen_random_uuid(),
  modpack_id uuid not null references public.curseforge_modpacks(id) on delete cascade,
  curseforge_file_id integer not null unique,
  display_name text not null,
  file_name text,
  release_type integer,
  file_status integer,
  minecraft_versions text[] not null default '{}'::text[],
  loaders text[] not null default '{}'::text[],
  server_pack_file_id integer,
  is_server_pack boolean not null default false,
  file_date timestamptz,
  file_length bigint,
  download_url_cached boolean not null default false,
  hashes jsonb not null default '{}'::jsonb,
  dependencies jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.curseforge_template_mappings (
  id uuid primary key default gen_random_uuid(),
  modpack_id uuid not null references public.curseforge_modpacks(id) on delete cascade,
  template_id uuid not null references public.server_templates(id) on delete cascade,
  loader text,
  minecraft_version text,
  is_active boolean not null default true,
  priority integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (modpack_id, template_id, loader, minecraft_version)
);

create table if not exists public.curseforge_plan_compatibilities (
  id uuid primary key default gen_random_uuid(),
  modpack_id uuid not null references public.curseforge_modpacks(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete cascade,
  min_ram_mb integer,
  recommended_ram_mb integer,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (modpack_id, plan_id)
);

create index if not exists idx_curseforge_modpacks_mod_id
on public.curseforge_modpacks(curseforge_mod_id);

create index if not exists idx_curseforge_modpacks_game_id
on public.curseforge_modpacks(game_id);

create index if not exists idx_curseforge_modpacks_active_featured
on public.curseforge_modpacks(is_active, is_featured);

create index if not exists idx_curseforge_modpack_versions_modpack_id
on public.curseforge_modpack_versions(modpack_id);

create index if not exists idx_curseforge_modpack_versions_file_id
on public.curseforge_modpack_versions(curseforge_file_id);

create index if not exists idx_curseforge_modpack_versions_minecraft_versions
on public.curseforge_modpack_versions using gin(minecraft_versions);

create index if not exists idx_curseforge_modpack_versions_loaders
on public.curseforge_modpack_versions using gin(loaders);

create index if not exists idx_curseforge_template_mappings_modpack_active
on public.curseforge_template_mappings(modpack_id, is_active);

create index if not exists idx_curseforge_plan_compatibilities_modpack_active
on public.curseforge_plan_compatibilities(modpack_id, is_active);

grant select on public.curseforge_modpacks to anon, authenticated;
grant select on public.curseforge_modpack_versions to anon, authenticated;
grant select on public.curseforge_template_mappings to anon, authenticated;
grant select on public.curseforge_plan_compatibilities to anon, authenticated;
grant all on public.curseforge_modpacks to service_role;
grant all on public.curseforge_modpack_versions to service_role;
grant all on public.curseforge_template_mappings to service_role;
grant all on public.curseforge_plan_compatibilities to service_role;

alter table public.curseforge_modpacks enable row level security;
alter table public.curseforge_modpack_versions enable row level security;
alter table public.curseforge_template_mappings enable row level security;
alter table public.curseforge_plan_compatibilities enable row level security;

drop policy if exists "public reads active curseforge modpacks" on public.curseforge_modpacks;
create policy "public reads active curseforge modpacks"
on public.curseforge_modpacks for select
to anon, authenticated
using (is_active = true or public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins manage curseforge modpacks" on public.curseforge_modpacks;
create policy "admins manage curseforge modpacks"
on public.curseforge_modpacks for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "public reads active curseforge versions" on public.curseforge_modpack_versions;
create policy "public reads active curseforge versions"
on public.curseforge_modpack_versions for select
to anon, authenticated
using (is_active = true or public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins manage curseforge versions" on public.curseforge_modpack_versions;
create policy "admins manage curseforge versions"
on public.curseforge_modpack_versions for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "public reads active curseforge mappings" on public.curseforge_template_mappings;
create policy "public reads active curseforge mappings"
on public.curseforge_template_mappings for select
to anon, authenticated
using (is_active = true or public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins manage curseforge mappings" on public.curseforge_template_mappings;
create policy "admins manage curseforge mappings"
on public.curseforge_template_mappings for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "public reads active curseforge plan compatibilities" on public.curseforge_plan_compatibilities;
create policy "public reads active curseforge plan compatibilities"
on public.curseforge_plan_compatibilities for select
to anon, authenticated
using (is_active = true or public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins manage curseforge plan compatibilities" on public.curseforge_plan_compatibilities;
create policy "admins manage curseforge plan compatibilities"
on public.curseforge_plan_compatibilities for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_curseforge_modpacks_updated on public.curseforge_modpacks;
create trigger trg_curseforge_modpacks_updated
before update on public.curseforge_modpacks
for each row execute function public.set_updated_at();

drop trigger if exists trg_curseforge_modpack_versions_updated on public.curseforge_modpack_versions;
create trigger trg_curseforge_modpack_versions_updated
before update on public.curseforge_modpack_versions
for each row execute function public.set_updated_at();

drop trigger if exists trg_curseforge_template_mappings_updated on public.curseforge_template_mappings;
create trigger trg_curseforge_template_mappings_updated
before update on public.curseforge_template_mappings
for each row execute function public.set_updated_at();

drop trigger if exists trg_curseforge_plan_compatibilities_updated on public.curseforge_plan_compatibilities;
create trigger trg_curseforge_plan_compatibilities_updated
before update on public.curseforge_plan_compatibilities
for each row execute function public.set_updated_at();
