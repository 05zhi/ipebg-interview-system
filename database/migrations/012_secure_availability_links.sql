begin;

create table if not exists public.availability_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  subject_type text not null check (subject_type in ('manager', 'candidate')),
  manager_id uuid references public.managers(id) on update cascade on delete cascade,
  candidate_id uuid references public.candidates(id) on update cascade on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint availability_links_subject_valid check (
    (subject_type = 'manager' and manager_id is not null and candidate_id is null) or
    (subject_type = 'candidate' and candidate_id is not null and manager_id is null)
  )
);

create index if not exists availability_links_active_idx on public.availability_links (expires_at) where revoked_at is null;

commit;
