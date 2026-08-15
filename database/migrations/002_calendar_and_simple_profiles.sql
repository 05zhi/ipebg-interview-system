-- 已建立 iPEBG 資料庫的升級腳本
-- 執行位置：Supabase Dashboard > SQL Editor

begin;

-- Profile 只保留身份對應、姓名；帳號與密碼位於 public.users。
alter table public.manager_profiles
  drop column if exists department,
  drop column if exists company;

alter table public.applicant_profiles
  drop column if exists phone,
  drop column if exists email,
  drop column if exists resume_url,
  drop column if exists position;

drop index if exists public.manager_profiles_company_department_idx;
drop index if exists public.applicant_profiles_email_idx;
drop index if exists public.applicant_profiles_position_idx;

-- 將既有測試時段統一調整為 30 分鐘，再加上永久限制。
update public.available_slots
   set end_time = start_time + interval '30 minutes'
 where end_time <> start_time + interval '30 minutes';

alter table public.available_slots
  drop constraint if exists available_slots_valid_time;

alter table public.available_slots
  add constraint available_slots_exactly_30_minutes
  check (end_time = start_time + interval '30 minutes');

-- 同一位 applicant 在同一天只能預約一段。
create or replace function public.book_interview_slot()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  selected_slot public.available_slots%rowtype;
begin
  select * into selected_slot
    from public.available_slots
   where id = new.slot_id
   for update;

  if not found then
    raise exception 'Interview slot does not exist.';
  end if;
  if selected_slot.status <> 'available' then
    raise exception 'Interview slot is already booked.';
  end if;
  if selected_slot.manager_id <> new.manager_id then
    raise exception 'Interview manager does not match the slot manager.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.applicant_id::text || selected_slot.date::text, 0)
  );

  if exists (
    select 1
      from public.interviews i
      join public.available_slots s on s.id = i.slot_id
     where i.applicant_id = new.applicant_id
       and s.date = selected_slot.date
  ) then
    raise exception 'Applicant already has an interview on this date.';
  end if;

  update public.available_slots set status = 'booked' where id = new.slot_id;
  return new;
end;
$$;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

commit;
