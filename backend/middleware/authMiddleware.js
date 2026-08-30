const jwt = require('jsonwebtoken');
const { query, isConfigured } = require('../config/database');
const { tokenFromRequest } = require('../config/session');
async function authMiddleware(req, res, next) {
  try {
    if (!isConfigured || !process.env.JWT_SECRET) return res.status(503).json({ message: '登入服務尚未設定完成。' });
    const token = tokenFromRequest(req);
    if (!token) return res.status(401).json({ message: '請先登入。' });
    let payload;
    try { payload = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'global-interview-system' }); }
    catch (_error) { return res.status(401).json({ message: '登入已失效，請重新登入。' }); }
    const user = (await query(`select u.id, u.username, u.role, u.is_active, u.created_at
      from public.users u join public.auth_sessions s on s.user_id = u.id
      where u.id = $1 and s.id = $2 and s.revoked_at is null and s.expires_at > now()`, [payload.sub, payload.sid])).rows[0];
    if (!user || !user.is_active) return res.status(401).json({ message: '登入已失效、帳號不存在或已停用。' });
    if (!['administrator', 'hr'].includes(user.role)) return res.status(403).json({ message: '此帳號沒有系統權限。' });
    req.user = user; req.auth = { sessionId: payload.sid }; next();
  } catch (error) { next(error); }
}
function authorize(...roles) { return (req, res, next) => roles.includes(req.user?.role) ? next() : res.status(403).json({ message: '你沒有執行此操作的權限。' }); }
module.exports = { authMiddleware, authorize };
