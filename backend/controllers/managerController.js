const { query } = require('../config/database');
const { isUuid } = require('../services/validation');
const { updateClause } = require('../services/sql');

const selectManager = `select m.id, m.name, m.email, m.notes, m.is_active, m.created_at, m.updated_at,
  json_build_object('id', d.id, 'name', d.name) as department
  from public.managers m join public.departments d on d.id = m.department_id`;

async function findManager(id, client) {
  return (await query(`${selectManager} where m.id = $1`, [id], client)).rows[0] || null;
}

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
    const conditions = []; const values = [];
    if (req.query.includeInactive !== 'true') conditions.push('m.is_active = true');
    if (req.query.search) { values.push(`%${String(req.query.search).trim()}%`); conditions.push(`m.name ilike $${values.length}`); }
    const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
    const managers = (await query(`${selectManager} ${where} order by m.name`, values)).rows;
    res.json({ managers });
  } catch (error) { next(error); }
}

async function get(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: '主管 ID 格式錯誤。' });
    const manager = await findManager(req.params.id);
    if (!manager) return res.status(404).json({ message: '找不到主管。' });
    res.json({ manager });
  } catch (error) { next(error); }
}

async function create(req, res, next) {
  try {
    const payload = managerPayload(req.body);
    if (payload.error) return res.status(400).json({ message: payload.error });
    const result = await query(`insert into public.managers (name, email, department_id, notes, created_by)
      values ($1, $2, $3, $4, $5) returning id`,
      [payload.data.name, payload.data.email, payload.data.department_id, payload.data.notes, req.user.id]);
    res.status(201).json({ manager: await findManager(result.rows[0].id) });
  } catch (error) { next(error); }
}

async function update(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: '主管 ID 格式錯誤。' });
    const payload = managerPayload(req.body, true);
    if (payload.error) return res.status(400).json({ message: payload.error });
    if (!Object.keys(payload.data).length) return res.status(400).json({ message: '沒有可更新的欄位。' });
    const update = updateClause(payload.data, ['name', 'email', 'notes', 'is_active', 'department_id']);
    const result = await query(`update public.managers set ${update.clause} where id = $${update.values.length + 1} returning id`, [...update.values, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: '找不到主管。' });
    res.json({ manager: await findManager(req.params.id) });
  } catch (error) { next(error); }
}

async function remove(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: '主管 ID 格式錯誤。' });
    const result = await query('update public.managers set is_active = false where id = $1 returning id', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: '找不到主管。' });
    res.status(204).end();
  } catch (error) { next(error); }
}

module.exports = { list, get, create, update, remove };
