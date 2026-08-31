const crypto = require('crypto');
const { query, transaction } = require('../config/database');
const { isUuid } = require('../services/validation');
const { managerSlots, candidateSlots } = require('./availabilityController');

const resources = {
  manager: { table: 'managers', key: 'manager_id', slotTable: 'manager_available_slots', handler: managerSlots, label: '主管' },
  candidate: { table: 'candidates', key: 'candidate_id', slotTable: 'candidate_available_slots', handler: candidateSlots, label: '面試者' },
};

function tokenHash(token) { return crypto.createHash('sha256').update(String(token || '')).digest('hex'); }

function create(type) {
  return async (req, res, next) => {
    try {
      const resource = resources[type];
      if (!isUuid(req.params.id)) return res.status(400).json({ message: `${resource.label} ID 格式錯誤。` });
      const days = Number(req.body.expiresInDays ?? 7);
      if (!Number.isInteger(days) || days < 1 || days > 30) return res.status(400).json({ message: '有效天數必須是 1 到 30 的整數。' });
      const owner = (await query(`select id, name, is_active from public.${resource.table} where id = $1`, [req.params.id])).rows[0];
      if (!owner?.is_active) return res.status(404).json({ message: `找不到有效的${resource.label}。` });
      const token = crypto.randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + days * 86_400_000);
      const link = await transaction(async (client) => {
        await client.query(`update public.availability_links set revoked_at = now()
          where ${resource.key} = $1 and revoked_at is null and expires_at > now()`, [owner.id]);
        return (await client.query(`insert into public.availability_links
          (token_hash, subject_type, ${resource.key}, expires_at, created_by) values ($1, $2, $3, $4, $5)
          returning id, expires_at, created_at`, [tokenHash(token), type, owner.id, expiresAt, req.user.id])).rows[0];
      });
      const baseUrl = String(process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      res.status(201).json({ link: { ...link, url: `${baseUrl}/availability/?token=${token}`, subject: { id: owner.id, name: owner.name, type } } });
    } catch (error) { next(error); }
  };
}

async function revoke(req, res, next) {
  try {
    if (!isUuid(req.params.linkId)) return res.status(400).json({ message: '連結 ID 格式錯誤。' });
    const result = await query('update public.availability_links set revoked_at = now() where id = $1 and revoked_at is null returning id', [req.params.linkId]);
    if (!result.rowCount) return res.status(404).json({ message: '找不到有效連結。' });
    res.status(204).end();
  } catch (error) { next(error); }
}

async function resolveLink(token) {
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(String(token || ''))) return null;
  return (await query(`select l.id, l.subject_type, l.manager_id, l.candidate_id, l.expires_at,
    case when l.subject_type = 'manager' then m.name else c.name end as name
    from public.availability_links l left join public.managers m on m.id = l.manager_id
    left join public.candidates c on c.id = l.candidate_id
    where l.token_hash = $1 and l.revoked_at is null and l.expires_at > now()
      and coalesce(m.is_active, c.is_active, false)`, [tokenHash(token)])).rows[0] || null;
}

async function publicGet(req, res, next) {
  try {
    const link = await resolveLink(req.params.token);
    if (!link) return res.status(404).json({ message: '此連結無效、已撤銷或已過期。' });
    const resource = resources[link.subject_type]; const ownerId = link[resource.key];
    const slots = (await query(`select id, starts_at, ends_at, timezone, location from public.${resource.slotTable}
      where ${resource.key} = $1 and ends_at >= now() order by starts_at`, [ownerId])).rows;
    res.json({ subject: { name: link.name, type: link.subject_type }, expiresAt: link.expires_at, slots });
  } catch (error) { next(error); }
}

async function publicReplaceDay(req, res, next) {
  try {
    const link = await resolveLink(req.params.token);
    if (!link) return res.status(404).json({ message: '此連結無效、已撤銷或已過期。' });
    const resource = resources[link.subject_type];
    await query('update public.availability_links set last_used_at = now() where id = $1', [link.id]);
    req.params = { id: link[resource.key] };
    return resource.handler.replaceDay(req, res, next);
  } catch (error) { next(error); }
}

module.exports = { createManager: create('manager'), createCandidate: create('candidate'), revoke, publicGet, publicReplaceDay, tokenHash };
