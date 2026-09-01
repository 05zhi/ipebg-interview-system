const nodemailer = require('nodemailer');
const { query } = require('../config/database');

const enabled = process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true' || (process.env.NODE_ENV === 'test' && process.env.EMAIL_TRANSPORT === 'json');

async function notificationsEnabled() {
  if (process.env.NODE_ENV === 'test') return enabled;
  const row = (await query(`select value from public.system_settings where key = 'email_notifications_enabled'`)).rows[0];
  return enabled && row?.value === true;
}

function transporter() {
  if (!enabled) return null;
  if (process.env.EMAIL_TRANSPORT === 'json') return nodemailer.createTransport({ jsonTransport: true });
  if (!process.env.SMTP_HOST || !process.env.EMAIL_FROM) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

function icsDate(value) { return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
function icsEscape(value) { return String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;'); }
function buildIcs(interview) {
  const description = [interview.notes, interview.meeting_url].filter(Boolean).join('\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//iPEBG//Interview System//ZH-TW', 'CALSCALE:GREGORIAN', 'METHOD:REQUEST',
    'BEGIN:VEVENT', `UID:${interview.id}@ipebg-interview`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(interview.starts_at)}`,
    `DTEND:${icsDate(interview.ends_at)}`, `SUMMARY:${icsEscape(`面試｜${interview.candidate?.name || ''}`)}`,
    `DESCRIPTION:${icsEscape(description)}`, interview.meeting_url ? `URL:${interview.meeting_url}` : '',
    'STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR', ''].filter(Boolean).join('\r\n');
}

function recipients(interview) {
  const people = [{ name: interview.candidate?.name, email: interview.candidate?.email },
    ...(interview.managers || []).map((manager) => ({ name: manager.name, email: manager.email }))];
  return [...new Map(people.filter((person) => person.email).map((person) => [person.email.toLowerCase(), person])).values()];
}

async function sendInterviewNotification(interview, notificationType = 'invitation') {
  if (!await notificationsEnabled()) return { enabled: false, sent: 0, failed: 0 };
  const transport = transporter();
  if (!transport) return { enabled: false, sent: 0, failed: 0 };
  let sent = 0; let failed = 0;
  for (const person of recipients(interview)) {
    try {
      if (notificationType === 'reminder') {
        const duplicate = await query(`select 1 from public.interview_notifications
          where interview_id = $1 and lower(recipient_email) = lower($2) and notification_type = 'reminder' and status = 'sent'`, [interview.id, person.email]);
        if (duplicate.rowCount) continue;
      }
      await transport.sendMail({
        from: process.env.EMAIL_FROM || 'iPEBG Interview <no-reply@localhost>', to: person.email,
        subject: `${notificationType === 'reminder' ? '面試提醒' : '面試邀請'}｜${interview.candidate?.name || ''}`,
        text: [`${person.name || '您好'}：`, '', `面試時間：${new Date(interview.starts_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}（台灣時間）`,
          interview.meeting_url ? `會議連結：${interview.meeting_url}` : '', '', interview.notes || ''].filter(Boolean).join('\n'),
        attachments: [{ filename: 'interview.ics', content: buildIcs(interview), contentType: 'text/calendar; charset=utf-8; method=REQUEST' }],
      });
      await query(`insert into public.interview_notifications (interview_id, recipient_email, notification_type, status, sent_at)
        values ($1, $2, $3, 'sent', now()) on conflict (interview_id, recipient_email, notification_type) do update set status = 'sent', sent_at = now(), error_message = null`,
      [interview.id, person.email, notificationType]);
      sent += 1;
    } catch (error) {
      await query(`insert into public.interview_notifications (interview_id, recipient_email, notification_type, status, error_message)
        values ($1, $2, $3, 'failed', $4) on conflict (interview_id, recipient_email, notification_type) do update set status = 'failed', error_message = excluded.error_message`,
      [interview.id, person.email, notificationType, String(error.message || error).slice(0, 500)]);
      failed += 1;
    }
  }
  return { enabled: true, sent, failed };
}

async function sendDueReminders() {
  if (!await notificationsEnabled() || !transporter()) return { enabled: false, interviews: 0 };
  const configuredHours = Number(process.env.INTERVIEW_REMINDER_HOURS || 24);
  const hours = Number.isFinite(configuredHours) && configuredHours >= 1 ? configuredHours : 24;
  const result = await query(`select i.id, i.starts_at, i.ends_at, i.status, i.notes, i.meeting_url, i.meeting_provider,
    json_build_object('name', c.name, 'email', c.email) as candidate,
    coalesce(json_agg(json_build_object('name', m.name, 'email', m.email)) filter (where m.id is not null), '[]'::json) as managers
    from public.interviews i join public.candidates c on c.id = i.candidate_id
    left join public.interview_managers im on im.interview_id = i.id left join public.managers m on m.id = im.manager_id
    where i.archived_at is null and i.status in ('pending_confirmation', 'confirmed', 'scheduled')
      and i.starts_at > now() and i.starts_at <= now() + ($1 || ' hours')::interval
    group by i.id, c.id`, [hours]);
  for (const interview of result.rows) await sendInterviewNotification(interview, 'reminder');
  return { enabled: true, interviews: result.rowCount };
}

module.exports = { buildIcs, sendInterviewNotification, sendDueReminders };
