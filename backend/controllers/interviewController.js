const { query, transaction } = require('../config/database');
const { isUuid, parseTimeRange } = require('../services/validation');
const { sendInterviewNotification } = require('../services/notificationService');
const { audit } = require('../services/auditService');

const detailSelect = `select i.id, i.starts_at, i.ends_at, i.status, i.notes, i.meeting_provider, i.meeting_url,
  i.round_number, i.round_name, i.hiring_outcome, i.archived_at, i.created_at, i.updated_at,
  case when st.id is null then null else json_build_object('id', st.id, 'name', st.name, 'description', st.description,
    'items', coalesce((select json_agg(json_build_object('id', sti.id, 'name', sti.name, 'weight', sti.weight, 'position', sti.position) order by sti.position) from public.scorecard_template_items sti where sti.template_id = st.id), '[]'::json)) end as scorecard_template,
  json_build_object('id', c.id, 'name', c.name, 'email', c.email, 'phone', c.phone, 'position', c.position,
    'department', json_build_object('id', cd.id, 'name', cd.name)) as candidate,
  coalesce(json_agg(json_build_object('manager', json_build_object('id', m.id, 'name', m.name, 'email', m.email,
    'department', json_build_object('id', md.id, 'name', md.name))) order by m.name)
    filter (where m.id is not null), '[]'::json) as interview_managers,
  coalesce((select json_agg(json_build_object('id', f.id, 'manager_id', f.manager_id, 'manager_name', fm.name,
    'rating', f.rating, 'recommendation', f.recommendation, 'comments', f.comments, 'updated_at', f.updated_at,
    'scores', coalesce((select json_agg(json_build_object('item_id', fs.template_item_id, 'score', fs.score) order by fs.template_item_id) from public.interview_feedback_scores fs where fs.feedback_id = f.id), '[]'::json)) order by fm.name)
    from public.interview_feedback f join public.managers fm on fm.id = f.manager_id where f.interview_id = i.id), '[]'::json) as feedback
  from public.interviews i
  join public.candidates c on c.id = i.candidate_id
  join public.departments cd on cd.id = c.department_id
  left join public.scorecard_templates st on st.id = i.scorecard_template_id
  left join public.interview_managers im on im.interview_id = i.id
  left join public.managers m on m.id = im.manager_id
  left join public.departments md on md.id = m.department_id`;
const statuses = ['pending_confirmation', 'confirmed', 'scheduled', 'completed', 'no_show', 'cancelled'];
const outcomes = ['pending', 'advance', 'reject', 'offer', 'hired', 'withdrawn'];
const recommendations = ['strong_yes', 'yes', 'neutral', 'no', 'strong_no'];

async function selectInterviews(where = '', values = [], order = '') {
  return (await query(`${detailSelect} ${where}
    group by i.id, st.id, c.id, c.name, c.email, c.phone, c.position, cd.id, cd.name ${order}`, values)).rows;
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
    const roundNumber = Number(req.body.roundNumber ?? 1);
    const roundName = String(req.body.roundName || '').trim() || null;
    const hiringOutcome = String(req.body.hiringOutcome || 'pending');
    const scorecardTemplateId = req.body.scorecardTemplateId ? String(req.body.scorecardTemplateId) : null;
    if (interviewId && !isUuid(interviewId)) return res.status(400).json({ message: '面試 ID 格式錯誤。' });
    if (!isUuid(candidateId)) return res.status(400).json({ message: '請選擇有效的候選人。' });
    if (!managerIds.length || managerIds.some((id) => !isUuid(id))) return res.status(400).json({ message: '請至少選擇一位有效主管。' });
    if (range.error) return res.status(400).json({ message: range.error });
    if (!statuses.includes(status)) return res.status(400).json({ message: '面試狀態不正確。' });
    if (meeting.error) return res.status(400).json({ message: meeting.error });
    if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > 20) return res.status(400).json({ message: '面試輪次必須是 1 到 20 的整數。' });
    if ((roundName && roundName.length > 100) || !outcomes.includes(hiringOutcome)) return res.status(400).json({ message: '面試輪次名稱或錄取結果不正確。' });
    if (scorecardTemplateId && !isUuid(scorecardTemplateId)) return res.status(400).json({ message: '評分模板格式錯誤。' });
    const id = await transaction(async (client) => {
      const savedId = (await client.query(`select public.save_interview($1::uuid, $2::uuid, $3::uuid[], $4::timestamptz,
        $5::timestamptz, $6::public.interview_status, $7::text, $8::uuid) as id`,
      [interviewId, candidateId, managerIds, range.startsAt, range.endsAt, status, notes, req.user.id])).rows[0].id;
      await client.query('update public.interviews set meeting_url = $1, meeting_provider = $2 where id = $3', [meeting.meetingUrl, meeting.meetingProvider, savedId]);
      await client.query(`update public.interviews set round_number = $1, round_name = $2, hiring_outcome = $3 where id = $4`,
        [roundNumber, roundName, hiringOutcome, savedId]);
      if (scorecardTemplateId) {
        const template = await client.query('select id from public.scorecard_templates where id=$1 and is_active=true', [scorecardTemplateId]);
        if (!template.rowCount) { const error = new Error('找不到啟用中的評分模板。'); error.status = 400; throw error; }
      }
      await client.query('update public.interviews set scorecard_template_id = $1 where id = $2', [scorecardTemplateId, savedId]);
      return savedId;
    });
    const interview = (await selectInterviews('where i.id = $1 and i.archived_at is null', [id]))[0];
    const normalized = normalize(interview);
    await audit(req, interviewId ? 'update' : 'create', 'interview', id, { status, roundNumber, hiringOutcome, managerCount: managerIds.length, scorecardTemplateId });
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

