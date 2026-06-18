-- Modpack installation job tracking foundation.
-- Security/safety note:
-- - additive and non destructive migration
-- - no table drops, data deletes, truncates, or column removals
-- - this phase only tracks queued/future work; it does not download, extract, or install files
-- - no secrets or CurseForge download URLs are stored here

create table if not exists public.modpack_install_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  server_order_id uuid references public.server_orders(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  modpack_id uuid references public.curseforge_modpacks(id) on delete set null,
  modpack_version_id uuid references public.curseforge_modpack_versions(id) on delete set null,
  curseforge_mod_id integer,
  curseforge_file_id integer,
  server_pack_file_id integer,
  status text not null default 'queued',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  file_length bigint,
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  logs jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint modpack_install_jobs_status_check check (
    status in (
      'queued',
      'downloading',
      'extracting',
      'installing',
      'configuring',
      'ready',
      'failed',
      'cancelled'
    )
  )
);

create unique index if not exists idx_modpack_install_jobs_one_active_per_server
on public.modpack_install_jobs(server_order_id)
where status in ('queued', 'downloading', 'extracting', 'installing', 'configuring');

create index if not exists idx_modpack_install_jobs_user_created
on public.modpack_install_jobs(user_id, created_at desc);

create index if not exists idx_modpack_install_jobs_server_created
on public.modpack_install_jobs(server_order_id, created_at desc);

create index if not exists idx_modpack_install_jobs_status_created
on public.modpack_install_jobs(status, created_at desc);

create index if not exists idx_modpack_install_jobs_modpack
on public.modpack_install_jobs(modpack_id, modpack_version_id);

grant select on public.modpack_install_jobs to authenticated;
grant all on public.modpack_install_jobs to service_role;

alter table public.modpack_install_jobs enable row level security;

drop policy if exists "users read own modpack install jobs" on public.modpack_install_jobs;
create policy "users read own modpack install jobs"
on public.modpack_install_jobs for select
to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins manage modpack install jobs" on public.modpack_install_jobs;
create policy "admins manage modpack install jobs"
on public.modpack_install_jobs for all
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

drop trigger if exists trg_modpack_install_jobs_updated on public.modpack_install_jobs;
create trigger trg_modpack_install_jobs_updated
before update on public.modpack_install_jobs
for each row execute function public.set_updated_at();
