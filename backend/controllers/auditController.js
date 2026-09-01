const { query } = require('../config/database');

async function list(req, res, next) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const logs = (await query(`select a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at,
      json_build_object('id', u.id, 'username', u.username, 'role', u.role) as actor
      from public.audit_logs a left join public.users u on u.id = a.actor_id
      order by a.created_at desc limit $1`, [limit])).rows;
    res.json({ logs });
  } catch (error) { next(error); }
}

module.exports = { list };
