const bcrypt = require('bcrypt');
const { query, transaction } = require('../config/database');
const { isUuid } = require('../services/validation');
const { updateClause } = require('../services/sql');
const selectAccount = `select h.id, h.name, h.email, h.created_at, h.updated_at,
  json_build_object('id', u.id, 'username', u.username, 'role', u.role, 'is_active', u.is_active, 'created_at', u.created_at) as user
  from public.hr_accounts h join public.users u on u.id = h.user_id`;
async function findAccount(id, client) { return (await query(`${selectAccount} where h.id = $1`, [id], client)).rows[0] || null; }
async function list(_req, res, next) { try { res.json({ accounts: (await query(`${selectAccount} order by h.created_at desc`)).rows }); } catch (error) { next(error); } }
async function create(req, res, next) {
  try {
    const username = String(req.body.username || '').trim(); const password = String(req.body.password || ''); const name = String(req.body.name || '').trim(); const email = String(req.body.email || '').trim() || null;
    if (username.length < 3) return res.status(400).json({ message: 'Username 至少需要 3 個字元。' });
    if (password.length < 8) return res.status(400).json({ message: '密碼至少需要 8 個字元。' });
    if (!name) return res.status(400).json({ message: '請輸入 HR 姓名。' });
    const passwordHash = await bcrypt.hash(password, 12);
    const account = await transaction(async (client) => {
      const user = (await client.query(`insert into public.users (username, password_hash, role)
        values ($1, $2, 'hr') returning id, username, role, is_active, created_at`, [username, passwordHash])).rows[0];
      const profile = (await client.query(`insert into public.hr_accounts (user_id, name, email)
        values ($1, $2, $3) returning id, name, email, created_at, updated_at`, [user.id, name, email])).rows[0];
      return { ...profile, user };
    });
    res.status(201).json({ account });
  } catch (error) { if (error.code === '23505') return res.status(409).json({ message: 'Username 已被使用。' }); next(error); }
}
async function update(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: 'HR 帳號 ID 格式不正確。' });
    const profile = (await query('select id, user_id from public.hr_accounts where id = $1', [req.params.id])).rows[0];
    if (!profile) return res.status(404).json({ message: '找不到 HR 帳號。' });
    const profileChanges = {}; const userChanges = {};
    if (req.body.name !== undefined) { const name = String(req.body.name).trim(); if (!name) return res.status(400).json({ message: 'HR 姓名不可空白。' }); profileChanges.name = name; }
    if (req.body.email !== undefined) profileChanges.email = String(req.body.email).trim() || null;
    if (req.body.username !== undefined) { const username = String(req.body.username).trim(); if (username.length < 3) return res.status(400).json({ message: 'Username 至少需要 3 個字元。' }); userChanges.username = username; }
    if (req.body.isActive !== undefined) userChanges.is_active = Boolean(req.body.isActive);
    if (req.body.password) { if (String(req.body.password).length < 8) return res.status(400).json({ message: '密碼至少需要 8 個字元。' }); userChanges.password_hash = await bcrypt.hash(String(req.body.password), 12); }
    await transaction(async (client) => {
      const profileUpdate = updateClause(profileChanges, ['name', 'email']);
      if (profileUpdate.clause) await client.query(`update public.hr_accounts set ${profileUpdate.clause} where id = $${profileUpdate.values.length + 1}`, [...profileUpdate.values, profile.id]);
      const userUpdate = updateClause(userChanges, ['username', 'is_active', 'password_hash']);
      if (userUpdate.clause) await client.query(`update public.users set ${userUpdate.clause} where id = $${userUpdate.values.length + 1}`, [...userUpdate.values, profile.user_id]);
      if (userChanges.password_hash || userChanges.is_active === false) {
        await client.query('update public.auth_sessions set revoked_at = now() where user_id = $1 and revoked_at is null', [profile.user_id]);
      }
    });
    res.json({ account: await findAccount(profile.id) });
  } catch (error) { if (error.code === '23505') return res.status(409).json({ message: 'Username 已被使用。' }); next(error); }
}
async function remove(req, res, next) { try { if (!isUuid(req.params.id)) return res.status(400).json({ message: 'HR 帳號 ID 格式不正確。' }); const result = await query(`delete from public.users where role = 'hr' and id = (select user_id from public.hr_accounts where id = $1) returning id`, [req.params.id]); if (!result.rowCount) return res.status(404).json({ message: '找不到 HR 帳號。' }); res.status(204).end(); } catch (error) { next(error); } }
module.exports = { list, create, update, remove };
