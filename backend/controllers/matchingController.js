const { query } = require('../config/database');
const { isUuid } = require('../services/validation');
const { findCommonSlots, localTime } = require('../services/matchingService');

async function findMatches(req, res, next) {
  try {
    const candidateId = String(req.body.candidateId || '');
    const managerIds = [...new Set(Array.isArray(req.body.managerIds) ? req.body.managerIds.map(String) : [])];
    const durationMinutes = Number(req.body.durationMinutes || 30);
    const rangeStart = new Date(req.body.rangeStart);
    const rangeEnd = new Date(req.body.rangeEnd);
    if (!isUuid(candidateId)) return res.status(400).json({ message: '請選擇有效的候選人。' });
    if (!managerIds.length || managerIds.some((id) => !isUuid(id))) return res.status(400).json({ message: '請至少選擇一位有效主管。' });
    if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime()) || rangeEnd <= rangeStart) {
      return res.status(400).json({ message: '查詢起訖時間不正確。' });
    }
    if (rangeEnd - rangeStart > 93 * 24 * 60 * 60 * 1000) return res.status(400).json({ message: '單次最多查詢 93 天。' });
    if (!Number.isInteger(durationMinutes) || durationMinutes < 30 || durationMinutes > 480 || durationMinutes % 30) {
      return res.status(400).json({ message: '面試長度必須是 30 分鐘的倍數，且介於 30 至 480 分鐘。' });
    }

    const [candidateResult, managerResult] = await Promise.all([
      query('select id, name from public.candidates where id = $1 and is_active = true', [candidateId]),
      query(`select m.id, m.name, json_build_object('name', d.name) as department
        from public.managers m join public.departments d on d.id = m.department_id
        where m.id = any($1::uuid[]) and m.is_active = true`, [managerIds]),
    ]);
    const candidate = candidateResult.rows[0]; const managers = managerResult.rows;
    if (!candidate) return res.status(404).json({ message: '找不到有效的候選人。' });
    if (managers.length !== managerIds.length) return res.status(404).json({ message: '部分主管不存在或已停用。' });

    const from = rangeStart.toISOString();
    const to = rangeEnd.toISOString();
    const [candidateSlotResult, managerSlotResult, bookedResult] = await Promise.all([
      query(`select starts_at, ends_at, timezone, location from public.candidate_available_slots
        where candidate_id = $1 and starts_at < $2 and ends_at > $3`, [candidateId, to, from]),
      query(`select manager_id, starts_at, ends_at, timezone, location from public.manager_available_slots
        where manager_id = any($1::uuid[]) and starts_at < $2 and ends_at > $3`, [managerIds, to, from]),
      query(`select i.candidate_id, i.starts_at, i.ends_at,
        coalesce(array_agg(im.manager_id) filter (where im.manager_id is not null), '{}') as manager_ids
        from public.interviews i left join public.interview_managers im on im.interview_id = i.id
        where i.status <> 'cancelled' and i.starts_at < $1 and i.ends_at > $2
        group by i.id`, [to, from]),
    ]);
    const candidateSlots = candidateSlotResult.rows; const managerSlots = managerSlotResult.rows; const bookedInterviews = bookedResult.rows;

    const orderedManagers = managerIds.map((id) => managers.find((manager) => manager.id === id));
    const groups = [candidateSlots, ...orderedManagers.map((manager) => managerSlots.filter((slot) => slot.manager_id === manager.id))];
    const availabilityFor = (slots, match) => slots.find((source) => new Date(source.starts_at) <= new Date(match.startsAt) && new Date(source.ends_at) > new Date(match.startsAt));
    // Availability means a person is willing to meet; it does not by itself mean they
    // are unbooked. Remove every common slot overlapping an existing, non-cancelled
    // interview for the selected candidate or any selected manager.
    const isBooked = (slot) => bookedInterviews.some((interview) => {
      const overlaps = new Date(interview.starts_at) < new Date(slot.endsAt) && new Date(interview.ends_at) > new Date(slot.startsAt);
      if (!overlaps) return false;
      if (interview.candidate_id === candidateId) return true;
      return (interview.manager_ids || []).some((managerId) => managerIds.includes(managerId));
    });
    const matches = findCommonSlots(groups, from, to, durationMinutes, 30).filter((slot) => !isBooked(slot)).map((slot) => {
      const candidateAvailability = availabilityFor(candidateSlots, slot); const candidateTimezone = candidateAvailability?.timezone;
      return ({
      ...slot,
      utc: { startsAt: slot.startsAt, endsAt: slot.endsAt },
      participants: [
        { type: 'candidate', id: candidate.id, name: candidate.name, timezone: candidateTimezone, location: candidateAvailability?.location,
          startsAtLocal: localTime(slot.startsAt, candidateTimezone), endsAtLocal: localTime(slot.endsAt, candidateTimezone) },
        ...orderedManagers.map((manager) => { const availability = availabilityFor(managerSlots.filter((source) => source.manager_id === manager.id), slot); const timezone = availability?.timezone; return ({ type: 'manager', id: manager.id, name: manager.name,
          department: manager.department?.name, timezone, location: availability?.location,
          startsAtLocal: localTime(slot.startsAt, timezone), endsAtLocal: localTime(slot.endsAt, timezone) }); }),
      ],
    }); });
    res.json({ matches, candidate, managers: orderedManagers, durationMinutes });
  } catch (error) { next(error); }
}

module.exports = { findMatches };
