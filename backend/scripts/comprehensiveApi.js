const bcrypt = require('bcrypt');
const app = require('../server');
const { supabase } = require('../config/supabase');

function assert(value, message) { if (!value) throw new Error(message); }

async function main() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const prefix = `deep_${Date.now()}`;
  const ids = { users: [], departments: [], managers: [], candidates: [], interviews: [] };
  let assertions = 0;

  async function api(path, { token, expected = 200, ...options } = {}) {
    const response = await fetch(`${origin}/api${path}`, { ...options, headers: {
      'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers,
    } });
    const text = await response.text();
    let body; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    const allowed = Array.isArray(expected) ? expected : [expected];
    assert(allowed.includes(response.status), `${options.method || 'GET'} ${path}: expected ${allowed}, got ${response.status} (${body?.message || text})`);
    assertions += 1;
    return { body, response };
  }

  try {
    const adminPassword = 'Admin-Test!2027';
    const { data: admin, error: adminError } = await supabase.from('users').insert({
      username: `${prefix}_admin`, password_hash: await bcrypt.hash(adminPassword, 4), role: 'administrator',
    }).select('id').single();
    if (adminError) throw adminError; ids.users.push(admin.id);

    await api('/auth/login', { method: 'POST', expected: 401, body: JSON.stringify({ username: `${prefix}_admin`, password: 'wrong-password' }) });
    const adminLogin = (await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: `${prefix}_admin`, password: adminPassword }) })).body;
    assert(adminLogin.role === 'administrator', 'administrator role missing'); assertions += 1;
    const adminToken = adminLogin.token;
    await api('/auth/me', { token: adminToken });
    await api('/hr/departments', { token: adminToken, expected: 403 });
    await api('/admin/hr-accounts', { expected: 401 });
    await api('/admin/hr-accounts', { token: 'invalid.jwt.value', expected: 401 });
    await api('/admin/hr-accounts/not-a-uuid', { token: adminToken, method: 'PATCH', expected: 400, body: '{}' });
    await api('/admin/hr-accounts', { token: adminToken, method: 'POST', expected: 400, body: JSON.stringify({ username: 'x', password: 'short', name: '' }) });

    const hrPassword = 'HR-Test-Pass!2027';
    const createdAccount = (await api('/admin/hr-accounts', { token: adminToken, method: 'POST', expected: 201, body: JSON.stringify({
      username: `${prefix}_hr`, password: hrPassword, name: 'Deep Test HR', email: `${prefix}@example.test`,
    }) })).body.account;
    ids.users.push(createdAccount.user.id);
    await api('/admin/hr-accounts', { token: adminToken, method: 'POST', expected: 409, body: JSON.stringify({
      username: `${prefix}_hr`, password: hrPassword, name: 'Duplicate HR',
    }) });
    const accountList = (await api('/admin/hr-accounts', { token: adminToken })).body.accounts;
    assert(accountList.some((item) => item.id === createdAccount.id), 'created HR absent from list'); assertions += 1;
    await api(`/admin/hr-accounts/${createdAccount.id}`, { token: adminToken, method: 'PATCH', body: JSON.stringify({ name: 'Updated Test HR' }) });

    let hrLogin = (await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: `${prefix}_hr`, password: hrPassword }) })).body;
    let hrToken = hrLogin.token;
    await api('/admin/hr-accounts', { token: hrToken, expected: 403 });
    const me = (await api('/auth/me', { token: hrToken })).body;
    assert(me.profile.name === 'Updated Test HR', 'updated HR profile not returned'); assertions += 1;
    await api('/auth/profile', { token: hrToken, method: 'PATCH', expected: 400, body: JSON.stringify({ name: '', username: `${prefix}_hr` }) });
    const updatedProfile = (await api('/auth/profile', { token: hrToken, method: 'PATCH', body: JSON.stringify({ name: 'Self Updated HR', email: `self-${prefix}@example.test`, username: `${prefix}_hr` }) })).body;
    assert(updatedProfile.profile.name === 'Self Updated HR', 'self-service HR name was not updated'); assertions += 1;
    const updatedMe = (await api('/auth/me', { token: hrToken })).body;
    assert(updatedMe.profile.email === `self-${prefix}@example.test`, 'self-service HR email was not persisted'); assertions += 1;

    const department = (await api('/hr/departments', { token: hrToken, method: 'POST', expected: 201, body: JSON.stringify({ name: `Engineering ${prefix}`, notes: 'QA' }) })).body.department;
    ids.departments.push(department.id);
    await api('/hr/departments', { token: hrToken, method: 'POST', expected: 409, body: JSON.stringify({ name: `Engineering ${prefix}` }) });
    await api(`/hr/departments/${department.id}`, { token: hrToken, method: 'PATCH', body: JSON.stringify({ notes: 'Updated QA' }) });

    const managers = [];
    for (const name of ['陳主管', 'Beta Manager']) {
      const manager = (await api('/hr/managers', { token: hrToken, method: 'POST', expected: 201, body: JSON.stringify({
        name: `${name} ${prefix}`, email: `${name[0].toLowerCase()}-${prefix}@example.test`, departmentId: department.id, notes: 'QA',
      }) })).body.manager;
      managers.push(manager); ids.managers.push(manager.id);
    }
    await api('/hr/managers', { token: hrToken, method: 'POST', expected: 400, body: JSON.stringify({ name: '', departmentId: department.id }) });

    const optionalContactCandidate = (await api('/hr/candidates', { token: hrToken, method: 'POST', expected: 201, body: JSON.stringify({
      name: `Optional Contact ${prefix}`, email: '', phone: '', position: 'QA', departmentId: department.id,
    }) })).body.candidate;
    assert(optionalContactCandidate.email === null && optionalContactCandidate.phone === null, 'optional interviewee contact fields were not stored as null'); assertions += 1;
    ids.candidates.push(optionalContactCandidate.id);
    await api('/hr/managers/not-a-uuid', { token: hrToken, expected: 400 });
    const managerSearch = (await api(`/hr/managers?search=${encodeURIComponent(`陳主管 ${prefix}`)}`, { token: hrToken })).body.managers;
    assert(managerSearch.length === 1 && managerSearch[0].id === managers[0].id, 'manager search failed'); assertions += 1;
    await api(`/hr/managers/${managers[0].id}`, { token: hrToken, method: 'PATCH', body: JSON.stringify({ notes: 'Edited manager' }) });

    const candidate = (await api('/hr/candidates', { token: hrToken, method: 'POST', expected: 201, body: JSON.stringify({
      name: `林候選人 ${prefix}`, email: `${prefix}.candidate@example.test`, phone: '+886900000000',
      position: 'Backend Engineer', departmentId: department.id, notes: 'QA',
    }) })).body.candidate;
    ids.candidates.push(candidate.id);
    assert(candidate.name === `林候選人 ${prefix}` && managers[0].name === `陳主管 ${prefix}`, 'Chinese personnel names were not preserved'); assertions += 1;
    await api('/hr/candidates', { token: hrToken, method: 'POST', expected: 400, body: JSON.stringify({
      name: 'Bad Email', email: 'invalid', phone: '1', position: 'QA', departmentId: department.id,
    }) });
    const candidateSearch = (await api(`/hr/candidates?search=${encodeURIComponent(prefix)}&departmentId=${department.id}`, { token: hrToken })).body.candidates;
    assert(candidateSearch.some((item) => item.id === candidate.id), 'candidate search/filter failed'); assertions += 1;
    await api(`/hr/candidates/${candidate.id}`, { token: hrToken, method: 'PATCH', body: JSON.stringify({ phone: '+886911111111' }) });

    const date = '2027-08-15'; const timezone = 'Asia/Taipei';
    const common = ['10:00', '10:30'];
    await api(`/hr/candidates/${candidate.id}/slots/day`, { token: hrToken, method: 'PUT', expected: 400, body: JSON.stringify({ date, timezone: 'Invalid/Zone', selectedTimes: common }) });
    await api(`/hr/candidates/${candidate.id}/slots/day`, { token: hrToken, method: 'PUT', expected: 400, body: JSON.stringify({ date, timezone, selectedTimes: ['10:15'] }) });
    await api(`/hr/candidates/${candidate.id}/slots/day`, { token: hrToken, method: 'PUT', body: JSON.stringify({ date, timezone, selectedTimes: common }) });
    await api(`/hr/managers/${managers[0].id}/slots/day`, { token: hrToken, method: 'PUT', body: JSON.stringify({ date, timezone, location: '台灣｜台北', selectedTimes: common }) });
    await api(`/hr/managers/${managers[1].id}/slots/day`, { token: hrToken, method: 'PUT', body: JSON.stringify({ date, timezone, location: '台灣｜桃園', selectedTimes: ['10:30'] }) });
    const candidateSlots = (await api(`/hr/candidates/${candidate.id}/slots`, { token: hrToken })).body.slots;
    assert(candidateSlots.length === 2, 'candidate day replacement did not create two slots'); assertions += 1;
    await api(`/hr/candidates/${candidate.id}/slots`, { token: hrToken, method: 'POST', expected: 409, body: JSON.stringify({
      startsAt: candidateSlots[0].starts_at, endsAt: candidateSlots[0].ends_at, timezone,
    }) });
    const extraSlot = (await api(`/hr/candidates/${candidate.id}/slots`, { token: hrToken, method: 'POST', expected: 201, body: JSON.stringify({
      startsAt: '2027-08-20T02:00:00.000Z', endsAt: '2027-08-20T02:30:00.000Z', timezone,
    }) })).body.slot;
    await api(`/hr/candidates/${candidate.id}/slots/${extraSlot.id}`, { token: hrToken, method: 'PATCH', body: JSON.stringify({
      startsAt: '2027-08-20T03:00:00.000Z', endsAt: '2027-08-20T03:30:00.000Z', timezone,
    }) });
    await api(`/hr/candidates/${candidate.id}/slots/${extraSlot.id}`, { token: hrToken, method: 'DELETE', expected: 204 });
    await api(`/hr/candidates/${candidate.id}/slots/${extraSlot.id}`, { token: hrToken, method: 'DELETE', expected: 404 });
    await api(`/hr/candidates/${candidate.id}/slots/day`, { token: hrToken, method: 'PUT', body: JSON.stringify({
      date: '2027-03-14', timezone: 'America/New_York', selectedTimes: ['01:30'],
    }) });
    await api(`/hr/candidates/${candidate.id}/slots/day`, { token: hrToken, method: 'PUT', expected: 400, body: JSON.stringify({
      date: '2027-03-14', timezone: 'America/New_York', selectedTimes: ['02:00'],
    }) });
    const slotsAfterDstError = (await api(`/hr/candidates/${candidate.id}/slots?from=2027-03-14T00:00:00.000Z&to=2027-03-15T23:59:59.999Z`, { token: hrToken })).body.slots;
    assert(slotsAfterDstError.some((slot) => slot.timezone === 'America/New_York'), 'DST validation removed previously saved availability'); assertions += 1;
    await api(`/hr/managers/${managers[0].id}/slots/day`, { token: hrToken, method: 'PUT', body: JSON.stringify({ date: '2027-09-01', timezone: 'Asia/Taipei', location: '台灣｜城市切換測試', selectedTimes: ['09:00'] }) });
    const beforeCitySwitch = (await api(`/hr/managers/${managers[0].id}/slots`, { token: hrToken })).body.slots.find((slot) => slot.location === '台灣｜城市切換測試');
    assert(beforeCitySwitch, 'initial city availability was not saved'); assertions += 1;
    await api(`/hr/managers/${managers[0].id}/slots/day`, { token: hrToken, method: 'PUT', body: JSON.stringify({ date: '2027-09-01', timezone: 'America/New_York', location: '美國｜New York', selectedTimes: ['09:00'] }) });
    const switchedCitySlots = (await api(`/hr/managers/${managers[0].id}/slots`, { token: hrToken })).body.slots;
    assert(switchedCitySlots.filter((slot) => slot.location === '美國｜New York').length === 1 && !switchedCitySlots.some((slot) => slot.id === beforeCitySwitch.id), 'changing city left stale slots for the same local date'); assertions += 1;

    const rangeStart = '2027-08-14T00:00:00.000Z'; const rangeEnd = '2027-08-17T00:00:00.000Z';
    const noHourMatch = (await api('/hr/matches', { token: hrToken, method: 'POST', body: JSON.stringify({
      candidateId: candidate.id, managerIds: managers.map((item) => item.id), rangeStart, rangeEnd, durationMinutes: 60,
    }) })).body.matches;
    assert(noHourMatch.length === 0, 'match incorrectly included time unavailable to one manager'); assertions += 1;
    const halfHourMatches = (await api('/hr/matches', { token: hrToken, method: 'POST', body: JSON.stringify({
      candidateId: candidate.id, managerIds: managers.map((item) => item.id), rangeStart, rangeEnd, durationMinutes: 30,
    }) })).body.matches;
    assert(halfHourMatches.length === 1 && halfHourMatches[0].participants.length === 3, 'all-participant half-hour intersection failed'); assertions += 1;
    await api('/hr/matches', { token: hrToken, method: 'POST', expected: 400, body: JSON.stringify({ candidateId: candidate.id, managerIds: [], rangeStart, rangeEnd, durationMinutes: 30 }) });

    const match = halfHourMatches[0];
    const interview = (await api('/hr/interviews', { token: hrToken, method: 'POST', expected: 201, body: JSON.stringify({
      candidateId: candidate.id, managerIds: managers.map((item) => item.id), startsAt: match.startsAt, endsAt: match.endsAt,
      status: 'scheduled', notes: 'https://meet.example.test/qa',
    }) })).body.interview;
    ids.interviews.push(interview.id);
    const detail = (await api(`/hr/interviews/${interview.id}`, { token: hrToken })).body.interview;
    assert(detail.managers.length === 2 && detail.candidate.id === candidate.id, 'interview detail relationship failed'); assertions += 1;
    await api(`/hr/interviews/${interview.id}`, { token: hrToken, method: 'PATCH', body: JSON.stringify({
      candidateId: candidate.id, managerIds: managers.map((item) => item.id), startsAt: match.startsAt, endsAt: match.endsAt,
      status: 'completed', notes: 'Completed QA',
    }) });
    const filtered = (await api(`/hr/interviews?status=completed&search=${encodeURIComponent('Completed QA')}`, { token: hrToken })).body.interviews;
    assert(filtered.some((item) => item.id === interview.id), 'interview status/search filter failed'); assertions += 1;
    const dashboard = (await api('/hr/dashboard', { token: hrToken })).body;
    assert(Number.isInteger(dashboard.managerCount) && Number.isInteger(dashboard.candidateCount), 'dashboard counts invalid'); assertions += 1;
    await api(`/hr/interviews/${interview.id}`, { token: hrToken, method: 'DELETE', expected: 204 }); ids.interviews.length = 0;
    await api(`/hr/interviews/${interview.id}`, { token: hrToken, expected: 404 });

    const newPassword = 'HR-New-Pass!2027';
    await api('/auth/password', { token: hrToken, method: 'PATCH', expected: 400, body: JSON.stringify({ currentPassword: 'wrong', newPassword }) });
    await api('/auth/password', { token: hrToken, method: 'PATCH', expected: 204, body: JSON.stringify({ currentPassword: hrPassword, newPassword }) });
    await api('/auth/login', { method: 'POST', expected: 401, body: JSON.stringify({ username: `${prefix}_hr`, password: hrPassword }) });
    hrLogin = (await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: `${prefix}_hr`, password: newPassword }) })).body;
    hrToken = hrLogin.token;

    const html = await fetch(`${origin}/hr.html`);
    assert(html.status === 200 && (await html.text()).includes('Global Interview Scheduling System'), 'HR HTML not served'); assertions += 1;
    const security = await fetch(`${origin}/api/health`);
    assert(security.headers.get('x-content-type-options') === 'nosniff' && security.headers.get('x-frame-options') === 'DENY', 'security headers missing'); assertions += 1;
    await api('/does-not-exist', { expected: 404 });
    const malformed = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad json' });
    assert(malformed.status === 400, `malformed JSON returned ${malformed.status} instead of 400`); assertions += 1;
    if (String(process.env.CORS_ORIGIN || '').trim()) {
      const blockedOrigin = await fetch(`${origin}/api/health`, { headers: { Origin: 'https://not-allowed.example' } });
      assert(blockedOrigin.status === 403, `blocked CORS origin returned ${blockedOrigin.status} instead of 403`); assertions += 1;
    }

    await api(`/hr/managers/${managers[0].id}`, { token: hrToken, method: 'DELETE', expected: 204 });
    const inactiveManagers = (await api('/hr/managers?includeInactive=true', { token: hrToken })).body.managers;
    assert(inactiveManagers.find((item) => item.id === managers[0].id)?.is_active === false, 'manager was not deactivated'); assertions += 1;
    await api(`/hr/candidates/${candidate.id}`, { token: hrToken, method: 'DELETE', expected: 204 });
    const inactiveCandidates = (await api('/hr/candidates?includeInactive=true', { token: hrToken })).body.candidates;
    assert(inactiveCandidates.find((item) => item.id === candidate.id)?.is_active === false, 'candidate was not deactivated'); assertions += 1;
    await api(`/hr/departments/${department.id}`, { token: hrToken, method: 'DELETE', expected: 204 });
    const inactiveDepartments = (await api('/hr/departments?includeInactive=true', { token: hrToken })).body.departments;
    assert(inactiveDepartments.find((item) => item.id === department.id)?.is_active === false, 'department was not deactivated'); assertions += 1;
    await api(`/admin/hr-accounts/${createdAccount.id}`, { token: adminToken, method: 'DELETE', expected: 204 });
    await api('/auth/login', { method: 'POST', expected: 401, body: JSON.stringify({ username: `${prefix}_hr`, password: newPassword }) });

    console.log(`SUCCESS: ${assertions} comprehensive API, validation, authorization, data and HTTP assertions passed.`);
  } finally {
    if (ids.interviews.length) await supabase.from('interviews').delete().in('id', ids.interviews);
    if (ids.candidates.length) await supabase.from('candidates').delete().in('id', ids.candidates);
    if (ids.managers.length) await supabase.from('managers').delete().in('id', ids.managers);
    if (ids.departments.length) await supabase.from('departments').delete().in('id', ids.departments);
    if (ids.users.length) await supabase.from('users').delete().in('id', ids.users);
    server.close();
  }
}

main().catch((error) => { console.error(`FAILED: ${error.message}`); process.exitCode = 1; });
