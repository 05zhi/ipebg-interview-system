const { supabase } = require('../config/supabase');
const { isUuid, isTimezone, parseTimeRange, databaseMessage, zonedLocalToIso } = require('../services/validation');

const resources = {
  manager: { ownerTable: 'managers', slotTable: 'manager_available_slots', ownerKey: 'manager_id', label: '主管' },
  candidate: { ownerTable: 'candidates', slotTable: 'candidate_available_slots', ownerKey: 'candidate_id', label: '候選人' },
};

function dateInTimezone(iso, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(iso)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function handlers(type) {
  const resource = resources[type];
  const findOwner = (id) => supabase.from(resource.ownerTable).select('id, is_active').eq('id', id).maybeSingle();

  async function list(req, res, next) {
    try {
      if (!isUuid(req.params.id)) return res.status(400).json({ message: `${resource.label} ID 格式錯誤。` });
      const { data: owner, error: ownerError } = await findOwner(req.params.id);
      if (ownerError) throw ownerError;
      if (!owner) return res.status(404).json({ message: `找不到${resource.label}。` });
      let query = supabase.from(resource.slotTable).select('id, starts_at, ends_at, timezone, location, created_at').eq(resource.ownerKey, req.params.id).order('starts_at');
      if (req.query.from) query = query.gte('ends_at', new Date(req.query.from).toISOString());
      if (req.query.to) query = query.lte('starts_at', new Date(req.query.to).toISOString());
      const { data, error } = await query;
      if (error) throw error;
      res.json({ slots: data });
    } catch (error) {
      if (error instanceof RangeError) return res.status(400).json({ message: '查詢日期格式錯誤。' });
      next(error);
    }
  }

  async function create(req, res, next) {
    try {
      if (!isUuid(req.params.id)) return res.status(400).json({ message: `${resource.label} ID 格式錯誤。` });
      const range = parseTimeRange(req.body);
      if (range.error) return res.status(400).json({ message: range.error });
      const timezone = String(req.body.timezone || '').trim();
      if (!isTimezone(timezone)) return res.status(400).json({ message: '請選擇此時段所在地的有效 IANA 時區。' });
      const location = String(req.body.location || (timezone === 'Asia/Taipei' ? '台灣｜台北／新北／桃園' : timezone)).trim();
      if (!location) return res.status(400).json({ message: '請輸入所在地。' });
      const { data: owner, error: ownerError } = await findOwner(req.params.id);
      if (ownerError) throw ownerError;
      if (!owner?.is_active) return res.status(404).json({ message: `找不到有效的${resource.label}。` });
      const { data, error } = await supabase.from(resource.slotTable)
        .insert({ [resource.ownerKey]: req.params.id, starts_at: range.startsAt, ends_at: range.endsAt, timezone, location })
        .select('id, starts_at, ends_at, timezone, location, created_at').single();
      if (error) {
        const message = databaseMessage(error);
        if (message) return res.status(409).json({ message });
        throw error;
      }
      res.status(201).json({ slot: data });
    } catch (error) { next(error); }
  }

  async function update(req, res, next) {
    try {
      if (!isUuid(req.params.id) || !isUuid(req.params.slotId)) return res.status(400).json({ message: 'ID 格式錯誤。' });
      const range = parseTimeRange(req.body);
      if (range.error) return res.status(400).json({ message: range.error });
      const timezone = String(req.body.timezone || '').trim();
      if (!isTimezone(timezone)) return res.status(400).json({ message: '請選擇此時段所在地的有效 IANA 時區。' });
      const location = String(req.body.location || (timezone === 'Asia/Taipei' ? '台灣｜台北／新北／桃園' : timezone)).trim();
      if (!location) return res.status(400).json({ message: '請輸入所在地。' });
      const { data, error } = await supabase.from(resource.slotTable)
        .update({ starts_at: range.startsAt, ends_at: range.endsAt, timezone, location })
        .eq('id', req.params.slotId).eq(resource.ownerKey, req.params.id)
        .select('id, starts_at, ends_at, timezone, location, created_at').maybeSingle();
      if (error) {
        const message = databaseMessage(error);
        if (message) return res.status(409).json({ message });
        throw error;
      }
      if (!data) return res.status(404).json({ message: '找不到可用時段。' });
      res.json({ slot: data });
    } catch (error) { next(error); }
  }

  async function remove(req, res, next) {
    try {
      if (!isUuid(req.params.id) || !isUuid(req.params.slotId)) return res.status(400).json({ message: 'ID 格式錯誤。' });
      const { data, error } = await supabase.from(resource.slotTable).delete()
        .eq('id', req.params.slotId).eq(resource.ownerKey, req.params.id).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: '找不到可用時段。' });
      res.status(204).end();
    } catch (error) { next(error); }
  }

  async function replaceDay(req, res, next) {
    try {
      if (!isUuid(req.params.id)) return res.status(400).json({ message: `${resource.label} ID 格式錯誤。` });
      const date = String(req.body.date || '');
      const timezone = String(req.body.timezone || '').trim();
      const location = String(req.body.location || (timezone === 'Asia/Taipei' ? '台灣｜台北／新北／桃園' : timezone)).trim();
      const selectedTimes = [...new Set(Array.isArray(req.body.selectedTimes) ? req.body.selectedTimes.map(String) : [])].sort();
      if (!isTimezone(timezone) || !location || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ message: '日期、所在地或時區格式錯誤。' });
      if (selectedTimes.some((time) => !/^(?:[01]\d|2[0-3]):(?:00|30)$/.test(time))) return res.status(400).json({ message: '時段必須以每 30 分鐘為單位。' });
      const { data: owner, error: ownerError } = await findOwner(req.params.id);
      if (ownerError) throw ownerError;
      if (!owner?.is_active) return res.status(404).json({ message: `找不到有效的${resource.label}。` });
      const dayStart = zonedLocalToIso(date, '00:00', timezone);
      const nextDate = new Date(`${date}T00:00:00Z`); nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      const dayEnd = zonedLocalToIso(nextDate.toISOString().slice(0, 10), '00:00', timezone);
      if (!dayStart || !dayEnd) return res.status(400).json({ message: '此日期在所選時區無法建立完整日曆。' });
      const rows = selectedTimes.map((time) => {
        const startsAt = zonedLocalToIso(date, time, timezone);
        return startsAt ? { [resource.ownerKey]: req.params.id, starts_at: startsAt, ends_at: new Date(new Date(startsAt).getTime() + 30 * 60_000).toISOString(), timezone, location } : null;
      });
      if (rows.some((row) => !row)) return res.status(400).json({ message: '部分時間因夏令時間切換而不存在，請重新選擇。' });
      if (type === 'manager') {
        const { data: bookedInterviews, error: bookedError } = await supabase.from('interviews')
          .select('starts_at, ends_at, interview_managers!inner(manager_id)')
          .eq('interview_managers.manager_id', req.params.id).eq('status', 'scheduled')
          .lt('starts_at', dayEnd).gt('ends_at', dayStart);
        if (bookedError) throw bookedError;
        const isStillAvailable = (startsAt, endsAt) => {
          for (let time = new Date(startsAt).getTime(); time < new Date(endsAt).getTime(); time += 30 * 60_000) {
            const next = new Date(time + 30 * 60_000).toISOString();
            if (!rows.some((row) => new Date(row.starts_at) <= new Date(time) && new Date(row.ends_at) >= new Date(next))) return false;
          }
          return true;
        };
        if (bookedInterviews.some((interview) => !isStillAvailable(interview.starts_at, interview.ends_at))) {
          return res.status(409).json({ message: '此日期含有已安排面試的時段；若要修改，請先將面試刪除。' });
        }
      }
      const { data: existingSlots, error: existingError } = await supabase.from(resource.slotTable).select('id, starts_at, timezone').eq(resource.ownerKey, req.params.id);
      if (existingError) throw existingError;
      const replacedIds = existingSlots.filter((slot) => dateInTimezone(slot.starts_at, slot.timezone) === date).map((slot) => slot.id);
      if (replacedIds.length) { const { error: deleteError } = await supabase.from(resource.slotTable).delete().in('id', replacedIds); if (deleteError) throw deleteError; }
      if (rows.length) {
        const { error: insertError } = await supabase.from(resource.slotTable).insert(rows);
        if (insertError) throw insertError;
      }
      res.json({ date, timezone, location, selectedTimes });
    } catch (error) { next(error); }
  }

  return { list, create, update, remove, replaceDay };
}

module.exports = { managerSlots: handlers('manager'), candidateSlots: handlers('candidate') };
