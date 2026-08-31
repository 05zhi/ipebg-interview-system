begin;

alter table public.interviews add column if not exists meeting_provider text;
alter table public.interviews add column if not exists meeting_url text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'interviews_meeting_provider_valid') then
    alter table public.interviews add constraint interviews_meeting_provider_valid
      check (meeting_provider is null or meeting_provider in ('teams', 'google_meet', 'other'));
  end if;
end $$;

create table if not exists public.interview_notifications (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on update cascade on delete cascade,
  recipient_email text not null,
  notification_type text not null check (notification_type in ('invitation', 'reminder')),
  status text not null check (status in ('sent', 'failed')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (interview_id, recipient_email, notification_type)
);

create index if not exists interview_notifications_status_idx on public.interview_notifications (status, created_at desc);

commit;
