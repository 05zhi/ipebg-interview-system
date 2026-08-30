const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query, transaction, isConfigured } = require('../config/database');

function configurationReady(res) {
  if (!isConfigured) { res.status(503).json({ message: 'Neon 尚未設定完成。' }); return false; }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) { res.status(503).json({ message: 'JWT_SECRET 尚未設定或長度不足。' }); return false; }
  return true;
}
async function login(req, res, next) {
  try {
    if (!configurationReady(res)) return;
    const username = String(req.body.username || '').trim(); const password = String(req.body.password || '');
    if (!username || !password) return res.status(400).json({ message: '請輸入帳號與密碼。' });
    const user = (await query('select id, username, password_hash, role, is_active from public.users where username = $1', [username])).rows[0];
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
    if (req.user.role === 'hr') profile = (await query('select id, name, email from public.hr_accounts where user_id = $1', [req.user.id])).rows[0] || null;
    res.json({ user: req.user, profile });
  } catch (error) { next(error); }
}
async function changePassword(req, res, next) {
  try {
    const currentPassword = String(req.body.currentPassword || ''); const newPassword = String(req.body.newPassword || '');
    if (newPassword.length < 8) return res.status(400).json({ message: '新密碼至少需要 8 個字元。' });
    if (currentPassword === newPassword) return res.status(400).json({ message: '新密碼不可與目前密碼相同。' });
    const user = (await query('select password_hash from public.users where id = $1', [req.user.id])).rows[0];
    if (!await bcrypt.compare(currentPassword, user.password_hash)) return res.status(400).json({ message: '目前密碼不正確。' });
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await query('update public.users set password_hash = $1 where id = $2', [passwordHash, req.user.id]);
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
    const duplicate = (await query('select id from public.users where username = $1 and id <> $2', [username, req.user.id])).rows[0];
    if (duplicate) return res.status(409).json({ message: 'Username 已被使用。' });
    const user = await transaction(async (client) => {
      await client.query('update public.hr_accounts set name = $1, email = $2 where user_id = $3', [name, email, req.user.id]);
      return (await client.query('update public.users set username = $1 where id = $2 returning id, username, role, is_active, created_at', [username, req.user.id])).rows[0];
    });
    res.json({ user, profile: { name, email } });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'Username 已被使用。' });
    next(error);
  }
}
function logout(_req, res) { res.status(204).end(); }
module.exports = { login, logout, me, changePassword, updateProfile };
