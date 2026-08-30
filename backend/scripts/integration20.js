const bcrypt = require('bcrypt');
const app = require('../server');
const { query, pool } = require('../config/database');

const timezones = ['Asia/Taipei', 'Asia/Tokyo', 'Asia/Kolkata', 'Asia/Jakarta', 'Asia/Shanghai',
  'Asia/Singapore', 'America/Chicago', 'America/New_York', 'America/Los_Angeles', 'America/Mexico_City',
  'Europe/London', 'Europe/Berlin', 'Europe/Prague', 'Europe/Budapest', 'Europe/Bratislava',
  'America/Sao_Paulo', 'Asia/Ho_Chi_Minh', 'Asia/Kuala_Lumpur', 'Australia/Sydney', 'UTC'];

function check(condition, message) { if (!condition) throw new Error(message); }
function localDate(index) { return `2027-${String(1 + Math.floor(index / 20)).padStart(2, '0')}-${String(2 + (index % 20)).padStart(2, '0')}`; }

async function main() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const runId = `codex20_${Date.now()}`;
  let passed = 0;

  async function request(path, { token, expected = 200, withResponse = false, ...options } = {}) {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: token } : {}), ...options.headers },
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    check(response.status === expected, `${options.method || 'GET'} ${path}: expected ${expected}, got ${response.status} (${body?.message || text})`);
    return withResponse ? { body, response } : body;
  }

  try {
    await request('/health');
    await request('/hr/departments', { expected: 401 });

    for (let index = 0; index < 20; index += 1) {
      const tag = `${runId}_${String(index + 1).padStart(2, '0')}`;
      const username = tag.slice(0, 40);
      const password = `Safe-${index}-Pass!2027`;
      const ids = { users: [], departments: [], managers: [], candidates: [], interviews: [] };
      try {
        const passwordHash = await bcrypt.hash(password, 4);
        const user = (await query(`insert into public.users (username, password_hash, role)
          values ($1, $2, 'hr') returning id`, [username, passwordHash])).rows[0];
        ids.users.push(user.id);
        await query('insert into public.hr_accounts (user_id, name, email) values ($1, $2, $3)', [user.id, `Test HR ${index + 1}`, `${tag}@example.test`]);

        const loginResult = await request('/auth/login', { method: 'POST', withResponse: true, body: JSON.stringify({ username, password }) });
        const cookieHeader = loginResult.response.headers.get('set-cookie') || '';
        check(loginResult.body.role === 'hr' && cookieHeader.includes('interview_session='), `dataset ${index + 1}: login payload invalid`);
        const token = cookieHeader.split(';')[0];
        const me = await request('/auth/me', { token });
        check(me.profile?.name === `Test HR ${index + 1}`, `dataset ${index + 1}: profile mismatch`);

        const department = (await request('/hr/departments', { token, method: 'POST', expected: 201,
          body: JSON.stringify({ name: `QA ${tag}`, notes: `dataset ${index + 1}` }) })).department;
        ids.departments.push(department.id);

        const managers = [];
        for (let managerIndex = 0; managerIndex < 2; managerIndex += 1) {
          const manager = (await request('/hr/managers', { token, method: 'POST', expected: 201, body: JSON.stringify({
            name: `Manager ${index + 1}-${managerIndex + 1}`, email: `${tag}.m${managerIndex + 1}@example.test`,
            departmentId: department.id, notes: 'integration test',
          }) })).manager;
          managers.push(manager); ids.managers.push(manager.id);
        }
        const candidate = (await request('/hr/candidates', { token, method: 'POST', expected: 201, body: JSON.stringify({
          name: `Candidate ${index + 1}`, email: `${tag}.candidate@example.test`, phone: `0900${String(index).padStart(6, '0')}`,
          position: 'Test Engineer', departmentId: department.id, notes: 'integration test',
        }) })).candidate;
        ids.candidates.push(candidate.id);

        const date = localDate(index);
        const timezone = timezones[index];
        const durationMinutes = [30, 60, 90][index % 3];
        const selectedTimes = ['10:00', ...(durationMinutes >= 60 ? ['10:30'] : []), ...(durationMinutes >= 90 ? ['11:00'] : [])];
        const location = `Test site ${index + 1}`;
        for (const manager of managers) await request(`/hr/managers/${manager.id}/slots/day`, { token, method: 'PUT', body: JSON.stringify({ date, timezone, location, selectedTimes }) });
        await request(`/hr/candidates/${candidate.id}/slots/day`, { token, method: 'PUT', body: JSON.stringify({ date, timezone, location, selectedTimes }) });

        const utcDay = new Date(`${date}T00:00:00.000Z`);
        const rangeStart = new Date(utcDay.getTime() - 24 * 60 * 60_000).toISOString();
        const rangeEnd = new Date(utcDay.getTime() + 48 * 60 * 60_000).toISOString();
        const matchResult = await request('/hr/matches', { token, method: 'POST', body: JSON.stringify({
          candidateId: candidate.id, managerIds: managers.map((item) => item.id), rangeStart, rangeEnd, durationMinutes,
        }) });
        check(matchResult.matches.length >= 1, `dataset ${index + 1}: no common match (${timezone}, ${durationMinutes}m)`);
        const match = matchResult.matches[0];
        check(match.participants.length === 3, `dataset ${index + 1}: participant count mismatch`);
        check(match.participants.every((item) => item.timezone === timezone), `dataset ${index + 1}: timezone missing or incorrect`);
        check(match.participants.every((item) => item.location === location), `dataset ${index + 1}: location missing or incorrect`);

        const created = (await request('/hr/interviews', { token, method: 'POST', expected: 201, body: JSON.stringify({
          candidateId: candidate.id, managerIds: managers.map((item) => item.id), startsAt: match.startsAt,
          endsAt: match.endsAt, status: 'scheduled', notes: `QA interview ${index + 1}`,
        }) })).interview;
        ids.interviews.push(created.id);
        check(created.managers.length === 2, `dataset ${index + 1}: saved managers mismatch`);
        await request('/hr/interviews', { token });
        await request('/hr/dashboard', { token });
        await request('/hr/interviews', { token, method: 'POST', expected: 409, body: JSON.stringify({
          candidateId: candidate.id, managerIds: managers.map((item) => item.id), startsAt: match.startsAt,
          endsAt: match.endsAt, status: 'scheduled', notes: 'must conflict',
        }) });
        passed += 1;
        console.log(`PASS ${String(passed).padStart(2, '0')}/20  ${timezone}  ${durationMinutes} minutes`);
      } finally {
        if (ids.interviews.length) await query('delete from public.interviews where id = any($1::uuid[])', [ids.interviews]);
        if (ids.candidates.length) await query('delete from public.candidates where id = any($1::uuid[])', [ids.candidates]);
        if (ids.managers.length) await query('delete from public.managers where id = any($1::uuid[])', [ids.managers]);
        if (ids.departments.length) await query('delete from public.departments where id = any($1::uuid[])', [ids.departments]);
        if (ids.users.length) await query('delete from public.users where id = any($1::uuid[])', [ids.users]);
      }
    }
    console.log(`SUCCESS: ${passed} consecutive datasets passed without errors.`);
  } finally {
    server.close();
    if (pool) await pool.end();
  }
}

main().catch((error) => { console.error(`FAILED: ${error.message}`); process.exitCode = 1; });
