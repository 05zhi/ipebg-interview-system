const { query } = require('../config/database');

function safeDetails(details) {
  const value = JSON.parse(JSON.stringify(details || {}));
  for (const key of ['password', 'password_hash', 'token', 'token_hash', 'authorization']) delete value[key];
  return value;
}

async function audit(req, action, entityType, entityId = null, details = {}) {
  try {
    await query(`insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, details)
      values ($1, $2, $3, $4, $5, $6::jsonb)`,
    [req.user?.id || null, req.user?.role || null, action, entityType, entityId == null ? null : String(entityId), JSON.stringify(safeDetails(details))]);
  } catch (error) { console.error('Could not write audit log:', error.message); }
}

module.exports = { audit };
