-- Store a city/location for each availability slot.
alter table public.manager_available_slots add column if not exists location text;
alter table public.candidate_available_slots add column if not exists location text;

update public.manager_available_slots set location = case timezone
  when 'Asia/Taipei' then '台灣｜台北／新北／桃園' when 'Asia/Shanghai' then '中國'
  when 'Asia/Kolkata' then '印度' when 'Asia/Jakarta' then '印尼｜Batam／Jakarta'
  when 'America/Chicago' then '美國｜Houston, Texas' when 'America/Mexico_City' then '墨西哥'
  else timezone end where location is null or length(trim(location)) = 0;
update public.candidate_available_slots set location = case timezone
  when 'Asia/Taipei' then '台灣｜台北／新北／桃園' when 'Asia/Shanghai' then '中國'
  when 'Asia/Kolkata' then '印度' when 'Asia/Jakarta' then '印尼｜Batam／Jakarta'
  when 'America/Chicago' then '美國｜Houston, Texas' when 'America/Mexico_City' then '墨西哥'
  else timezone end where location is null or length(trim(location)) = 0;

alter table public.manager_available_slots alter column location set default '台灣｜台北／新北／桃園';
alter table public.candidate_available_slots alter column location set default '台灣｜台北／新北／桃園';
alter table public.manager_available_slots alter column location set not null;
alter table public.candidate_available_slots alter column location set not null;
alter table public.manager_available_slots drop constraint if exists manager_slots_location_not_blank;
alter table public.candidate_available_slots drop constraint if exists candidate_slots_location_not_blank;
alter table public.manager_available_slots add constraint manager_slots_location_not_blank check (length(trim(location)) > 0);
alter table public.candidate_available_slots add constraint candidate_slots_location_not_blank check (length(trim(location)) > 0);
