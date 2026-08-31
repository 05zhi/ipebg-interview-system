const { query, transaction } = require('../config/database');
const { isUuid, parseTimeRange } = require('../services/validation');
const { sendInterviewNotification } = require('../services/notificationService');

const detailSelect = `select i.id, i.starts_at, i.ends_at, i.status, i.notes, i.meeting_provider, i.meeting_url, i.archived_at, i.created_at, i.updated_at,
  json_build_object('id', c.id, 'name', c.name, 'email', c.email, 'phone', c.phone, 'position', c.position,
    'department', json_build_object('id', cd.id, 'name', cd.name)) as candidate,
  coalesce(json_agg(json_build_object('manager', json_build_object('id', m.id, 'name', m.name, 'email', m.email,
    'department', json_build_object('id', md.id, 'name', md.name))) order by m.name)
    filter (where m.id is not null), '[]'::json) as interview_managers
  from public.interviews i
  join public.candidates c on c.id = i.candidate_id
  join public.departments cd on cd.id = c.department_id
  left join public.interview_managers im on im.interview_id = i.id
  left join public.managers m on m.id = im.manager_id
  left join public.departments md on md.id = m.department_id`;
const statuses = ['scheduled', 'completed', 'cancelled'];

async function selectInterviews(where = '', values = [], order = '') {
  return (await query(`${detailSelect} ${where}
    group by i.id, c.id, c.name, c.email, c.phone, c.position, cd.id, cd.name ${order}`, values)).rows;
}

function rpcMessage(error) {
  const text = String(error?.message || '');
  const messages = {
    INVALID_TIME_RANGE: '面試時間範圍不正確。', MANAGER_REQUIRED: '請至少選擇一位主管。',
    DUPLICATE_MANAGER: '主管清單包含重複資料。', CANDIDATE_NOT_FOUND: '找不到有效的候選人。',
    MANAGER_NOT_FOUND: '部分主管不存在或已停用。', CANDIDATE_UNAVAILABLE: '候選人在所選時間沒有空。',
    MANAGER_UNAVAILABLE: '至少一位主管在所選時間沒有空。', INTERVIEW_NOT_FOUND: '找不到面試。',
  };
  const key = Object.keys(messages).find((code) => text.includes(code));
  if (key) return { status: key.endsWith('NOT_FOUND') ? 404 : 409, message: messages[key] };
  if (error?.code === '23P01' || text.includes('already has an interview')) return { status: 409, message: '候選人或主管在此時間已有其他面試。' };
  return null;
}

function normalize(interview) {
  if (!interview) return interview;
  return { ...interview, managers: (interview.interview_managers || []).map((item) => item.manager), interview_managers: undefined };
}

function meetingDetails(value) {
  const meetingUrl = String(value || '').trim();
  if (!meetingUrl) return { meetingUrl: null, meetingProvider: null };
  try {
    const parsed = new URL(meetingUrl);
    if (!['https:', 'http:'].includes(parsed.protocol) || meetingUrl.length > 2048) return { error: '會議連結格式不正確。' };
    const host = parsed.hostname.toLocaleLowerCase();
    return { meetingUrl, meetingProvider: host === 'meet.google.com' ? 'google_meet' : host.includes('teams.microsoft.com') ? 'teams' : 'other' };
  } catch (_error) { return { error: '會議連結格式不正確。' }; }
}

async function list(req, res, next) {
  try {
    const conditions = [req.query.includeArchived === 'true' ? 'true' : 'i.archived_at is null']; const values = [];
    if (req.query.status && statuses.includes(req.query.status)) { values.push(req.query.status); conditions.push(`i.status = $${values.length}`); }
    if (req.query.from) { values.push(new Date(req.query.from).toISOString()); conditions.push(`i.starts_at >= $${values.length}`); }
    if (req.query.to) { values.push(new Date(req.query.to).toISOString()); conditions.push(`i.starts_at < $${values.length}`); }
    if (req.query.candidateId && isUuid(req.query.candidateId)) { values.push(req.query.candidateId); conditions.push(`i.candidate_id = $${values.length}`); }
    const data = await selectInterviews(`where ${conditions.join(' and ')}`, values, 'order by i.starts_at desc');
    const search = String(req.query.search || '').trim().toLocaleLowerCase();
    const interviews = data.map(normalize).filter((item) => !search || [item.candidate?.name, item.candidate?.department?.name,
      item.candidate?.position, item.notes, ...item.managers.flatMap((manager) => [manager.name, manager.department?.name])]
      .some((value) => String(value || '').toLocaleLowerCase().includes(search)));
    res.json({ interviews });
  } catch (error) {
    if (error instanceof RangeError) return res.status(400).json({ message: '日期篩選格式錯誤。' });
    next(error);
  }
}

