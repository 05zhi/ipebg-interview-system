-- Allow an interview to be covered by multiple adjacent availability records.
-- Calendar availability is stored in 30-minute rows, while interviews may be longer.
create or replace function public.save_interview(
  p_interview_id uuid, p_candidate_id uuid, p_manager_ids uuid[], p_starts_at timestamptz,
  p_ends_at timestamptz, p_status public.interview_status, p_notes text, p_created_by uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare result_id uuid; manager_id_value uuid;
begin
  if p_ends_at <= p_starts_at then raise exception 'INVALID_TIME_RANGE'; end if;
  if cardinality(p_manager_ids) < 1 then raise exception 'MANAGER_REQUIRED'; end if;
  if cardinality(p_manager_ids) <> (select count(distinct value) from unnest(p_manager_ids) value) then raise exception 'DUPLICATE_MANAGER'; end if;
  if not exists (select 1 from candidates where id = p_candidate_id and is_active) then raise exception 'CANDIDATE_NOT_FOUND'; end if;
  if (select count(*) from managers where id = any(p_manager_ids) and is_active) <> cardinality(p_manager_ids) then raise exception 'MANAGER_NOT_FOUND'; end if;

  if p_status <> 'cancelled' and not coalesce((
    select range_agg(tstzrange(starts_at, ends_at, '[)')) @> tstzrange(p_starts_at, p_ends_at, '[)')
    from candidate_available_slots where candidate_id = p_candidate_id
  ), false) then raise exception 'CANDIDATE_UNAVAILABLE'; end if;

  if p_status <> 'cancelled' and exists (
    select 1 from unnest(p_manager_ids) selected(manager_id)
    where not coalesce((
      select range_agg(tstzrange(slot.starts_at, slot.ends_at, '[)')) @> tstzrange(p_starts_at, p_ends_at, '[)')
      from manager_available_slots slot where slot.manager_id = selected.manager_id
    ), false)
  ) then raise exception 'MANAGER_UNAVAILABLE'; end if;

  if p_interview_id is null then
    insert into interviews (candidate_id, starts_at, ends_at, status, notes, created_by)
    values (p_candidate_id, p_starts_at, p_ends_at, p_status, coalesce(p_notes, ''), p_created_by)
    returning id into result_id;
  else
    update interviews set candidate_id = p_candidate_id, starts_at = p_starts_at,
      ends_at = p_ends_at, status = p_status, notes = coalesce(p_notes, '')
    where id = p_interview_id returning id into result_id;
    if result_id is null then raise exception 'INTERVIEW_NOT_FOUND'; end if;
    delete from interview_managers where interview_id = result_id;
  end if;

  foreach manager_id_value in array p_manager_ids loop
    insert into interview_managers (interview_id, manager_id) values (result_id, manager_id_value);
  end loop;
  return result_id;
end;
$$;
