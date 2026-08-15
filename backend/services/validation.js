const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return UUID_PATTERN.test(String(value || ''));
}

function isTimezone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return Boolean(value);
  } catch (_error) {
    return false;
  }
}

function parseTimeRange(body) {
  const startsAt = new Date(body.startsAt);
  const endsAt = new Date(body.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { error: '開始與結束時間必須是有效的 ISO 8601 日期時間。' };
  }
  if (endsAt <= startsAt) return { error: '結束時間必須晚於開始時間。' };
  if (endsAt - startsAt > 24 * 60 * 60 * 1000) return { error: '單一可用時段不可超過 24 小時。' };
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

function databaseMessage(error) {
  if (error?.code === '23P01' || error?.code === '23505') return '此時段與既有時段重疊。';
  return null;
}

function zonedLocalToIso(date, time, timezone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !isTimezone(timezone)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let index = 0; index < 3; index += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
    guess += Date.UTC(year, month - 1, day, hour, minute) - Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  }
  const resolved = Object.fromEntries(formatter.formatToParts(new Date(guess)).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  if (resolved.year !== year || resolved.month !== month || resolved.day !== day || resolved.hour !== hour || resolved.minute !== minute) return null;
  return new Date(guess).toISOString();
}

module.exports = { isUuid, isTimezone, parseTimeRange, databaseMessage, zonedLocalToIso };