async function get(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: '面試 ID 格式錯誤。' });
    const interview = (await selectInterviews('where i.id = $1 and i.archived_at is null', [req.params.id]))[0];
    if (!interview) return res.status(404).json({ message: '找不到面試。' });
    res.json({ interview: normalize(interview) });
  } catch (error) { next(error); }
}

async function save(req, res, next) {
  try {
    const interviewId = req.params.id || null;
    const candidateId = String(req.body.candidateId || '');
    const managerIds = [...new Set(Array.isArray(req.body.managerIds) ? req.body.managerIds.map(String) : [])];
    const status = String(req.body.status || 'scheduled');
    const range = parseTimeRange(req.body);
    const rawNotes = String(req.body.notes || '').trim();
    const legacyMeetingUrl = rawNotes.match(/\u200B(https?:\/\/[^\s]+)/i)?.[1] || '';
    const meeting = meetingDetails(req.body.meetingUrl || legacyMeetingUrl);
    const notes = legacyMeetingUrl ? rawNotes.replace(`\u200B${legacyMeetingUrl}`, '').trim() : rawNotes;
    if (interviewId && !isUuid(interviewId)) return res.status(400).json({ message: '面試 ID 格式錯誤。' });
    if (!isUuid(candidateId)) return res.status(400).json({ message: '請選擇有效的候選人。' });
    if (!managerIds.length || managerIds.some((id) => !isUuid(id))) return res.status(400).json({ message: '請至少選擇一位有效主管。' });
    if (range.error) return res.status(400).json({ message: range.error });
    if (!statuses.includes(status)) return res.status(400).json({ message: '面試狀態不正確。' });
    if (meeting.error) return res.status(400).json({ message: meeting.error });
    const id = await transaction(async (client) => {
      const savedId = (await client.query(`select public.save_interview($1::uuid, $2::uuid, $3::uuid[], $4::timestamptz,
        $5::timestamptz, $6::public.interview_status, $7::text, $8::uuid) as id`,
      [interviewId, candidateId, managerIds, range.startsAt, range.endsAt, status, notes, req.user.id])).rows[0].id;
      await client.query('update public.interviews set meeting_url = $1, meeting_provider = $2 where id = $3', [meeting.meetingUrl, meeting.meetingProvider, savedId]);
      return savedId;
    });
    const interview = (await selectInterviews('where i.id = $1 and i.archived_at is null', [id]))[0];
    const normalized = normalize(interview);
    let notification = null;
    if (!interviewId) {
      try { notification = await sendInterviewNotification(normalized, 'invitation'); }
      catch (notificationError) {
        console.error('Interview invitation failed:', notificationError.message);
        notification = { enabled: true, sent: 0, failed: true };
      }
    }
    res.status(interviewId ? 200 : 201).json({ interview: normalized, notification });
  } catch (error) { const known = rpcMessage(error); if (known) return res.status(known.status).json({ message: known.message }); next(error); }
}

async function notify(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: '面試 ID 格式錯誤。' });
    const interview = normalize((await selectInterviews('where i.id = $1 and i.archived_at is null', [req.params.id]))[0]);
    if (!interview) return res.status(404).json({ message: '找不到面試。' });
    res.json({ notification: await sendInterviewNotification(interview, 'invitation') });
  } catch (error) { next(error); }
}

async function remove(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: '面試 ID 格式錯誤。' });
    const result = await query('delete from public.interviews where id = $1 returning id', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: '找不到面試。' });
    res.status(204).end();
  } catch (error) { next(error); }
}

module.exports = { list, get, create: save, update: save, remove, notify };
