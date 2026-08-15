const { supabase } = require('../config/supabase');
const { isUuid, parseTimeRange } = require('../services/validation');

const detailFields = 'id, starts_at, ends_at, status, notes, created_at, updated_at, candidate:candidates!candidate_id(id, name, email, phone, position, department:departments!department_id(id, name)), interview_managers(manager:managers!manager_id(id, name, email, department:departments!department_id(id, name)))';
const statuses = ['scheduled', 'completed', 'cancelled'];

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

async function list(req, res, next) {
  try {
    let query = supabase.from('interviews').select(detailFields).order('starts_at', { ascending: false });
    if (req.query.status && statuses.includes(req.query.status)) query = query.eq('status', req.query.status);
    if (req.query.from) query = query.gte('starts_at', new Date(req.query.from).toISOString());
    if (req.query.to) query = query.lt('starts_at', new Date(req.query.to).toISOString());
    if (req.query.candidateId && isUuid(req.query.candidateId)) query = query.eq('candidate_id', req.query.candidateId);
    const { data, error } = await query;
    if (error) throw error;
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
    const { data, error } = await supabase.from('interviews').select(detailFields).eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: '找不到面試。' });
    res.json({ interview: normalize(data) });
  } catch (error) { next(error); }
}

async function save(req, res, next) {
  try {
    const interviewId = req.params.id || null;
    const candidateId = String(req.body.candidateId || '');
    const managerIds = [...new Set(Array.isArray(req.body.managerIds) ? req.body.managerIds.map(String) : [])];
    const status = String(req.body.status || 'scheduled');
    const range = parseTimeRange(req.body);
    if (interviewId && !isUuid(interviewId)) return res.status(400).json({ message: '面試 ID 格式錯誤。' });
    if (!isUuid(candidateId)) return res.status(400).json({ message: '請選擇有效的候選人。' });
    if (!managerIds.length || managerIds.some((id) => !isUuid(id))) return res.status(400).json({ message: '請至少選擇一位有效主管。' });
    if (range.error) return res.status(400).json({ message: range.error });
    if (!statuses.includes(status)) return res.status(400).json({ message: '面試狀態不正確。' });
    const { data: id, error: rpcError } = await supabase.rpc('save_interview', {
      p_interview_id: interviewId, p_candidate_id: candidateId, p_manager_ids: managerIds,
      p_starts_at: range.startsAt, p_ends_at: range.endsAt, p_status: status,
      p_notes: String(req.body.notes || '').trim(), p_created_by: req.user.id,
    });
    if (rpcError) {
      const known = rpcMessage(rpcError);
      if (known) return res.status(known.status).json({ message: known.message });
      throw rpcError;
    }
    const { data, error } = await supabase.from('interviews').select(detailFields).eq('id', id).single();
    if (error) throw error;
    res.status(interviewId ? 200 : 201).json({ interview: normalize(data) });
  } catch (error) { next(error); }
}

async function remove(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: '面試 ID 格式錯誤。' });
    const { data, error } = await supabase.from('interviews').delete().eq('id', req.params.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: '找不到面試。' });
    res.status(204).end();
  } catch (error) { next(error); }
}

module.exports = { list, get, create: save, update: save, remove };
