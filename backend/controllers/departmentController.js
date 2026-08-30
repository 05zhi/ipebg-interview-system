const { query } = require('../config/database');
const { isUuid } = require('../services/validation');
const { updateClause } = require('../services/sql');

const fields = 'id, name, notes, is_active, created_at, updated_at';

async function list(req, res, next) {
  try {
    const where = req.query.includeInactive === 'true' ? '' : 'where is_active = true';
    const departments = (await query(`select ${fields} from public.departments ${where} order by name`)).rows;
    res.json({ departments });
  } catch (error) { next(error); }
}

async function create(req, res, next) {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: '請輸入部門名稱。' });
    const department = (await query(`insert into public.departments (name, notes, created_by) values ($1, $2, $3) returning ${fields}`,
      [name, String(req.body.notes || '').trim(), req.user.id])).rows[0];
    res.status(201).json({ department });
  } catch (error) { if (error.code === '23505') return res.status(409).json({ message: '部門名稱已存在。' }); next(error); }
}

async function update(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: '部門 ID 格式錯誤。' });
    const changes = {};
    if (req.body.name !== undefined) {
      changes.name = String(req.body.name).trim();
      if (!changes.name) return res.status(400).json({ message: '部門名稱不可為空白。' });
    }
    if (req.body.notes !== undefined) changes.notes = String(req.body.notes).trim();
    if (req.body.isActive !== undefined) changes.is_active = Boolean(req.body.isActive);
    const update = updateClause(changes, ['name', 'notes', 'is_active']);
    if (!update.clause) return res.status(400).json({ message: '沒有可更新的欄位。' });
    const department = (await query(`update public.departments set ${update.clause} where id = $${update.values.length + 1} returning ${fields}`,
      [...update.values, req.params.id])).rows[0];
    if (!department) return res.status(404).json({ message: '找不到部門。' });
    res.json({ department });
  } catch (error) { if (error.code === '23505') return res.status(409).json({ message: '部門名稱已存在。' }); next(error); }
}

async function remove(req, res, next) {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ message: '部門 ID 格式錯誤。' });
    const result = await query('update public.departments set is_active = false where id = $1 returning id', [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ message: '找不到部門。' });
    res.status(204).end();
  } catch (error) { next(error); }
}

module.exports = { list, create, update, remove };
