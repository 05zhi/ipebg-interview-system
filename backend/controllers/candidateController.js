const { query } = require('../config/database');
const { isUuid } = require('../services/validation');
const { updateClause } = require('../services/sql');

const selectCandidate = `select c.id, c.name, c.email, c.phone, c.position, c.notes, c.is_active, c.created_at, c.updated_at,
  json_build_object('id', d.id, 'name', d.name) as department
  from public.candidates c join public.departments d on d.id = c.department_id`;

async function findCandidate(id, client) {
  return (await query(`${selectCandidate} where c.id = $1`, [id], client)).rows[0] || null;
}

function candidatePayload(body, partial = false) {
  const result = {};
  const required = ['name', 'position'];
  for (const key of required) {
    if (!partial || body[key] !== undefined) result[key] = String(body[key] || '').trim();
  }
  for (const key of ['email', 'phone']) {
    if (!partial || body[key] !== undefined) result[key] = String(body[key] || '').trim() || null;
  }
  if (!partial || body.notes !== undefined) result.notes = String(body.notes || '').trim();
  if (body.isActive !== undefined) result.is_active = Boolean(body.isActive);
  if (!partial || body.departmentId !== undefined) {
    if (!isUuid(body.departmentId)) return { error: '請選擇有效的部門。' };
    result.department_id = body.departmentId;
  }
  const missing = required.find((key) => Object.hasOwn(result, key) && !result[key]);
  if (missing) return { error: `${missing} 為必填欄位。` };
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) return { error: 'Email 格式不正確。' };
  return { data: result };
}

async function list(req, res, next) {
  try {
    const conditions = []; const values = [];
    if (req.query.includeInactive !== 'true') conditions.push('c.is_active = true');
    if (req.query.search) { values.push(`%${String(req.query.search).trim()}%`); conditions.push(`c.name ilike $${values.length}`); }
    if (req.query.departmentId && isUuid(req.query.departmentId)) { values.push(req.query.departmentId); conditions.push(`c.department_id = $${values.length}`); }
    const where = conditions.length ? `where ${conditions.join(' and ')}` : '';
    const candidates = (await query(`${selectCandidate} ${where} order by c.name`, values)).rows;
    res.json({ candidates });
  } catch (error) { next(error); }
}

async function get(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: '候選人 ID 格式錯誤。' });
    const candidate = await findCandidate(req.params.id);
    if (!candidate) return res.status(404).json({ message: '找不到候選人。' });
    res.json({ candidate });
  } catch (error) { next(error); }
}

async function create(req, res, next) {
  try {
    const payload = candidatePayload(req.body);
    if (payload.error) return res.status(400).json({ message: payload.error });
    const result = await query(`insert into public.candidates (name, email, phone, position, department_id, notes, created_by)
      values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [payload.data.name, payload.data.email, payload.data.phone, payload.data.position, payload.data.department_id, payload.data.notes, req.user.id]);
    res.status(201).json({ candidate: await findCandidate(result.rows[0].id) });
  } catch (error) { next(error); }
}

async function update(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: '候選人 ID 格式錯誤。' });
    const payload = candidatePayload(req.body, true);
    if (payload.error) return res.status(400).json({ message: payload.error });
    if (!Object.keys(payload.data).length) return res.status(400).json({ message: '沒有可更新的欄位。' });
    const update = updateClause(payload.data, ['name', 'email', 'phone', 'position', 'notes', 'is_active', 'department_id']);
    const result = await query(`update public.candidates set ${update.clause} where id = $${update.values.length + 1} returning id`, [...update.values, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: '找不到候選人。' });
    res.json({ candidate: await findCandidate(req.params.id) });
  } catch (error) { next(error); }
}

async function remove(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: '候選人 ID 格式錯誤。' });
    const result = await query('update public.candidates set is_active = false where id = $1 returning id', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: '找不到候選人。' });
    res.status(204).end();
  } catch (error) { next(error); }
}

module.exports = { list, get, create, update, remove };
