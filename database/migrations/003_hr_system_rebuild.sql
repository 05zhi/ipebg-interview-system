-- One-time migration from the old manager/applicant login system.
-- Existing administrator users are preserved. Old test scheduling data is removed.

begin;

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

drop table if exists public.interview_managers cascade;
drop table if exists public.interviews cascade;
drop table if exists public.candidate_available_slots cascade;
drop table if exists public.candidates cascade;
drop table if exists public.manager_available_slots cascade;
drop table if exists public.available_slots cascade;
drop table if exists public.applicant_profiles cascade;
drop table if exists public.manager_profiles cascade;
drop table if exists public.hr_accounts cascade;
drop table if exists public.managers cascade;
drop table if exists public.departments cascade;

drop function if exists public.book_interview_slot() cascade;
drop function if exists public.release_interview_slot() cascade;
drop function if exists public.prevent_manager_interview_overlap() cascade;
drop function if exists public.set_updated_at() cascade;

alter table public.users alter column role type text using role::text;
delete from public.users where role in ('manager', 'applicant', 'hr');
update public.users set role = 'administrator' where role = 'admin';

drop type if exists public.user_role cascade;
drop type if exists public.slot_status cascade;
drop type if exists public.booking_status cascade;
drop type if exists public.interview_status cascade;
drop type if exists public.system_role cascade;

create type public.system_role as enum ('administrator', 'hr');
create type public.interview_status as enum ('scheduled', 'completed', 'cancelled');

alter table public.users alter column role type public.system_role using role::public.system_role;
alter table public.users add column if not exists is_active boolean not null default true;
alter table public.users add column if not exists updated_at timestamptz not null default now();

