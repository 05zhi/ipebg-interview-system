const { supabase } = require('../config/supabase');
const { isUuid } = require('../services/validation');

const fields = 'id, name, email, notes, is_active, created_at, updated_at, department:departments!department_id(id, name)';

function managerPayload(body, partial = false) {
  const result = {};
  const required = ['name'];
  for (const key of required) {
    if (!partial || body[key] !== undefined) result[key] = String(body[key] || '').trim();
  }
  if (!partial || body.email !== undefined) result.email = String(body.email || '').trim() || null;
  if (!partial || body.notes !== undefined) result.notes = String(body.notes || '').trim();
  if (body.isActive !== undefined) result.is_active = Boolean(body.isActive);
  if (!partial || body.departmentId !== undefined) {
    if (!isUuid(body.departmentId)) return { error: '請選擇有效的部門。' };
    result.department_id = body.departmentId;
  }
  const missing = required.find((key) => Object.hasOwn(result, key) && !result[key]);
  if (missing) return { error: `${missing} 為必填欄位。` };
  return { data: result };
}

async function list(req, res, next) {
  try {
    let query = supabase.from('managers').select(fields).order('name');
    if (req.query.includeInactive !== 'true') query = query.eq('is_active', true);
    if (req.query.search) query = query.ilike('name', `%${String(req.query.search).trim()}%`);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ managers: data });
  } catch (error) { next(error); }
}

async function get(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: '主管 ID 格式錯誤。' });
    const { data, error } = await supabase.from('managers').select(fields).eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: '找不到主管。' });
    res.json({ manager: data });
  } catch (error) { next(error); }
}

async function create(req, res, next) {
  try {
    const payload = managerPayload(req.body);
    if (payload.error) return res.status(400).json({ message: payload.error });
    const { data, error } = await supabase.from('managers').insert({ ...payload.data, created_by: req.user.id }).select(fields).single();
    if (error) throw error;
    res.status(201).json({ manager: data });
  } catch (error) { next(error); }
}

async function update(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: '主管 ID 格式錯誤。' });
    const payload = managerPayload(req.body, true);
    if (payload.error) return res.status(400).json({ message: payload.error });
    if (!Object.keys(payload.data).length) return res.status(400).json({ message: '沒有可更新的欄位。' });
    const { data, error } = await supabase.from('managers').update(payload.data).eq('id', req.params.id).select(fields).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: '找不到主管。' });
    res.json({ manager: data });
  } catch (error) { next(error); }
}

async function remove(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: '主管 ID 格式錯誤。' });
    const { data, error } = await supabase.from('managers').update({ is_active: false }).eq('id', req.params.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ message: '找不到主管。' });
    res.status(204).end();
  } catch (error) { next(error); }
}

module.exports = { list, get, create, update, remove };
