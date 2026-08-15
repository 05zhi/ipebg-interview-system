const { supabase } = require('../config/supabase');
const { isUuid } = require('../services/validation');

const fields = 'id, name, notes, is_active, created_at, updated_at';

async function list(req, res, next) {
  try {
    let query = supabase.from('departments').select(fields).order('name');
    if (req.query.includeInactive !== 'true') query = query.eq('is_active', true);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ departments: data });
  } catch (error) { next(error); }
}

async function create(req, res, next) {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: '請輸入部門名稱。' });
    const { data, error } = await supabase.from('departments').insert({ name, notes: String(req.body.notes || '').trim(), created_by: req.user.id }).select(fields).single();
    if (error?.code === '23505') return res.status(409).json({ message: '部門名稱已存在。' });
    if (error) throw error;
    res.status(201).json({ department: data });
  } catch (error) { next(error); }
}

async function update(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: '部門 ID 格式錯誤。' });
    const changes = {};
    if (req.body.name !== undefined) {
      changes.name = String(req.body.name).trim();
      if (!changes.name) return res.status(400).json({ message: '部門名稱不可為空白。' });
    }
    if (req.body.notes !== undefined) changes.notes = String(req.body.notes).trim();
    if (req.body.isActive !== undefined) changes.is_active = Boolean(req.body.isActive);
    const { data, error } = await supabase.from('departments').update(changes).eq('id', req.params.id).select(fields).maybeSingle();
    if (error?.code === '23505') return res.status(409).json({ message: '部門名稱已存在。' });
    if (error) throw error;
    if (!data) return res.status(404).json({ message: '找不到部門。' });
    res.json({ department: data });
  } catch (error) { next(error); }
}

async function remove(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: '部門 ID 格式錯誤。' });
    const { data, error } = await supabase.from('departments').delete().eq('id', req.params.id).select('id').maybeSingle();
    if (error?.code === '23503') return res.status(409).json({ message: '此部門仍有主管或面試者使用，無法刪除。請先移轉或刪除相關人員。' });
    if (error) throw error;
    if (!data) return res.status(404).json({ message: '找不到部門。' });
    res.status(204).end();
  } catch (error) { next(error); }
}

module.exports = { list, create, update, remove };