async function saveFeedback(req, res, next) {
  try {
    if (!isUuid(req.params.id) || !isUuid(req.params.managerId)) return res.status(400).json({ message: '面試或主管 ID 格式錯誤。' });
    const rating = req.body.rating === '' || req.body.rating == null ? null : Number(req.body.rating);
    const recommendation = String(req.body.recommendation || 'neutral');
    const comments = String(req.body.comments || '').trim();
    if ((rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) || !recommendations.includes(recommendation) || comments.length > 5000) {
      return res.status(400).json({ message: '評分、建議或評語格式不正確。' });
    }
    const scores = Array.isArray(req.body.scores) ? req.body.scores : [];
    if (scores.length > 20 || scores.some((entry) => !isUuid(entry.itemId) || !Number.isInteger(Number(entry.score)) || Number(entry.score) < 1 || Number(entry.score) > 5)) return res.status(400).json({ message: '評分項目格式錯誤。' });
    const feedback = await transaction(async (client) => {
      const interview = (await client.query('select scorecard_template_id from public.interviews where id=$1', [req.params.id])).rows[0];
      if (!interview) { const error = new Error('找不到面試紀錄。'); error.code = '23503'; throw error; }
      if (scores.length && !interview.scorecard_template_id) { const error = new Error('此面試未指定評分模板。'); error.status = 400; throw error; }
      if (scores.length) {
        const ids = scores.map((entry) => entry.itemId);
        const valid = await client.query('select id from public.scorecard_template_items where template_id=$1 and id=any($2::uuid[])', [interview.scorecard_template_id, ids]);
        if (valid.rowCount !== new Set(ids).size) { const error = new Error('評分項目不屬於此模板。'); error.status = 400; throw error; }
      }
      const saved = (await client.query(`insert into public.interview_feedback
        (interview_id, manager_id, rating, recommendation, comments, created_by) values ($1, $2, $3, $4, $5, $6)
        on conflict (interview_id, manager_id) do update set rating = excluded.rating, recommendation = excluded.recommendation, comments = excluded.comments, created_by = excluded.created_by
        returning id, interview_id, manager_id, rating, recommendation, comments, updated_at`, [req.params.id, req.params.managerId, rating, recommendation, comments, req.user.id])).rows[0];
      await client.query('delete from public.interview_feedback_scores where feedback_id=$1', [saved.id]);
      for (const entry of scores) await client.query('insert into public.interview_feedback_scores (feedback_id, template_item_id, score) values ($1,$2,$3)', [saved.id, entry.itemId, Number(entry.score)]);
      return saved;
    });
    await audit(req, 'save_feedback', 'interview_feedback', feedback.id, { interviewId: req.params.id, managerId: req.params.managerId, rating, recommendation, scoreCount: scores.length });
    res.json({ feedback });
  } catch (error) {
    if (error?.code === '23503') return res.status(404).json({ message: '找不到此面試的參與主管。' });
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: '面試 ID 格式錯誤。' });
    const result = await query('delete from public.interviews where id = $1 returning id', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: '找不到面試。' });
    await audit(req, 'delete', 'interview', req.params.id); res.status(204).end();
  } catch (error) { next(error); }
}

module.exports = { list, get, create: save, update: save, remove, notify, saveFeedback };
