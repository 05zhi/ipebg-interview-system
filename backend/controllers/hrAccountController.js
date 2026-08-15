const bcrypt = require('bcrypt');
const { supabase } = require('../config/supabase');
const { isUuid } = require('../services/validation');
const fields = 'id, name, email, created_at, updated_at, user:users!user_id(id, username, role, is_active, created_at)';
async function list(_req, res, next) { try { const { data, error } = await supabase.from('hr_accounts').select(fields).order('created_at', { ascending: false }); if (error) throw error; res.json({ accounts: data }); } catch (error) { next(error); } }
async function create(req, res, next) {
  let userId;
  try {
    const username = String(req.body.username || '').trim(); const password = String(req.body.password || ''); const name = String(req.body.name || '').trim(); const email = String(req.body.email || '').trim() || null;
    if (username.length < 3) return res.status(400).json({ message: 'Username 至少需要 3 個字元。' });
    if (password.length < 8) return res.status(400).json({ message: '密碼至少需要 8 個字元。' });
    if (!name) return res.status(400).json({ message: '請輸入 HR 姓名。' });
    const passwordHash = await bcrypt.hash(password, 12);
    const { data: user, error: userError } = await supabase.from('users').insert({ username, password_hash: passwordHash, role: 'hr' }).select('id, username, role, is_active').single();
    if (userError?.code === '23505') return res.status(409).json({ message: 'Username 已被使用。' }); if (userError) throw userError; userId = user.id;
    const { data: profile, error } = await supabase.from('hr_accounts').insert({ user_id: user.id, name, email }).select('id, name, email, created_at').single(); if (error) throw error;
    res.status(201).json({ account: { ...profile, user } });
  } catch (error) { if (userId) await supabase.from('users').delete().eq('id', userId); next(error); }
}
async function update(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: 'HR 帳號 ID 格式不正確。' });
    const { data: profile, error: lookupError } = await supabase.from('hr_accounts').select('id, user_id').eq('id', req.params.id).maybeSingle(); if (lookupError) throw lookupError;
    if (!profile) return res.status(404).json({ message: '找不到 HR 帳號。' });
    const profileChanges = {}; const userChanges = {};
    if (req.body.name !== undefined) { const name = String(req.body.name).trim(); if (!name) return res.status(400).json({ message: 'HR 姓名不可空白。' }); profileChanges.name = name; }
    if (req.body.email !== undefined) profileChanges.email = String(req.body.email).trim() || null;
    if (req.body.username !== undefined) { const username = String(req.body.username).trim(); if (username.length < 3) return res.status(400).json({ message: 'Username 至少需要 3 個字元。' }); userChanges.username = username; }
    if (req.body.isActive !== undefined) userChanges.is_active = Boolean(req.body.isActive);
    if (req.body.password) { if (String(req.body.password).length < 8) return res.status(400).json({ message: '密碼至少需要 8 個字元。' }); userChanges.password_hash = await bcrypt.hash(String(req.body.password), 12); }
    if (Object.keys(profileChanges).length) { const { error } = await supabase.from('hr_accounts').update(profileChanges).eq('id', profile.id); if (error) throw error; }
    if (Object.keys(userChanges).length) { const { error } = await supabase.from('users').update(userChanges).eq('id', profile.user_id); if (error?.code === '23505') return res.status(409).json({ message: 'Username 已被使用。' }); if (error) throw error; }
    const { data, error } = await supabase.from('hr_accounts').select(fields).eq('id', profile.id).single(); if (error) throw error; res.json({ account: data });
  } catch (error) { next(error); }
}
async function remove(req, res, next) { try { if (!isUuid(req.params.id)) return res.status(400).json({ message: 'HR 帳號 ID 格式不正確。' }); const { data: profile, error: lookupError } = await supabase.from('hr_accounts').select('user_id').eq('id', req.params.id).maybeSingle(); if (lookupError) throw lookupError; if (!profile) return res.status(404).json({ message: '找不到 HR 帳號。' }); const { error } = await supabase.from('users').delete().eq('id', profile.user_id).eq('role', 'hr'); if (error) throw error; res.status(204).end(); } catch (error) { next(error); } }
module.exports = { list, create, update, remove };
