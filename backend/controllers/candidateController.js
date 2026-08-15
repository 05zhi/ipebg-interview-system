const { supabase } = require('../config/supabase');
const { isUuid } = require('../services/validation');

const fields = 'id, name, email, phone, position, notes, is_active, created_at, updated_at, department:departments!department_id(id, name)';

function candidatePayload(body, partial = false) {
  const result = {};
  const required = ['name', 'position'];
  for (const key of required) {
    if (!partial || body[key] !== undefined) result[key] = String(body[key] || '').trim();
  }
  for (const key of ['email', 'phone']) {
    if (!partial || body[key] !== undefined) result[key] = String(body[key] || '').trim() || null;
  }
  if (!partial || body.notes !== undefined) result.notes = String(body.notes || '').trim();
  if (body.isActive !== undefined) result.is_active = Boolean(body.isActive);
  if (!partial || body.departmentId !== undefined) {
    if (!isUuid(body.departmentId)) return { error: '請選擇有效的部門。' };
    result.department_id = body.departmentId;
  }
  const missing = required.find((key) => Object.hasOwn(result, key) && !result[key]);
  if (missing) return { error: `${missing} 為必填欄位。` };
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) return { error: 'Email 格式不正確。' };
  return { data: result };
}

async function list(req, res, next) {
  try {
    let query = supabase.from('candidates').select(fields).order('name');
    if (req.query.includeInactive !== 'true') query = query.eq('is_active', true);
    if (req.query.search) query = query.ilike('name', `%${String(req.query.search).trim()}%`);
    if (req.query.departmentId && isUuid(req.query.departmentId)) query = query.eq('department_id', req.query.departmentId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ candidates: data });
  } catch (error) { next(error); }
}

async function get(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: '候選人 ID 格式錯誤。' });
    const { data, error } = await supabase.from('candidates').select(fields).eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: '找不到候選人。' });
    res.json({ candidate: data });
  } catch (error) { next(error); }
}

async function create(req, res, next) {
  try {
    const payload = candidatePayload(req.body);
    if (payload.error) return res.status(400).json({ message: payload.error });
    const { data, error } = await supabase.from('candidates').insert({ ...payload.data, created_by: req.user.id }).select(fields).single();
    if (error) throw error;
    res.status(201).json({ candidate: data });
  } catch (error) { next(error); }
}

async function update(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: '候選人 ID 格式錯誤。' });
    const payload = candidatePayload(req.body, true);
    if (payload.error) return res.status(400).json({ message: payload.error });
    if (!Object.keys(payload.data).length) return res.status(400).json({ message: '沒有可更新的欄位。' });
    const { data, error } = await supabase.from('candidates').update(payload.data).eq('id', req.params.id).select(fields).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: '找不到候選人。' });
    res.json({ candidate: data });
  } catch (error) { next(error); }
}

async function remove(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: '候選人 ID 格式錯誤。' });
    const { data, error } = await supabase.from('candidates').update({ is_active: false }).eq('id', req.params.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: '找不到候選人。' });
    res.status(204).end();
  } catch (error) { next(error); }
}

module.exports = { list, get, create, update, remove };
