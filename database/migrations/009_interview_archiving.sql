begin;

alter table public.interviews add column if not exists archived_at timestamptz;

create index if not exists interviews_active_start_idx
  on public.interviews (starts_at desc)
  where archived_at is null;

commit;
