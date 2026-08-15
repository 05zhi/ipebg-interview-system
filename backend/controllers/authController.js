const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { supabase, isConfigured } = require('../config/supabase');

function configurationReady(res) {
  if (!isConfigured) { res.status(503).json({ message: 'Supabase 尚未設定完成。' }); return false; }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) { res.status(503).json({ message: 'JWT_SECRET 尚未設定或長度不足。' }); return false; }
  return true;
}
async function login(req, res, next) {
  try {
    if (!configurationReady(res)) return;
    const username = String(req.body.username || '').trim(); const password = String(req.body.password || '');
    if (!username || !password) return res.status(400).json({ message: '請輸入帳號與密碼。' });
    const { data: user, error } = await supabase.from('users').select('id, username, password_hash, role, is_active').eq('username', username).maybeSingle();
    if (error) throw error;
    const validPassword = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!user || !validPassword) return res.status(401).json({ message: '帳號或密碼錯誤。' });
    if (!user.is_active) return res.status(403).json({ message: '此帳號已停用，請聯絡管理員。' });
    if (!['administrator', 'hr'].includes(user.role)) return res.status(403).json({ message: '此帳號沒有系統登入權限。' });
    const token = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h', issuer: 'global-interview-system' });
    res.json({ token, role: user.role, user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) { next(error); }
}
async function me(req, res, next) {
  try {
    let profile = null;
    if (req.user.role === 'hr') { const { data, error } = await supabase.from('hr_accounts').select('id, name, email').eq('user_id', req.user.id).maybeSingle(); if (error) throw error; profile = data; }
    res.json({ user: req.user, profile });
  } catch (error) { next(error); }
}
async function changePassword(req, res, next) {
  try {
    const currentPassword = String(req.body.currentPassword || ''); const newPassword = String(req.body.newPassword || '');
    if (newPassword.length < 8) return res.status(400).json({ message: '新密碼至少需要 8 個字元。' });
    if (currentPassword === newPassword) return res.status(400).json({ message: '新密碼不可與目前密碼相同。' });
    const { data: user, error } = await supabase.from('users').select('password_hash').eq('id', req.user.id).single(); if (error) throw error;
    if (!await bcrypt.compare(currentPassword, user.password_hash)) return res.status(400).json({ message: '目前密碼不正確。' });
    const passwordHash = await bcrypt.hash(newPassword, 12); const { error: updateError } = await supabase.from('users').update({ password_hash: passwordHash }).eq('id', req.user.id); if (updateError) throw updateError;
    res.status(204).end();
  } catch (error) { next(error); }
}
async function updateProfile(req, res, next) {
  try {
    if (req.user.role !== 'hr') return res.status(403).json({ message: '此帳號沒有 HR 個人資料。' });
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim() || null;
    const username = String(req.body.username || '').trim();
    if (!name) return res.status(400).json({ message: '請輸入姓名。' });
    if (username.length < 3) return res.status(400).json({ message: 'Username 至少需要 3 個字元。' });
    const { data: duplicate, error: duplicateError } = await supabase.from('users').select('id').eq('username', username).neq('id', req.user.id).maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) return res.status(409).json({ message: 'Username 已被使用。' });
    const { error: profileError } = await supabase.from('hr_accounts').update({ name, email }).eq('user_id', req.user.id);
    if (profileError) throw profileError;
    const { data: user, error: userError } = await supabase.from('users').update({ username }).eq('id', req.user.id).select('id, username, role, is_active, created_at').single();
    if (userError?.code === '23505') return res.status(409).json({ message: 'Username 已被使用。' });
    if (userError) throw userError;
    res.json({ user, profile: { name, email } });
  } catch (error) { next(error); }
}
function logout(_req, res) { res.status(204).end(); }
module.exports = { login, logout, me, changePassword, updateProfile };
