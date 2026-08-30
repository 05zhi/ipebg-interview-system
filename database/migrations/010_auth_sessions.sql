begin;

create table if not exists public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on update cascade on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auth_sessions_user_active_idx
  on public.auth_sessions (user_id, expires_at desc)
  where revoked_at is null;

commit;
