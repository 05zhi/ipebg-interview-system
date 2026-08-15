-- HR-managed department master data.
begin;

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notes text not null default '',
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint departments_name_not_blank check (length(trim(name)) > 0),
  constraint departments_name_unique unique (name)
);

insert into public.departments (name)
select distinct trim(department) from (
  select department from public.managers
  union all
  select department from public.candidates
) source
where trim(department) <> ''
on conflict (name) do nothing;

alter table public.managers add column if not exists department_id uuid references public.departments(id) on update cascade on delete restrict;
alter table public.candidates add column if not exists department_id uuid references public.departments(id) on update cascade on delete restrict;
update public.managers manager set department_id = department.id from public.departments department where department.name = manager.department and manager.department_id is null;
update public.candidates candidate set department_id = department.id from public.departments department where department.name = candidate.department and candidate.department_id is null;
alter table public.managers alter column department_id set not null;
alter table public.candidates alter column department_id set not null;
alter table public.managers drop column if exists department;
alter table public.candidates drop column if exists department;

create index if not exists departments_active_name_idx on public.departments (is_active, lower(name));
create index if not exists managers_department_idx on public.managers (department_id);
create index if not exists candidates_department_position_idx on public.candidates (department_id, position);
create trigger departments_set_updated_at before update on public.departments for each row execute function public.set_updated_at();
alter table public.departments enable row level security;
revoke all on public.departments from anon, authenticated;
grant all privileges on public.departments to service_role;

commit;
