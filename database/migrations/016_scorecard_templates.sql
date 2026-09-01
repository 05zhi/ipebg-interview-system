begin;

create table if not exists public.scorecard_templates (
  id uuid primary key default gen_random_uuid(), name text not null unique, description text not null default '',
  is_active boolean not null default true, created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint scorecard_templates_name_not_blank check (length(trim(name)) > 0)
);
create table if not exists public.scorecard_template_items (
  id uuid primary key default gen_random_uuid(), template_id uuid not null references public.scorecard_templates(id) on update cascade on delete cascade,
  name text not null, weight numeric(6,2) not null default 1, position smallint not null,
  constraint scorecard_template_items_name_not_blank check (length(trim(name)) > 0),
  constraint scorecard_template_items_weight_valid check (weight > 0 and weight <= 100), unique (template_id, position)
);
alter table public.interviews add column if not exists scorecard_template_id uuid references public.scorecard_templates(id) on delete set null;
create table if not exists public.interview_feedback_scores (
  feedback_id uuid not null references public.interview_feedback(id) on update cascade on delete cascade,
  template_item_id uuid not null references public.scorecard_template_items(id) on update cascade on delete restrict,
  score smallint not null check (score between 1 and 5), primary key (feedback_id, template_item_id)
);
create index if not exists scorecard_template_items_template_idx on public.scorecard_template_items (template_id, position);
do $$ begin if not exists (select 1 from pg_trigger where tgname = 'scorecard_templates_set_updated_at') then
  create trigger scorecard_templates_set_updated_at before update on public.scorecard_templates for each row execute function public.set_updated_at();
end if; end $$;

commit;
