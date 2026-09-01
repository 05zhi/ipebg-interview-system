const { query } = require('../config/database');

async function availabilityLinksEnabled() {
  const row = (await query(`select value from public.system_settings where key = 'availability_links_enabled'`)).rows[0];
  return row?.value === true;
}

async function features(_req, res, next) {
  try { res.json({ availabilityLinksEnabled: await availabilityLinksEnabled() }); }
  catch (error) { next(error); }
}

async function updateFeatures(req, res, next) {
  try {
    if (typeof req.body.availabilityLinksEnabled !== 'boolean') return res.status(400).json({ message: '功能開關格式不正確。' });
    await query(`insert into public.system_settings (key, value, updated_by, updated_at)
      values ('availability_links_enabled', $1::jsonb, $2, now())
      on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [JSON.stringify(req.body.availabilityLinksEnabled), req.user.id]);
    res.json({ availabilityLinksEnabled: req.body.availabilityLinksEnabled });
  } catch (error) { next(error); }
}

module.exports = { availabilityLinksEnabled, features, updateFeatures };
