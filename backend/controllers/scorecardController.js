const { query, transaction } = require('../config/database');
const { isUuid } = require('../services/validation');
const { audit } = require('../services/auditService');

const templateSelect = `select t.id, t.name, t.description, t.is_active, t.created_at, t.updated_at,
  coalesce(json_agg(json_build_object('id', i.id, 'name', i.name, 'weight', i.weight, 'position', i.position) order by i.position)
    filter (where i.id is not null), '[]'::json) as items
  from public.scorecard_templates t left join public.scorecard_template_items i on i.template_id = t.id`;

function parse(body) {
  const name = String(body.name || '').trim(); const description = String(body.description || '').trim();
  const items = Array.isArray(body.items) ? body.items.map((item, index) => ({ name: String(item.name || '').trim(), weight: Number(item.weight), position: index + 1 })) : [];
  if (!name || name.length > 100 || description.length > 1000 || !items.length || items.length > 20 || items.some((item) => !item.name || item.name.length > 100 || !Number.isFinite(item.weight) || item.weight <= 0 || item.weight > 100)) return { error: '請填寫模板名稱與 1 至 20 個評分項目；每個權重必須介於 0 至 100。' };
  return { name, description, isActive: body.isActive !== false, items };
}
async function find(id, client) { return (await query(`${templateSelect} where t.id = $1 group by t.id`, [id], client)).rows[0] || null; }
async function list(req, res, next) { try { const where = req.query.includeInactive === 'true' ? '' : 'where t.is_active'; res.json({ templates: (await query(`${templateSelect} ${where} group by t.id order by t.name`)).rows }); } catch (error) { next(error); } }
async function create(req, res, next) { try {
  const data = parse(req.body); if (data.error) return res.status(400).json({ message: data.error });
  const id = await transaction(async (client) => { const template = (await client.query('insert into public.scorecard_templates (name, description, is_active, created_by) values ($1,$2,$3,$4) returning id', [data.name, data.description, data.isActive, req.user.id])).rows[0]; for (const item of data.items) await client.query('insert into public.scorecard_template_items (template_id,name,weight,position) values ($1,$2,$3,$4)', [template.id, item.name, item.weight, item.position]); return template.id; });
  const template = await find(id); await audit(req, 'create', 'scorecard_template', id, { name: data.name, itemCount: data.items.length }); res.status(201).json({ template });
} catch (error) { if (error.code === '23505') return res.status(409).json({ message: '模板名稱已存在。' }); next(error); } }
async function update(req, res, next) { try {
  if (!isUuid(req.params.id)) return res.status(400).json({ message: '模板 ID 格式錯誤。' }); const data = parse(req.body); if (data.error) return res.status(400).json({ message: data.error }); if (!await find(req.params.id)) return res.status(404).json({ message: '找不到評分模板。' });
  await transaction(async (client) => { await client.query('update public.scorecard_templates set name=$1, description=$2, is_active=$3 where id=$4', [data.name, data.description, data.isActive, req.params.id]); await client.query('delete from public.scorecard_template_items where template_id=$1', [req.params.id]); for (const item of data.items) await client.query('insert into public.scorecard_template_items (template_id,name,weight,position) values ($1,$2,$3,$4)', [req.params.id, item.name, item.weight, item.position]); });
  const template = await find(req.params.id); await audit(req, 'update', 'scorecard_template', req.params.id, { name: data.name, itemCount: data.items.length }); res.json({ template });
} catch (error) { if (error.code === '23505') return res.status(409).json({ message: '模板名稱已存在。' }); next(error); } }
async function remove(req, res, next) { try { if (!isUuid(req.params.id)) return res.status(400).json({ message: '模板 ID 格式錯誤。' }); const result = await query('update public.scorecard_templates set is_active=false where id=$1 returning id', [req.params.id]); if (!result.rowCount) return res.status(404).json({ message: '找不到評分模板。' }); await audit(req, 'deactivate', 'scorecard_template', req.params.id); res.status(204).end(); } catch (error) { next(error); } }
module.exports = { list, create, update, remove };
