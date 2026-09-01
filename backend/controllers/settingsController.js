const { query } = require('../config/database');
const { audit } = require('../services/auditService');
async function setting(key) { const row = (await query('select value from public.system_settings where key = $1', [key])).rows[0]; return row?.value === true; }
async function availabilityLinksEnabled() { return setting('availability_links_enabled'); }
async function emailNotificationsEnabled() { return setting('email_notifications_enabled'); }
async function scorecardTemplatesEnabled() { return setting('scorecard_templates_enabled'); }
async function features(_req, res, next) { try { res.json({ availabilityLinksEnabled: await availabilityLinksEnabled(), emailNotificationsEnabled: await emailNotificationsEnabled(), scorecardTemplatesEnabled: await scorecardTemplatesEnabled() }); } catch (error) { next(error); } }
async function updateFeatures(req, res, next) {
  try {
    if (typeof req.body.availabilityLinksEnabled !== 'boolean' || (req.body.emailNotificationsEnabled != null && typeof req.body.emailNotificationsEnabled !== 'boolean') || (req.body.scorecardTemplatesEnabled != null && typeof req.body.scorecardTemplatesEnabled !== 'boolean')) return res.status(400).json({ message: '功能開關格式不正確。' });
    const emailEnabled = typeof req.body.emailNotificationsEnabled === 'boolean' ? req.body.emailNotificationsEnabled : await emailNotificationsEnabled();
    const scorecardsEnabled = typeof req.body.scorecardTemplatesEnabled === 'boolean' ? req.body.scorecardTemplatesEnabled : await scorecardTemplatesEnabled();
    await query(`insert into public.system_settings (key, value, updated_by, updated_at) values
      ('availability_links_enabled', $1::jsonb, $4, now()), ('email_notifications_enabled', $2::jsonb, $4, now()), ('scorecard_templates_enabled', $3::jsonb, $4, now())
      on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`, [JSON.stringify(req.body.availabilityLinksEnabled), JSON.stringify(emailEnabled), JSON.stringify(scorecardsEnabled), req.user.id]);
    await audit(req, 'update', 'system_setting', 'feature_settings', { availabilityLinksEnabled: req.body.availabilityLinksEnabled, emailNotificationsEnabled: emailEnabled, scorecardTemplatesEnabled: scorecardsEnabled });
    res.json({ availabilityLinksEnabled: req.body.availabilityLinksEnabled, emailNotificationsEnabled: emailEnabled, scorecardTemplatesEnabled: scorecardsEnabled });
  } catch (error) { next(error); }
}
module.exports = { availabilityLinksEnabled, emailNotificationsEnabled, scorecardTemplatesEnabled, features, updateFeatures };