create table public.hr_accounts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null unique references public.users(id) on update cascade on delete cascade,
  name text not null check (length(trim(name)) > 0), email text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(), name text not null unique check (length(trim(name)) > 0),
  notes text not null default '', is_active boolean not null default true, created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.managers (
  id uuid primary key default gen_random_uuid(), name text not null check (length(trim(name)) > 0), email text,
  department_id uuid not null references public.departments(id) on update cascade on delete restrict, notes text not null default '', is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.manager_available_slots (
  id uuid primary key default gen_random_uuid(), manager_id uuid not null references public.managers(id) on update cascade on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null, timezone text not null check (length(trim(timezone)) > 0), created_at timestamptz not null default now(),
  constraint manager_slots_valid_range check (ends_at > starts_at), constraint manager_slots_unique_start unique (manager_id, starts_at),
  constraint manager_slots_no_overlap exclude using gist (manager_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
);

create table public.candidates (
  id uuid primary key default gen_random_uuid(), name text not null check (length(trim(name)) > 0),
  email text not null check (length(trim(email)) > 0), phone text not null, position text not null check (length(trim(position)) > 0),
  department_id uuid not null references public.departments(id) on update cascade on delete restrict,
  notes text not null default '', is_active boolean not null default true, created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.candidate_available_slots (
  id uuid primary key default gen_random_uuid(), candidate_id uuid not null references public.candidates(id) on update cascade on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null, timezone text not null check (length(trim(timezone)) > 0), created_at timestamptz not null default now(),
  constraint candidate_slots_valid_range check (ends_at > starts_at), constraint candidate_slots_unique_start unique (candidate_id, starts_at),
  constraint candidate_slots_no_overlap exclude using gist (candidate_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
);

create table public.interviews (
  id uuid primary key default gen_random_uuid(), candidate_id uuid not null references public.candidates(id) on update cascade on delete restrict,
  starts_at timestamptz not null, ends_at timestamptz not null, status public.interview_status not null default 'scheduled', notes text not null default '',
  created_by uuid references public.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint interviews_valid_range check (ends_at > starts_at),
  constraint candidate_interviews_no_overlap exclude using gist (candidate_id with =, tstzrange(starts_at, ends_at, '[)') with &&) where (status <> 'cancelled')
);

create table public.interview_managers (
  interview_id uuid not null references public.interviews(id) on update cascade on delete cascade,
  manager_id uuid not null references public.managers(id) on update cascade on delete restrict,
  created_at timestamptz not null default now(), primary key (interview_id, manager_id)
);

create index users_role_active_idx on public.users (role, is_active);
create index hr_accounts_name_idx on public.hr_accounts (lower(name));
create index departments_active_name_idx on public.departments (is_active, lower(name));
create index managers_active_name_idx on public.managers (is_active, lower(name));
create index managers_department_idx on public.managers (department_id);
create index manager_slots_range_idx on public.manager_available_slots (manager_id, starts_at, ends_at);
create index candidates_active_name_idx on public.candidates (is_active, lower(name));
create index candidates_department_position_idx on public.candidates (department_id, position);
create index candidate_slots_range_idx on public.candidate_available_slots (candidate_id, starts_at, ends_at);
create index interviews_start_status_idx on public.interviews (starts_at, status);
create index interviews_candidate_idx on public.interviews (candidate_id, starts_at desc);
create index interview_managers_manager_idx on public.interview_managers (manager_id, interview_id);

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;
create trigger users_set_updated_at before update on public.users for each row execute function public.set_updated_at();
create trigger hr_accounts_set_updated_at before update on public.hr_accounts for each row execute function public.set_updated_at();
create trigger departments_set_updated_at before update on public.departments for each row execute function public.set_updated_at();
create trigger managers_set_updated_at before update on public.managers for each row execute function public.set_updated_at();
create trigger candidates_set_updated_at before update on public.candidates for each row execute function public.set_updated_at();
create trigger interviews_set_updated_at before update on public.interviews for each row execute function public.set_updated_at();

create or replace function public.prevent_manager_interview_overlap() returns trigger language plpgsql set search_path = public as $$
declare target_interview public.interviews%rowtype;
begin
  select * into target_interview from public.interviews where id = new.interview_id;
  if target_interview.status <> 'cancelled' and exists (
    select 1 from public.interview_managers im join public.interviews i on i.id = im.interview_id
    where im.manager_id = new.manager_id and im.interview_id <> new.interview_id and i.status <> 'cancelled'
      and tstzrange(i.starts_at, i.ends_at, '[)') && tstzrange(target_interview.starts_at, target_interview.ends_at, '[)')
  ) then raise exception 'Manager already has an interview during this time.'; end if;
  return new;
end; $$;
create trigger interview_managers_prevent_overlap before insert or update on public.interview_managers
for each row execute function public.prevent_manager_interview_overlap();

create or replace function public.save_interview(
  p_interview_id uuid, p_candidate_id uuid, p_manager_ids uuid[], p_starts_at timestamptz,
  p_ends_at timestamptz, p_status public.interview_status, p_notes text, p_created_by uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare result_id uuid; manager_id_value uuid;
begin
  if p_ends_at <= p_starts_at then raise exception 'INVALID_TIME_RANGE'; end if;
  if cardinality(p_manager_ids) < 1 then raise exception 'MANAGER_REQUIRED'; end if;
  if cardinality(p_manager_ids) <> (select count(distinct value) from unnest(p_manager_ids) value) then raise exception 'DUPLICATE_MANAGER'; end if;
  if not exists (select 1 from candidates where id = p_candidate_id and is_active) then raise exception 'CANDIDATE_NOT_FOUND'; end if;
  if (select count(*) from managers where id = any(p_manager_ids) and is_active) <> cardinality(p_manager_ids) then raise exception 'MANAGER_NOT_FOUND'; end if;
  if p_status <> 'cancelled' and not exists (select 1 from candidate_available_slots where candidate_id = p_candidate_id and starts_at <= p_starts_at and ends_at >= p_ends_at) then raise exception 'CANDIDATE_UNAVAILABLE'; end if;
  if p_status <> 'cancelled' and exists (select 1 from unnest(p_manager_ids) selected(manager_id) where not exists (select 1 from manager_available_slots slot where slot.manager_id = selected.manager_id and slot.starts_at <= p_starts_at and slot.ends_at >= p_ends_at)) then raise exception 'MANAGER_UNAVAILABLE'; end if;
  if p_interview_id is null then
    insert into interviews (candidate_id, starts_at, ends_at, status, notes, created_by) values (p_candidate_id, p_starts_at, p_ends_at, p_status, coalesce(p_notes, ''), p_created_by) returning id into result_id;
  else
    update interviews set candidate_id = p_candidate_id, starts_at = p_starts_at, ends_at = p_ends_at, status = p_status, notes = coalesce(p_notes, '') where id = p_interview_id returning id into result_id;
    if result_id is null then raise exception 'INTERVIEW_NOT_FOUND'; end if;
    delete from interview_managers where interview_id = result_id;
  end if;
  foreach manager_id_value in array p_manager_ids loop
    insert into interview_managers (interview_id, manager_id) values (result_id, manager_id_value);
  end loop;
  return result_id;
end;
$$;


alter table public.users enable row level security;
alter table public.hr_accounts enable row level security;
alter table public.departments enable row level security;
alter table public.managers enable row level security;
alter table public.manager_available_slots enable row level security;
alter table public.candidates enable row level security;
alter table public.candidate_available_slots enable row level security;
alter table public.interviews enable row level security;
alter table public.interview_managers enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

commit;
