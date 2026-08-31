alter type public.interview_status add value if not exists 'pending_confirmation';
alter type public.interview_status add value if not exists 'confirmed';
alter type public.interview_status add value if not exists 'no_show';

begin;

alter table public.interviews add column if not exists round_number smallint not null default 1;
alter table public.interviews add column if not exists round_name text;
alter table public.interviews add column if not exists hiring_outcome text not null default 'pending';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'interviews_round_number_valid') then
    alter table public.interviews add constraint interviews_round_number_valid check (round_number between 1 and 20);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'interviews_hiring_outcome_valid') then
    alter table public.interviews add constraint interviews_hiring_outcome_valid check (hiring_outcome in ('pending', 'advance', 'reject', 'offer', 'hired', 'withdrawn'));
  end if;
end $$;

create table if not exists public.interview_feedback (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null,
  manager_id uuid not null,
  rating smallint,
  recommendation text not null default 'neutral',
  comments text not null default '',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (interview_id, manager_id) references public.interview_managers(interview_id, manager_id) on update cascade on delete cascade,
  unique (interview_id, manager_id),
  constraint interview_feedback_rating_valid check (rating is null or rating between 1 and 5),
  constraint interview_feedback_recommendation_valid check (recommendation in ('strong_yes', 'yes', 'neutral', 'no', 'strong_no'))
);

create index if not exists interview_feedback_interview_idx on public.interview_feedback (interview_id, updated_at desc);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'interview_feedback_set_updated_at') then
    create trigger interview_feedback_set_updated_at before update on public.interview_feedback
      for each row execute function public.set_updated_at();
  end if;
end $$;

commit;
