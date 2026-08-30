const { query, transaction } = require('../config/database');
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
  const findOwner = async (id, client) => (await query(`select id, is_active from public.${resource.ownerTable} where id = $1`, [id], client)).rows[0] || null;

  async function list(req, res, next) {
    try {
      if (!isUuid(req.params.id)) return res.status(400).json({ message: `${resource.label} ID 格式錯誤。` });
      const owner = await findOwner(req.params.id);
      if (!owner) return res.status(404).json({ message: `找不到${resource.label}。` });
      const conditions = [`${resource.ownerKey} = $1`]; const values = [req.params.id];
      if (req.query.from) { values.push(new Date(req.query.from).toISOString()); conditions.push(`ends_at >= $${values.length}`); }
      if (req.query.to) { values.push(new Date(req.query.to).toISOString()); conditions.push(`starts_at <= $${values.length}`); }
      const slots = (await query(`select id, starts_at, ends_at, timezone, location, created_at from public.${resource.slotTable}
        where ${conditions.join(' and ')} order by starts_at`, values)).rows;
      res.json({ slots });
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
      const owner = await findOwner(req.params.id);
      if (!owner?.is_active) return res.status(404).json({ message: `找不到有效的${resource.label}。` });
      const slot = (await query(`insert into public.${resource.slotTable}
        (${resource.ownerKey}, starts_at, ends_at, timezone, location) values ($1, $2, $3, $4, $5)
        returning id, starts_at, ends_at, timezone, location, created_at`,
        [req.params.id, range.startsAt, range.endsAt, timezone, location])).rows[0];
      res.status(201).json({ slot });
    } catch (error) { const message = databaseMessage(error); if (message) return res.status(409).json({ message }); next(error); }
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
      const slot = (await query(`update public.${resource.slotTable}
        set starts_at = $1, ends_at = $2, timezone = $3, location = $4
        where id = $5 and ${resource.ownerKey} = $6
        returning id, starts_at, ends_at, timezone, location, created_at`,
        [range.startsAt, range.endsAt, timezone, location, req.params.slotId, req.params.id])).rows[0];
      if (!slot) return res.status(404).json({ message: '找不到可用時段。' });
      res.json({ slot });
    } catch (error) { const message = databaseMessage(error); if (message) return res.status(409).json({ message }); next(error); }
  }

  async function remove(req, res, next) {
    try {
      if (!isUuid(req.params.id) || !isUuid(req.params.slotId)) return res.status(400).json({ message: 'ID 格式錯誤。' });
      const result = await query(`delete from public.${resource.slotTable} where id = $1 and ${resource.ownerKey} = $2 returning id`, [req.params.slotId, req.params.id]);
      if (!result.rowCount) return res.status(404).json({ message: '找不到可用時段。' });
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
      const owner = await findOwner(req.params.id);
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
      await transaction(async (client) => {
        if (type === 'manager') {
          const bookedInterviews = (await client.query(`select i.starts_at, i.ends_at
            from public.interviews i join public.interview_managers im on im.interview_id = i.id
            where im.manager_id = $1 and i.status = 'scheduled' and i.starts_at < $2 and i.ends_at > $3`,
            [req.params.id, dayEnd, dayStart])).rows;
          const isStillAvailable = (startsAt, endsAt) => {
            for (let time = new Date(startsAt).getTime(); time < new Date(endsAt).getTime(); time += 30 * 60_000) {
              const next = new Date(time + 30 * 60_000).toISOString();
              if (!rows.some((row) => new Date(row.starts_at) <= new Date(time) && new Date(row.ends_at) >= new Date(next))) return false;
            }
            return true;
          };
          if (bookedInterviews.some((interview) => !isStillAvailable(interview.starts_at, interview.ends_at))) {
            const error = new Error('BOOKED_AVAILABILITY'); error.status = 409; throw error;
          }
        }
        const existingSlots = (await client.query(`select id, starts_at, timezone from public.${resource.slotTable} where ${resource.ownerKey} = $1 for update`, [req.params.id])).rows;
        const replacedIds = existingSlots.filter((slot) => dateInTimezone(slot.starts_at, slot.timezone) === date).map((slot) => slot.id);
        if (replacedIds.length) await client.query(`delete from public.${resource.slotTable} where id = any($1::uuid[])`, [replacedIds]);
        for (const row of rows) {
          await client.query(`insert into public.${resource.slotTable} (${resource.ownerKey}, starts_at, ends_at, timezone, location)
            values ($1, $2, $3, $4, $5)`, [req.params.id, row.starts_at, row.ends_at, row.timezone, row.location]);
        }
      });
      res.json({ date, timezone, location, selectedTimes });
    } catch (error) {
      if (error.message === 'BOOKED_AVAILABILITY') return res.status(409).json({ message: '此日期含有已安排面試的時段；若要修改，請先將面試刪除。' });
      const message = databaseMessage(error); if (message) return res.status(409).json({ message }); next(error);
    }
  }

  return { list, create, update, remove, replaceDay };
}

module.exports = { managerSlots: handlers('manager'), candidateSlots: handlers('candidate') };
