const { query } = require('../config/database');
const { audit } = require('../services/auditService');

async function setting(key) {
  const row = (await query('select value from public.system_settings where key = $1', [key])).rows[0];
  return row?.value === true;
}
async function availabilityLinksEnabled() { return setting('availability_links_enabled'); }
async function emailNotificationsEnabled() { return setting('email_notifications_enabled'); }
async function features(_req, res, next) { try { res.json({ availabilityLinksEnabled: await availabilityLinksEnabled(), emailNotificationsEnabled: await emailNotificationsEnabled() }); } catch (error) { next(error); } }
async function updateFeatures(req, res, next) {
  try {
    if (typeof req.body.availabilityLinksEnabled !== 'boolean' || (req.body.emailNotificationsEnabled != null && typeof req.body.emailNotificationsEnabled !== 'boolean')) return res.status(400).json({ message: '功能開關格式不正確。' });
    const emailEnabled = typeof req.body.emailNotificationsEnabled === 'boolean' ? req.body.emailNotificationsEnabled : await emailNotificationsEnabled();
    await query(`insert into public.system_settings (key, value, updated_by, updated_at)
      values ('availability_links_enabled', $1::jsonb, $3, now()), ('email_notifications_enabled', $2::jsonb, $3, now())
      on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`, [JSON.stringify(req.body.availabilityLinksEnabled), JSON.stringify(emailEnabled), req.user.id]);
    await audit(req, 'update', 'system_setting', 'feature_settings', { availabilityLinksEnabled: req.body.availabilityLinksEnabled, emailNotificationsEnabled: emailEnabled });
    res.json({ availabilityLinksEnabled: req.body.availabilityLinksEnabled, emailNotificationsEnabled: emailEnabled });
  } catch (error) { next(error); }
}
module.exports = { availabilityLinksEnabled, emailNotificationsEnabled, features, updateFeatures };
