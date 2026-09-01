begin;

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.system_settings (key, value) values ('availability_links_enabled', 'false'::jsonb)
on conflict (key) do nothing;

commit;
