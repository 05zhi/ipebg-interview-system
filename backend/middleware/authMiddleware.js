const jwt = require('jsonwebtoken');
const { query, isConfigured } = require('../config/database');
async function authMiddleware(req, res, next) {
  try {
    if (!isConfigured || !process.env.JWT_SECRET) return res.status(503).json({ message: '登入服務尚未設定完成。' });
    const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (!match) return res.status(401).json({ message: '請先登入。' });
    let payload;
    try { payload = jwt.verify(match[1], process.env.JWT_SECRET, { issuer: 'global-interview-system' }); }
    catch (_error) { return res.status(401).json({ message: '登入已失效，請重新登入。' }); }
    const user = (await query('select id, username, role, is_active, created_at from public.users where id = $1', [payload.sub])).rows[0];
    if (!user || !user.is_active) return res.status(401).json({ message: '帳號不存在或已停用。' });
    if (!['administrator', 'hr'].includes(user.role)) return res.status(403).json({ message: '此帳號沒有系統權限。' });
    req.user = user; next();
  } catch (error) { next(error); }
}
function authorize(...roles) { return (req, res, next) => roles.includes(req.user?.role) ? next() : res.status(403).json({ message: '你沒有執行此操作的權限。' }); }
module.exports = { authMiddleware, authorize };
