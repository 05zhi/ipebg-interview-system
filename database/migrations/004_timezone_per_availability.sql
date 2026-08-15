-- Timezone belongs to each availability slot because participants may travel.
begin;

alter table public.manager_available_slots add column if not exists timezone text;
alter table public.candidate_available_slots add column if not exists timezone text;

update public.manager_available_slots slot
set timezone = manager.timezone
from public.managers manager
where slot.manager_id = manager.id and slot.timezone is null;

update public.candidate_available_slots slot
set timezone = candidate.timezone
from public.candidates candidate
where slot.candidate_id = candidate.id and slot.timezone is null;

alter table public.manager_available_slots alter column timezone set not null;
alter table public.candidate_available_slots alter column timezone set not null;
alter table public.manager_available_slots add constraint manager_slots_timezone_not_blank check (length(trim(timezone)) > 0);
alter table public.candidate_available_slots add constraint candidate_slots_timezone_not_blank check (length(trim(timezone)) > 0);

alter table public.managers drop column if exists country;
alter table public.managers drop column if exists timezone;
alter table public.candidates drop column if exists timezone;

commit;
