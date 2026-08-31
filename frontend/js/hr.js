const hrUser = API.guard('hr');
const state = { departments: [], managers: [], candidates: [], candidateInterviewStatuses: new Map(), interviews: [], matches: [], availability: { slots: [] }, interviewPage: 1, interviewPageSize: 10 };
const APP_ROUTES = Object.freeze({ dashboard: '/dashboard/', departments: '/departments/', managers: '/managers/', candidates: '/candidates/', matching: '/matching/', interviews: '/interviews/', account: '/account/' });
function currentAppView() { return Object.entries(APP_ROUTES).find(([, route]) => location.pathname === route)?.[0] || ''; }
const IPEBG_TIMEZONES = [
  ['台灣｜台北 Taipei', 'Asia/Taipei'], ['中國｜北京 Beijing', 'Asia/Shanghai'], ['印度｜新德里 New Delhi', 'Asia/Kolkata'],
  ['印尼｜雅加達 Jakarta', 'Asia/Jakarta'], ['美國｜芝加哥 Chicago', 'America/Chicago'], ['美國｜洛杉磯 Los Angeles', 'America/Los_Angeles'],
  ['美國｜紐約 New York', 'America/New_York'], ['墨西哥｜華雷斯 Ciudad Juárez', 'America/Ciudad_Juarez'],
  ['墨西哥｜奇瓦瓦 Chihuahua', 'America/Chihuahua'], ['墨西哥｜提華納 Tijuana', 'America/Tijuana'],
  ['墨西哥｜蒙特雷 Monterrey', 'America/Monterrey'], ['墨西哥｜墨西哥城 Mexico City', 'America/Mexico_City'],
  ['越南｜河內 Hanoi', 'Asia/Ho_Chi_Minh'], ['馬來西亞｜吉隆坡 Kuala Lumpur', 'Asia/Kuala_Lumpur'],
  ['新加坡｜新加坡 Singapore', 'Asia/Singapore'], ['日本｜東京 Tokyo', 'Asia/Tokyo'], ['巴西｜聖保羅 São Paulo', 'America/Sao_Paulo'],
  ['捷克｜布拉格 Prague', 'Europe/Prague'], ['匈牙利｜布達佩斯 Budapest', 'Europe/Budapest'],
  ['斯洛伐克｜布拉提斯拉瓦 Bratislava', 'Europe/Bratislava'], ['英國｜倫敦 London', 'Europe/London'],
  ['澳洲｜雪梨 Sydney', 'Australia/Sydney'], ['國際標準時間｜UTC', 'UTC'],
];
const TAIWAN_TIMEZONE = 'Asia/Taipei';
const TIMEZONE_MAJOR_CITIES = Object.freeze({
  'Asia/Taipei': '高雄 Kaohsiung',
  'Asia/Shanghai': '上海 Shanghai, 重慶 Chongqing',
  'Asia/Kolkata': '孟買 Mumbai, 加爾各答 Kolkata',
  'Asia/Jakarta': '萬隆 Bandung',
  'America/Chicago': '休士頓 Houston, 達拉斯 Dallas',
  'America/Los_Angeles': '舊金山 San Francisco, 西雅圖 Seattle',
  'America/New_York': '華盛頓 Washington, 邁阿密 Miami',
  'America/Mexico_City': '瓜達拉哈拉 Guadalajara',
  'Asia/Ho_Chi_Minh': '河內 Hanoi',
  'Asia/Kuala_Lumpur': '檳城 Penang',
  'Europe/London': '曼徹斯特 Manchester',
  'Australia/Sydney': '坎培拉 Canberra',
});
function modal(id) {
  const element = document.querySelector(id);
  if (window.bootstrap?.Modal) return bootstrap.Modal.getOrCreateInstance(element);
  return {
    show() {
      element.style.display = 'block'; element.classList.add('show');
      element.removeAttribute('aria-hidden'); element.setAttribute('aria-modal', 'true');
      document.body.classList.add('modal-open');
      const backdrop = document.createElement('div'); backdrop.className = 'modal-backdrop fade show local-modal-backdrop'; document.body.append(backdrop);
    },
    hide() {
      element.style.display = 'none'; element.classList.remove('show'); element.setAttribute('aria-hidden', 'true');
      element.removeAttribute('aria-modal'); document.body.classList.remove('modal-open');
      document.querySelectorAll('.local-modal-backdrop').forEach((backdrop) => backdrop.remove());
    },
  };
}
const value = (id) => document.querySelector(id).value;
const setValue = (id, data = '') => { document.querySelector(id).value = data ?? ''; };
document.querySelector('#manager-department').outerHTML = '<select class="form-select" id="manager-department" required></select>';
document.querySelector('#candidate-department').outerHTML = '<select class="form-select" id="candidate-department" required></select>';

function notify(message, type = 'success') {
  document.querySelector('#global-alert').innerHTML = `<div class="alert alert-${type} alert-dismissible">${API.escape(message)}<button class="btn-close" data-bs-dismiss="alert"></button></div>`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function dismissNotificationOnNextAction(event) {
  if (!event.target.closest('#global-alert')) document.querySelector('#global-alert').innerHTML = '';
}
document.addEventListener('pointerdown', dismissNotificationOnNextAction);
document.addEventListener('keydown', dismissNotificationOnNextAction);
function empty(columns, message) { return `<tr><td colspan="${columns}" class="empty">${API.escape(message)}</td></tr>`; }
function tableSkeleton(columns, rows = 4) { return Array.from({ length: rows }, () => `<tr class="skeleton-row">${Array.from({ length: columns }, () => '<td><span class="skeleton-line"></span></td>').join('')}</tr>`).join(''); }
function statusBadge(status) {
  const labels = { scheduled: '已排程', completed: '已完成', cancelled: '已取消' };
  const style = status === 'cancelled' ? 'badge-cancelled' : status === 'completed' ? 'badge-available' : 'badge-booked';
  return `<span class="badge ${style}">${labels[status] || API.escape(status)}</span>`;
}
// Only a URL entered in the dedicated field gets an invisible marker. URLs
// typed directly in the notes field remain ordinary notes text.
function meetingUrlFromNotes(notes) { return String(notes || '').match(/\u200B(https?:\/\/[^\s]+)/i)?.[1] || ''; }
function notesWithoutMeetingUrl(notes) { return String(notes || '').replace(/\s*\u200Bhttps?:\/\/[^\s]+\s*/ig, '').trim(); }
function composeInterviewNotes(notes, meetingUrl) { return [String(notes || '').trim(), meetingUrl ? `\u200B${String(meetingUrl).trim()}` : ''].filter(Boolean).join('\n'); }
function withMeetingUrl(item) { return item.meeting_url && !meetingUrlFromNotes(item.notes) ? { ...item, notes: composeInterviewNotes(item.notes, item.meeting_url) } : item; }
function showSection(name) {
  if (APP_ROUTES[name] && location.pathname !== APP_ROUTES[name]) { location.href = APP_ROUTES[name]; return; }
  document.querySelectorAll('[data-view]').forEach((view) => { view.hidden = view.dataset.view !== name; });
  document.querySelectorAll('[data-section]').forEach((item) => item.classList.toggle('active', item.dataset.section === name));
  if (name === 'dashboard') loadDashboard();
  if (name === 'departments') loadDepartments();
  if (name === 'managers') loadManagers();
  if (name === 'candidates') loadCandidates();
  if (name === 'matching') loadPeople();
  if (name === 'interviews') loadInterviews();
  if (name === 'account') loadProfile();
}

function renderCurrentUser(name) {
  const displayName = name || hrUser?.username || 'HR';
  document.querySelectorAll('[data-user-name]').forEach((node) => { node.textContent = displayName; });
  document.querySelectorAll('[data-user-avatar]').forEach((node) => { node.textContent = displayName.trim().slice(0, 1).toUpperCase() || 'H'; });
}
async function loadProfile() {
  try {
    const data = await API.request('/auth/me');
    if (!data) return;
    setValue('#profile-name', data.profile?.name || '');
    setValue('#profile-email', data.profile?.email || '');
    setValue('#profile-username', data.user?.username || '');
    renderCurrentUser(data.profile?.name || data.user?.username);
  } catch (error) { notify(error.message, 'danger'); }
}

async function loadDepartments() {
  try {
    const data = await API.request('/hr/departments');
    state.departments = data.departments;
    const options = '<option value="">請選擇部門</option>' + state.departments.filter((item) => item.is_active).map((item) => `<option value="${item.id}">${API.escape(item.name)}</option>`).join('');
    document.querySelector('#manager-department').innerHTML = options;
    document.querySelector('#candidate-department').innerHTML = options;
    if (document.querySelector('[data-view="departments"]:not([hidden])')) renderDepartments();
  } catch (error) { notify(error.message, 'danger'); }
}
function renderDepartments() {
  document.querySelector('#department-table').innerHTML = state.departments.map((item) => `<tr><td><strong>${API.escape(item.name)}</strong></td><td class="text-end action-cell"><button class="btn btn-sm btn-outline-primary" data-edit-department="${item.id}"><i class="bi bi-pencil me-1"></i>編輯</button> <button class="btn btn-sm btn-outline-danger" data-delete-department="${item.id}"><i class="bi bi-trash me-1"></i>刪除</button></td></tr>`).join('') || empty(2, '尚未建立部門。');
}
function openDepartment(item) {
  if (!item) return notify('找不到此部門資料，請重新整理後再試。', 'danger');
  setValue('#department-edit-id', item.id);
  setValue('#department-edit-name', item.name);
  modal('#department-edit-modal').show();
  document.querySelector('#department-edit-name').focus();
}

async function loadDashboard() {
  try {
    document.querySelector('#dashboard-stats').innerHTML = Array.from({ length: 4 }, () => '<div class="col-6 col-xl-3"><div class="panel dashboard-card p-4"><span class="skeleton-line w-50"></span><span class="skeleton-line skeleton-stat"></span></div></div>').join('');
    document.querySelector('#upcoming-table').innerHTML = tableSkeleton(4, 3);
    const data = await API.request('/hr/dashboard');
    const stats = [['今日面試', data.todayInterviews, 'bi-calendar-day'], ['本週面試', data.weekInterviews, 'bi-calendar-week'], ['主管總數', data.managerCount, 'bi-people'], ['面試者總數', data.candidateCount, 'bi-person-vcard']];
    document.querySelector('#dashboard-stats').innerHTML = stats.map(([label, count, icon]) => `<div class="col-6 col-xl-3"><div class="panel dashboard-card p-3 p-md-4"><i class="bi ${icon} text-primary fs-4"></i><div class="small text-muted-app mt-2">${label}</div><div class="stat-value">${count ?? 0}</div></div></div>`).join('');
    const upcoming = [...data.upcoming].sort((a, b) => {
      const aCompleted = a.status === 'completed';
      const bCompleted = b.status === 'completed';
      if (aCompleted !== bCompleted) return aCompleted ? 1 : -1;
      return new Date(a.starts_at) - new Date(b.starts_at);
    });
    document.querySelector('#upcoming-table').innerHTML = upcoming.map((item) => `<tr><td>${API.date(item.starts_at)}</td><td>${API.escape(item.candidate?.name)}</td><td>${item.interview_managers.map((entry) => API.escape(entry.manager?.name)).join('、')}</td><td>${statusBadge(item.status)}</td></tr>`).join('') || empty(4, '目前沒有即將進行的面試。');
  } catch (error) { notify(error.message, 'danger'); }
}

async function loadManagers() {
  document.querySelector('#manager-table').innerHTML = tableSkeleton(4);
  try { const data = await API.request(`/hr/managers?search=${encodeURIComponent(value('#manager-search'))}`); state.managers = data.managers; renderManagers(); }
  catch (error) { notify(error.message, 'danger'); }
}
function renderManagers() {
  document.querySelector('#manager-table').innerHTML = state.managers.map((item) => `<tr><td><div class="person-cell"><span class="avatar">${API.escape(item.name.slice(0, 1).toUpperCase())}</span><strong>${API.escape(item.name)}</strong></div></td><td><span class="department-tag">${API.escape(item.department?.name)}</span></td><td>${item.email ? `<a href="mailto:${API.escape(item.email)}">${API.escape(item.email)}</a>` : '<span class="text-muted-app">未提供</span>'}</td><td class="text-end text-nowrap action-cell"><button class="btn btn-sm btn-outline-secondary" data-manager-slots="${item.id}" title="管理主管每日所在城市與空閒時間"><i class="bi bi-calendar3 me-1"></i>空閒時間</button> <button class="btn btn-sm btn-outline-primary" data-edit-manager="${item.id}"><i class="bi bi-pencil me-1"></i>編輯</button> <button class="btn btn-sm btn-outline-danger" data-delete-manager="${item.id}"><i class="bi bi-trash me-1"></i>刪除</button></td></tr>`).join('') || empty(4, '尚未建立主管。');
}
async function loadCandidates() {
  document.querySelector('#candidate-table').innerHTML = tableSkeleton(6);
  try {
    const [data, interviewData] = await Promise.all([
      API.request(`/hr/candidates?search=${encodeURIComponent(value('#candidate-search'))}`),
      API.request('/hr/interviews'),
    ]);
    state.candidates = data.candidates;
    state.candidateInterviewStatuses = new Map();
    interviewData.interviews.forEach((interview) => {
      const candidateId = interview.candidate?.id;
      if (!candidateId || interview.status === 'cancelled') return;
      const current = state.candidateInterviewStatuses.get(candidateId);
      if (interview.status === 'scheduled' || !current) state.candidateInterviewStatuses.set(candidateId, interview.status);
    });
    renderCandidates();
  }
  catch (error) { notify(error.message, 'danger'); }
}
function renderCandidates() {
  const statusOrder = { scheduled: 1, completed: 2 };
  const candidates = [...state.candidates].sort((a, b) => {
    const aOrder = statusOrder[state.candidateInterviewStatuses.get(a.id)] ?? 0;
    const bOrder = statusOrder[state.candidateInterviewStatuses.get(b.id)] ?? 0;
    return aOrder - bOrder || a.name.localeCompare(b.name);
  });
  document.querySelector('#candidate-table').innerHTML = candidates.map((item) => {
    const email = item.email ? `<a href="mailto:${API.escape(item.email)}">${API.escape(item.email)}</a>` : '';
    const phone = item.phone ? `<small class="d-block text-muted-app">${API.escape(item.phone)}</small>` : '';
    const contact = email || phone ? `${email}${phone}` : '<span class="text-muted-app">未提供</span>';
    const interviewStatus = state.candidateInterviewStatuses.get(item.id);
    const statusBadge = interviewStatus === 'scheduled'
      ? '<span class="badge badge-warning">已安排</span>'
      : interviewStatus === 'completed'
        ? '<span class="badge badge-available">已面試結束</span>'
        : '<span class="badge badge-muted">未安排</span>';
    return `<tr><td><div class="person-cell"><span class="avatar">${API.escape(item.name.slice(0, 1).toUpperCase())}</span><strong>${API.escape(item.name)}</strong></div></td><td><strong>${API.escape(item.position)}</strong></td><td><span class="department-tag">${API.escape(item.department?.name)}</span></td><td>${contact}</td><td>${statusBadge}</td><td class="text-end text-nowrap action-cell"><button class="btn btn-sm btn-outline-secondary" data-candidate-slots="${item.id}" title="管理面試者可面試時間"><i class="bi bi-calendar3 me-1"></i>空閒時間</button> <button class="btn btn-sm btn-outline-primary" data-edit-candidate="${item.id}"><i class="bi bi-pencil me-1"></i>編輯</button> <button class="btn btn-sm btn-outline-danger" data-delete-candidate="${item.id}"><i class="bi bi-trash me-1"></i>刪除</button></td></tr>`;
  }).join('') || empty(6, '尚未建立面試者。');
}

function openManager(item = {}) {
  document.querySelector('#manager-form').reset();
  ['id', 'name', 'email', 'notes'].forEach((key) => setValue(`#manager-${key}`, item[key]));
  setValue('#manager-department', item.department?.id);
  modal('#manager-modal').show();
}
function openCandidate(item = {}) {
  document.querySelector('#candidate-form').reset();
  ['id', 'name', 'email', 'phone', 'position', 'notes'].forEach((key) => setValue(`#candidate-${key}`, item[key]));
  setValue('#candidate-department', item.department?.id);
  modal('#candidate-modal').show();
}

function zonedLocalToIso(date, time, timezone) {
  const [year, month, day] = date.split('-').map(Number); const [hour, minute] = time.split(':').map(Number);
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 3; i += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
    const shown = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    guess += Date.UTC(year, month - 1, day, hour, minute) - shown;
  }
  return new Date(guess).toISOString();
}
function localParts(iso, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
function timezoneLabel(timezone) { const label = IPEBG_TIMEZONES.find((item) => item[1] === timezone)?.[0] || timezone; const cities = TIMEZONE_MAJOR_CITIES[timezone]; return cities ? `${label}, ${cities}` : label; }
async function openAvailability(type, item) {
  setValue('#availability-type', type); setValue('#availability-owner', item.id);
  document.querySelector('#availability-person').textContent = `${item.name}｜時區依每個時段設定`;
  setValue('#availability-date', new Date().toISOString().slice(0, 10)); setValue('#availability-start', '09:00'); setValue('#availability-end', '10:00'); setValue('#availability-timezone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  modal('#availability-modal').show(); await loadAvailability();
}
async function loadAvailability() {
  const type = value('#availability-type'); const id = value('#availability-owner');
  const data = await API.request(`/hr/${type === 'manager' ? 'managers' : 'candidates'}/${id}/slots`);
  state.availability = data; renderAvailability();
}
function renderAvailability() {
  const { slots } = state.availability;
  const grouped = slots.reduce((all, slot) => { const date = localParts(slot.starts_at, slot.timezone).date; (all[date] ||= []).push(slot); return all; }, {});
  const today = new Date(); const days = Array.from({ length: 14 }, (_, index) => { const day = new Date(today); day.setDate(day.getDate() + index); return day.toISOString().slice(0, 10); });
  document.querySelector('#availability-calendar').innerHTML = days.map((date) => `<button type="button" class="calendar-chip ${grouped[date]?.length ? 'has-slots' : ''}" data-pick-date="${date}"><span>${new Date(`${date}T00:00:00`).toLocaleDateString('zh-TW', { weekday: 'short' })}</span><strong>${date.slice(5)}</strong><small>${grouped[date]?.length || 0} 個時段</small></button>`).join('');
  document.querySelector('#availability-list').innerHTML = slots.map((slot) => { const start = localParts(slot.starts_at, slot.timezone); const end = localParts(slot.ends_at, slot.timezone); return `<div class="slot-row"><div><strong>${start.date}</strong><span>${start.time}–${end.time}</span><code class="ms-2">${API.escape(slot.timezone)}</code></div><button class="btn btn-sm btn-outline-danger" data-delete-slot="${slot.id}">刪除</button></div>`; }).join('') || '<div class="empty">預設沒有可用時間，請從上方新增。</div>';
}

async function openAvailabilityCalendar(type, item) {
  state.availabilityContext = { type, ownerId: item.id, personName: item.name, month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), selectedDate: new Date().toISOString().slice(0, 10) };
  document.querySelector('#availability-person').textContent = item.name;
  document.querySelector('#availability-modal .modal-body').innerHTML = `<div class="d-flex align-items-center justify-content-between mb-3"><button class="btn btn-outline-secondary btn-sm" type="button" data-calendar-prev>‹ 上個月</button><h3 class="h5 mb-0" id="calendar-month-title"></h3><button class="btn btn-outline-secondary btn-sm" type="button" data-calendar-next>下個月 ›</button></div><div class="calendar-grid" id="month-calendar"></div>`;
  if (!document.querySelector('#time-picker-modal')) {
    document.body.insertAdjacentHTML('beforeend', '<div class="modal fade" id="time-picker-modal" tabindex="-1"><div class="modal-dialog modal-availability"><div class="modal-content"><div class="modal-header"><h2 class="modal-title h5">選擇當天可用時間</h2><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body" id="time-picker-content"></div></div></div></div>');
  }
  modal('#availability-modal').show();
  await loadAvailabilityCalendar();
}
async function loadAvailabilityCalendar() {
  const context = state.availabilityContext;
  const path = context.type === 'manager' ? 'managers' : 'candidates';
  const [availability, interviewData] = await Promise.all([API.request(`/hr/${path}/${context.ownerId}/slots`), context.type === 'manager' ? API.request('/hr/interviews?status=scheduled') : Promise.resolve({ interviews: [] })]);
  state.availability = { ...availability, bookedIntervals: (interviewData.interviews || []).filter((interview) => interview.managers?.some((manager) => manager.id === context.ownerId)).map((interview) => ({ startsAt: interview.starts_at, endsAt: interview.ends_at })) };
  renderMonthCalendar();
}
function availabilityRanges(slots) {
  const groups = slots.reduce((result, slot) => { const local = localParts(slot.starts_at, slot.timezone); (result[local.date] ||= []).push(slot); return result; }, {});
  return Object.fromEntries(Object.entries(groups).map(([date, entries]) => {
    const ordered = [...entries].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)); const ranges = [];
    for (const slot of ordered) { const last = ranges.at(-1); const location = slot.location || slot.timezone; if (last && new Date(last.endsAt).getTime() === new Date(slot.starts_at).getTime() && last.timezone === slot.timezone && last.location === location) last.endsAt = slot.ends_at; else ranges.push({ startsAt: slot.starts_at, endsAt: slot.ends_at, timezone: slot.timezone, location }); }
    const display = (range, timezone, showDate = false) => { const start = localParts(range.startsAt, timezone); const end = localParts(range.endsAt, timezone); const startText = showDate ? `${start.date.slice(5)} ${start.time}` : start.time; const endText = start.date !== end.date || showDate ? `${end.date.slice(5)} ${end.time}` : end.time; return `${startText}–${endText}`; };
    const timezone = ranges[0]?.timezone || TAIWAN_TIMEZONE; const location = timezoneLabel(timezone);
    return [date, { timezone, location, local: ranges.map((range) => display(range, range.timezone)), taiwan: timezone === TAIWAN_TIMEZONE ? [] : ranges.map((range) => display(range, TAIWAN_TIMEZONE, true)) }];
  }));
}
function renderMonthCalendar() {
  const { month } = state.availabilityContext;
  document.querySelector('#calendar-month-title').textContent = month.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' });
  const firstWeekday = month.getDay(); const totalDays = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const rangesByDate = availabilityRanges(state.availability.slots);
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'].map((day) => `<div class="calendar-weekday">${day}</div>`).join('');
  const blanks = Array.from({ length: firstWeekday }, () => '<div class="calendar-day outside"></div>').join('');
  const days = Array.from({ length: totalDays }, (_, index) => { const day = index + 1; const date = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; const summary = rangesByDate[date]; const rows = summary ? [...summary.local.slice(0, 2).map((range) => ['', range]), ...summary.taiwan.slice(0, 2).map((range) => ['台', range])] : []; return `<button type="button" class="calendar-day ${summary ? 'has-slots' : ''}" data-calendar-date="${date}"><span class="day-number">${day}</span>${summary ? `<span class="day-location"><i class="bi bi-geo-alt"></i> ${API.escape(summary.location)}</span><span class="day-count">${rows.map(([label, range]) => `<span class="calendar-time-row ${label ? 'has-label' : ''}">${label ? `<b>${label}</b>` : ''}<span>${API.escape(range)}</span></span>`).join('')}</span>` : ''}</button>`; }).join('');
  document.querySelector('#month-calendar').innerHTML = weekdays + blanks + days;
}
function renderCalendarDay() {
  const date = state.availabilityContext.selectedDate;
  const matchingSlots = state.availability.slots.filter((slot) => localParts(slot.starts_at, slot.timezone).date === date);
  const timezone = document.querySelector('#calendar-day-timezone')?.value || matchingSlots[0]?.timezone || TAIWAN_TIMEZONE;
  const location = timezoneLabel(timezone);
  const selected = new Set(matchingSlots.filter((slot) => slot.timezone === timezone).map((slot) => localParts(slot.starts_at, timezone).time));
  const times = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`);
  const endTime = (time) => { const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + 30; return minutes === 1440 ? '24:00' : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; };
  const siteOptions = IPEBG_TIMEZONES.map(([, zone], index) => `<option value="${index}" ${zone === timezone ? 'selected' : ''}>${API.escape(timezoneLabel(zone))}</option>`).join('');
  const taiwanRange = (time) => { const startsAt = zonedLocalToIso(date, time, timezone); const start = localParts(startsAt, TAIWAN_TIMEZONE); const end = localParts(new Date(new Date(startsAt).getTime() + 30 * 60_000).toISOString(), TAIWAN_TIMEZONE); const prefix = start.date === date ? '' : `${start.date.slice(5)} `; const endPrefix = end.date === start.date ? '' : `${end.date.slice(5)} `; return `${prefix}${start.time}–${endPrefix}${end.time}`; };
  document.querySelector('#time-picker-content').innerHTML = `<div class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-3"><div><h4 class="h5 mb-0">${API.escape(date)}</h4><div class="dual-time-legend mt-2"><span>主管當地</span>${timezone !== TAIWAN_TIMEZONE ? '<span>台灣對照</span>' : ''}</div></div><div class="timezone-controls"><label class="form-label">當天所在時區</label><select class="form-select" id="calendar-site-location">${siteOptions}</select><input type="hidden" id="calendar-day-timezone" value="${API.escape(timezone)}"></div></div><p class="small text-muted-app">勾選代表有空，每格為 30 分鐘；海外時區會同步顯示台灣時間。</p><div class="time-slot-grid">${times.map((time) => `<div class="time-check"><input type="checkbox" id="time-${time.replace(':', '')}" value="${time}" ${selected.has(time) ? 'checked' : ''}><label for="time-${time.replace(':', '')}"><strong>${time}–${endTime(time)}</strong>${timezone !== TAIWAN_TIMEZONE ? `<small>台灣 ${taiwanRange(time)}</small>` : ''}</label></div>`).join('')}</div><button class="btn btn-primary w-100 mt-4" type="button" data-save-calendar-day>儲存當天時段</button>`;
}

async function loadPeople() {
  try {
    const [managerData, candidateData] = await Promise.all([API.request('/hr/managers'), API.request('/hr/candidates')]);
    state.managers = managerData.managers; state.candidates = candidateData.candidates;
    document.querySelector('#match-candidate').innerHTML = '<option value="">請選擇</option>' + state.candidates.map((item) => `<option value="${item.id}">${API.escape(item.name)}｜${API.escape(item.position)}</option>`).join('');
    document.querySelector('#match-managers').innerHTML = state.managers.map((item) => `<label class="participant-check"><input type="checkbox" value="${item.id}"><span><strong>${API.escape(item.name)}</strong><small>${API.escape(item.department?.name)}</small></span></label>`).join('') || '<div class="empty py-3">尚未建立主管。</div>';
    state.matches = [];
    document.querySelector('#match-count').textContent = '';
    document.querySelector('#match-results').innerHTML = '<div class="empty">請選擇面試者、所有參與主管與日期後重新媒合。</div>';
  } catch (error) { notify(error.message, 'danger'); }
}
function renderMatches() {
  document.querySelector('#match-count').textContent = `${state.matches.length} 個所有人同時有空的時段`;
  document.querySelector('#match-results').innerHTML = state.matches.map((slot, index) => { const candidate = slot.participants[0]; return `<article class="match-card"><div><div class="fw-bold">${API.escape(candidate.startsAtLocal)} – ${API.escape(candidate.endsAtLocal.split(' ').at(-1))}</div><small class="text-muted-app">面試者與 ${slot.participants.length - 1} 位已勾選主管皆有空</small><details><summary>查看所有人的所在地與當地時間</summary>${slot.participants.map((person) => `<div>${API.escape(person.name)}｜${API.escape(person.location || person.timezone)} <code>${API.escape(person.startsAtLocal)}–${API.escape(person.endsAtLocal.split(' ').at(-1))}</code> ${API.escape(person.timezone)}</div>`).join('')}</details></div><button class="btn btn-primary btn-sm" data-book-match="${index}">選擇</button></article>`; }).join('') || '<div class="empty">面試者與所有已勾選主管沒有共同空檔，請調整日期或參與主管。</div>';
}

async function loadInterviews() {
  document.querySelector('#interview-table').innerHTML = tableSkeleton(7, 5);
  try { const query = new URLSearchParams({ search: value('#interview-search'), status: value('#interview-status') }); const data = await API.request(`/hr/interviews?${query}`); state.interviews = data.interviews.map(withMeetingUrl); state.interviewPage = 1; renderInterviews(); }
  catch (error) { notify(error.message, 'danger'); }
}
function renderInterviews() {
  const sort = value('#interview-sort');
  const ordered = [...state.interviews].sort((a, b) => sort === 'candidate' ? String(a.candidate?.name || '').localeCompare(String(b.candidate?.name || ''), 'zh-Hant') : (new Date(a.starts_at) - new Date(b.starts_at)) * (sort === 'latest' ? -1 : 1));
  const totalPages = Math.max(1, Math.ceil(ordered.length / state.interviewPageSize)); state.interviewPage = Math.min(state.interviewPage, totalPages);
  const startIndex = (state.interviewPage - 1) * state.interviewPageSize; const page = ordered.slice(startIndex, startIndex + state.interviewPageSize);
  const formatter = new Intl.DateTimeFormat('zh-TW', { timeZone: TAIWAN_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const timeParts = (iso) => Object.fromEntries(formatter.formatToParts(new Date(iso)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const urlFrom = meetingUrlFromNotes;
  document.querySelector('#interview-table').innerHTML = page.map((item) => { const start = timeParts(item.starts_at); const end = timeParts(item.ends_at); const meetingUrl = urlFrom(item.notes); const notes = String(item.notes || '').replace(meetingUrl || '', '').trim(); return `<tr><td class="primary-time" title="UTC：${API.escape(item.starts_at)} – ${API.escape(item.ends_at)}"><strong>${start.year}/${start.month}/${start.day}（${start.weekday}）</strong><span>${start.hour}:${start.minute} – ${end.hour}:${end.minute}</span><small>台灣時間 Asia/Taipei</small></td><td><div class="person-cell"><span class="avatar">${API.escape((item.candidate?.name || '?').slice(0, 1).toUpperCase())}</span><strong>${API.escape(item.candidate?.name)}</strong></div></td><td><div class="manager-stack">${item.managers.map((manager) => `<span><strong>${API.escape(manager.name)}</strong><small>${API.escape(manager.department?.name)}</small></span>`).join('')}</div></td><td>${statusBadge(item.status)}</td><td>${meetingUrl ? `<a class="meeting-link" href="${API.escape(meetingUrl)}" target="_blank" rel="noopener noreferrer"><i class="bi bi-camera-video"></i>開啟會議</a>` : '<span class="text-muted-app">未提供</span>'}</td><td class="notes-cell">${API.escape(notes || '—')}</td><td class="text-end text-nowrap action-cell"><button class="btn btn-sm btn-outline-primary" data-edit-interview="${item.id}"><i class="bi bi-pencil me-1"></i>編輯</button> <button class="btn btn-sm btn-outline-danger" data-delete-interview="${item.id}"><i class="bi bi-trash me-1"></i>刪除</button></td></tr>`; }).join('') || empty(7, '沒有符合條件的面試。');
  document.querySelector('#interview-range').textContent = ordered.length ? `顯示第 ${startIndex + 1}–${Math.min(startIndex + state.interviewPageSize, ordered.length)} 筆，共 ${ordered.length} 筆` : '共 0 筆';
  document.querySelector('#interview-page').textContent = `${state.interviewPage} / ${totalPages}`;
  document.querySelector('#interview-prev').disabled = state.interviewPage <= 1; document.querySelector('#interview-next').disabled = state.interviewPage >= totalPages;
}

function setupInterviewCalendar() {
  const table = document.querySelector('#interview-table');
  const panel = table?.closest('.panel');
  if (!panel || document.querySelector('#interview-calendar')) return;
  table.closest('.table-responsive').hidden = true;
  panel.querySelector('.table-footer').hidden = true;
  const calendar = document.createElement('div');
  calendar.id = 'interview-calendar';
  calendar.className = 'p-3 p-md-4';
  panel.append(calendar);
}
async function showInterviewDetails(item) {
  let panel = document.querySelector('#interview-detail-panel');
  if (!panel) { panel = document.createElement('div'); panel.id = 'interview-detail-panel'; document.querySelector('#interview-calendar').before(panel); }
  const time = new Intl.DateTimeFormat('zh-TW', { timeZone: TAIWAN_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const start = time.format(new Date(item.starts_at)); const end = time.format(new Date(item.ends_at));
  const meetingUrl = meetingUrlFromNotes(item.notes); const notes = notesWithoutMeetingUrl(item.notes);
  panel.innerHTML = `<article class="booking-panel mb-4"><div class="d-flex justify-content-between align-items-start gap-3"><div><p class="eyebrow mb-1">Interview details</p><h3 class="h5 mb-0">面試詳細資料</h3></div><button class="btn-close" type="button" data-close-interview-details aria-label="關閉"></button></div><div class="row g-3 mt-1"><div class="col-md-6"><strong>面試者</strong><div id="detail-candidate">${API.escape(item.candidate?.name)} <small class="text-muted-app">（讀取時區中…）</small></div></div><div class="col-md-6"><strong>參與主管</strong><div id="detail-managers">${item.managers.map((manager) => `<div>${API.escape(manager.name)} <small class="text-muted-app">（讀取時區中…）</small></div>`).join('')}</div></div><div class="col-md-6"><strong>面試時間</strong><div>${API.escape(start)} – ${API.escape(end)}</div><small class="text-muted-app">台灣時間 Asia/Taipei</small></div><div class="col-md-6"><strong>狀態</strong><div>${statusBadge(item.status)}</div></div><div class="col-12"><strong>備註</strong><div class="notes-cell mt-1">${API.escape(notes || '—')}</div></div><div class="col-12"><strong>會議連結</strong><div class="mt-1">${meetingUrl ? `<a class="meeting-link" href="${API.escape(meetingUrl)}" target="_blank" rel="noopener noreferrer"><i class="bi bi-camera-video"></i>開啟會議</a>` : '<span class="text-muted-app">未提供</span>'}</div></div><div class="col-12 d-flex justify-content-end gap-2"><button class="btn btn-light" type="button" data-close-interview-details>關閉</button><button class="btn btn-primary" type="button" data-start-interview-edit="${item.id}"><i class="bi bi-pencil me-1"></i>編輯</button></div></div></article>`;
  panel.querySelector(`[data-start-interview-edit="${item.id}"]`).insertAdjacentHTML('afterend', `<button class="btn btn-outline-danger" type="button" data-delete-current-interview="${item.id}"><i class="bi bi-trash me-1"></i>刪除</button>`);
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const findTimezone = async (type, person) => {
    const path = type === 'candidate' ? 'candidates' : 'managers';
    const data = await API.request(`/hr/${path}/${person.id}/slots`);
    return data.slots.find((slot) => new Date(slot.starts_at) <= new Date(item.starts_at) && new Date(slot.ends_at) >= new Date(item.ends_at))?.timezone || '未設定時區';
  };
  try {
    const [candidateTimezone, ...managerTimezones] = await Promise.all([findTimezone('candidate', item.candidate), ...item.managers.map((manager) => findTimezone('manager', manager))]);
    const candidateNode = panel.querySelector('#detail-candidate'); if (candidateNode) candidateNode.innerHTML = `${API.escape(item.candidate.name)} <small class="text-muted-app">（${API.escape(candidateTimezone)}）</small>`;
    const managerNode = panel.querySelector('#detail-managers'); if (managerNode) managerNode.innerHTML = item.managers.map((manager, index) => `<div>${API.escape(manager.name)} <small class="text-muted-app">（${API.escape(managerTimezones[index])}）</small></div>`).join('');
  } catch (error) { notify(`無法讀取參與者時區：${error.message}`, 'danger'); }
}

function openInterview(item, isMatch = false) {
  if (isMatch) {
    const candidate = state.candidates.find((entry) => entry.id === value('#match-candidate'));
    const managers = item.participants.slice(1).map((person) => state.managers.find((entry) => entry.id === person.id));
    state.pendingInterview = { candidateId: candidate.id, managerIds: managers.map((manager) => manager.id), startsAt: item.startsAt, endsAt: item.endsAt };
    let panel = document.querySelector('#booking-panel');
    if (!panel) { panel = document.createElement('div'); panel.id = 'booking-panel'; document.querySelector('#match-results').before(panel); }
    panel.innerHTML = `<form class="booking-panel mb-4" id="inline-interview-form"><div class="d-flex justify-content-between align-items-start gap-3"><div><p class="eyebrow mb-1">Confirm interview</p><h3 class="h5">確認建立面試</h3></div><button class="btn-close" type="button" data-cancel-booking></button></div><div class="row g-3 mt-1"><div class="col-md-6"><strong>面試者</strong><div>${API.escape(candidate.name)}</div></div><div class="col-md-6"><strong>參與主管</strong><div>${managers.map((manager) => API.escape(manager.name)).join('、')}</div></div><div class="col-12"><strong>所有參與者的當地時間</strong>${item.participants.map((person) => `<div class="small mt-1">${API.escape(person.name)}：<code>${API.escape(person.startsAtLocal)}–${API.escape(person.endsAtLocal.split(' ').at(-1))}</code>（${API.escape(person.timezone)}）</div>`).join('')}</div><div class="col-12"><label class="form-label" for="inline-interview-notes">備註／Meeting URL／會議室</label><textarea class="form-control" id="inline-interview-notes" rows="3"></textarea></div><div class="col-12 d-flex justify-content-end gap-2"><button class="btn btn-light" type="button" data-cancel-booking>取消</button><button class="btn btn-primary" type="submit">確認建立面試</button></div></div></form>`;
    const noteLabel = panel.querySelector('label[for="inline-interview-notes"]');
    noteLabel.textContent = '備註';
    noteLabel.closest('.col-12').insertAdjacentHTML('afterend', '<div class="col-12"><label class="form-label" for="inline-interview-meeting-url">會議連結</label><input class="form-control" id="inline-interview-meeting-url" type="url" placeholder="https://..."></div>');
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (!isMatch && (!item?.candidate || !Array.isArray(item.managers))) {
    notify('無法取得面試資料，請重新整理後再試。', 'danger');
    return;
  }
  const candidate = isMatch ? state.candidates.find((entry) => entry.id === value('#match-candidate')) : item.candidate;
  const managers = isMatch ? item.participants.slice(1).map((person) => state.managers.find((entry) => entry.id === person.id)) : item.managers;
  if (!isMatch) {
    let panel = document.querySelector('#interview-edit-panel');
    if (!panel) { panel = document.createElement('div'); panel.id = 'interview-edit-panel'; document.querySelector('#interview-table').closest('.panel').before(panel); }
    panel.innerHTML = `<form class="booking-panel mb-4" id="inline-interview-edit-form"><div class="d-flex justify-content-between align-items-start gap-3"><div><p class="eyebrow mb-1">Edit interview</p><h3 class="h5 mb-0">編輯面試</h3></div><button class="btn-close" type="button" data-cancel-interview-edit aria-label="關閉"></button></div><input type="hidden" id="inline-interview-id" value="${API.escape(item.id)}"><input type="hidden" id="inline-interview-candidate" value="${API.escape(candidate.id)}"><input type="hidden" id="inline-interview-managers" value="${API.escape(managers.map((manager) => manager.id).join(','))}"><input type="hidden" id="inline-interview-start" value="${API.escape(item.starts_at)}"><input type="hidden" id="inline-interview-end" value="${API.escape(item.ends_at)}"><div class="row g-3 mt-1"><div class="col-md-6"><strong>面試者</strong><div>${API.escape(candidate.name)}</div></div><div class="col-md-6"><strong>參與主管</strong><div>${managers.map((manager) => API.escape(manager.name)).join('、')}</div></div><div class="col-md-6"><label class="form-label">開始時間（UTC）</label><input class="form-control" value="${API.escape(item.starts_at)}" readonly></div><div class="col-md-6"><label class="form-label">結束時間（UTC）</label><input class="form-control" value="${API.escape(item.ends_at)}" readonly></div><div class="col-md-5"><label class="form-label" for="inline-edit-interview-status">狀態</label><select class="form-select" id="inline-edit-interview-status"><option value="scheduled" ${item.status === 'scheduled' ? 'selected' : ''}>已排程</option><option value="completed" ${item.status === 'completed' ? 'selected' : ''}>已完成</option><option value="cancelled" ${item.status === 'cancelled' ? 'selected' : ''}>已取消</option></select></div><div class="col-12"><label class="form-label" for="inline-edit-interview-notes">備註／Meeting URL／會議室</label><textarea class="form-control" id="inline-edit-interview-notes" rows="3">${API.escape(item.notes || '')}</textarea></div><div class="col-12 d-flex justify-content-end gap-2"><button class="btn btn-light" type="button" data-cancel-interview-edit>取消</button><button class="btn btn-primary" type="submit">儲存修改</button></div></div></form>`;
    const editNotes = panel.querySelector('#inline-edit-interview-notes');
    panel.querySelectorAll('input[readonly]').forEach((input) => { input.closest('.col-md-6')?.setAttribute('hidden', ''); });
    const statusSelect = panel.querySelector('#inline-edit-interview-status');
    statusSelect.querySelector('option[value="cancelled"]')?.remove();
    panel.querySelector('h3')?.insertAdjacentHTML('beforeend', ' <small class="text-muted-app fw-normal">（面試時間無法直接修改；若要更改時間，請先刪除此面試，再重新媒合時段建立新的面試。）</small>');
    statusSelect.dataset.originalStatus = item.status === 'cancelled' ? 'scheduled' : item.status;
    editNotes.value = notesWithoutMeetingUrl(item.notes);
    const editNoteLabel = panel.querySelector('label[for="inline-edit-interview-notes"]');
    editNoteLabel.textContent = '備註';
    editNoteLabel.closest('.col-12').insertAdjacentHTML('afterend', `<div class="col-12"><label class="form-label" for="inline-edit-interview-meeting-url">會議連結</label><input class="form-control" id="inline-edit-interview-meeting-url" type="url" value="${API.escape(meetingUrlFromNotes(item.notes))}" placeholder="https://..."></div>`);
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  setValue('#interview-id', isMatch ? '' : item.id); setValue('#interview-candidate', candidate.id);
  setValue('#interview-start', item.startsAt || item.starts_at); setValue('#interview-end', item.endsAt || item.ends_at);
  setValue('#edit-interview-status', item.status || 'scheduled'); setValue('#interview-notes', item.notes || '');
  document.querySelector('#interview-participants').innerHTML = `<strong>面試者：</strong>${API.escape(candidate.name)}<br><strong>主管：</strong>${managers.map((manager) => API.escape(manager.name)).join('、')}<input type="hidden" id="interview-managers" value="${managers.map((manager) => manager.id).join(',')}">`;
  document.querySelector('#interview-form button[type="submit"]').textContent = isMatch ? '建立面試' : '儲存修改'; modal('#interview-modal').show();
}

document.querySelector('#section-nav').addEventListener('click', (event) => { const button = event.target.closest('[data-section]'); if (button) showSection(button.dataset.section); });
document.addEventListener('click', async (event) => {
  const dismiss = event.target.closest('[data-bs-dismiss="modal"]');
  if (dismiss && !window.bootstrap?.Modal) { const targetModal = dismiss.closest('.modal'); if (targetModal) modal(`#${targetModal.id}`).hide(); return; }
  const go = event.target.closest('[data-go]'); if (go) return showSection(go.dataset.go);
  if (event.target.closest('[data-cancel-booking]')) { document.querySelector('#booking-panel')?.remove(); state.pendingInterview = null; return; }
  if (event.target.closest('[data-cancel-interview-edit]')) { document.querySelector('#interview-edit-panel')?.remove(); return; }
  if (event.target.closest('[data-close-interview-details]')) { document.querySelector('#interview-detail-panel')?.remove(); return; }
  const deleteCurrentInterview = event.target.closest('[data-delete-current-interview]');
  if (deleteCurrentInterview && confirm('確定刪除這筆面試？刪除後才能重新媒合時間。')) { try { await API.request(`/hr/interviews/${deleteCurrentInterview.dataset.deleteCurrentInterview}`, { method: 'DELETE' }); document.querySelector('#interview-detail-panel')?.remove(); notify('面試已刪除，現在可重新媒合時段。'); loadInterviews(); } catch (error) { notify(error.message, 'danger'); } return; }
  if (event.target.closest('[data-new-manager]')) { await loadDepartments(); return openManager(); }
  if (event.target.closest('[data-new-candidate]')) { await loadDepartments(); return openCandidate(); }
  const refresh = event.target.closest('[data-refresh]'); if (refresh) return refresh.dataset.refresh === 'managers' ? loadManagers() : refresh.dataset.refresh === 'candidates' ? loadCandidates() : loadInterviews();
  const editManager = event.target.closest('[data-edit-manager]'); if (editManager) return openManager(state.managers.find((item) => item.id === editManager.dataset.editManager));
  const editCandidate = event.target.closest('[data-edit-candidate]'); if (editCandidate) return openCandidate(state.candidates.find((item) => item.id === editCandidate.dataset.editCandidate));
  const editDepartment = event.target.closest('[data-edit-department]'); if (editDepartment) return openDepartment(state.departments.find((item) => item.id === editDepartment.dataset.editDepartment));
  const deleteDepartment = event.target.closest('[data-delete-department]'); if (deleteDepartment && confirm('確定刪除此部門？此操作無法復原。若部門仍有主管或面試者使用，系統會拒絕刪除。')) { try { await API.request(`/hr/departments/${deleteDepartment.dataset.deleteDepartment}`, { method: 'DELETE' }); notify('部門已刪除。'); loadDepartments(); } catch (error) { notify(error.message, 'danger'); } return; }
  const managerSlots = event.target.closest('[data-manager-slots]'); if (managerSlots) return openAvailabilityCalendar('manager', state.managers.find((item) => item.id === managerSlots.dataset.managerSlots));
  const candidateSlots = event.target.closest('[data-candidate-slots]'); if (candidateSlots) return openAvailabilityCalendar('candidate', state.candidates.find((item) => item.id === candidateSlots.dataset.candidateSlots));
  const calendarDate = event.target.closest('[data-calendar-date]'); if (calendarDate) { state.availabilityContext.selectedDate = calendarDate.dataset.calendarDate; renderCalendarDay(); modal('#time-picker-modal').show(); return; }
  if (event.target.closest('[data-calendar-prev]') || event.target.closest('[data-calendar-next]')) { state.availabilityContext.month.setMonth(state.availabilityContext.month.getMonth() + (event.target.closest('[data-calendar-next]') ? 1 : -1)); renderMonthCalendar(); return; }
  if (event.target.closest('[data-save-calendar-day]')) { const context = state.availabilityContext; const timezone = value('#calendar-day-timezone'); const location = timezoneLabel(timezone); const selectedTimes = [...document.querySelectorAll('#time-picker-content .time-check input:checked')].map((input) => input.value); try { const path = context.type === 'manager' ? 'managers' : 'candidates'; await API.request(`/hr/${path}/${context.ownerId}/slots/day`, { method: 'PUT', body: JSON.stringify({ date: context.selectedDate, timezone, location, selectedTimes }) }); modal('#time-picker-modal').hide(); notify('當天時區與可用時段已儲存。'); await loadAvailabilityCalendar(); } catch (error) { notify(error.message, 'danger'); } return; }
  const pickDate = event.target.closest('[data-pick-date]'); if (pickDate) return setValue('#availability-date', pickDate.dataset.pickDate);
  const book = event.target.closest('[data-book-match]'); if (book) return openInterview(state.matches[Number(book.dataset.bookMatch)], true);
  if (event.target.closest('[data-interview-calendar-prev]') || event.target.closest('[data-interview-calendar-next]')) {
    const offset = event.target.closest('[data-interview-calendar-next]') ? 1 : -1;
    state.interviewCalendarMonth.setMonth(state.interviewCalendarMonth.getMonth() + offset); renderInterviews(); return;
  }
  const calendarInterview = event.target.closest('.interview-calendar-event');
  if (calendarInterview) { const item = state.interviews.find((interview) => interview.id === calendarInterview.dataset.editInterview); if (item) showInterviewDetails(item); return; }
  const startInterviewEdit = event.target.closest('[data-start-interview-edit]');
  if (startInterviewEdit) { const item = state.interviews.find((interview) => interview.id === startInterviewEdit.dataset.startInterviewEdit); document.querySelector('#interview-detail-panel')?.remove(); if (item) openInterview(item); return; }
  const editInterview = event.target.closest('[data-edit-interview]');
  if (editInterview) {
    const interviewId = editInterview.dataset.editInterview;
    const localInterview = state.interviews.find((item) => item.id === interviewId);
    try {
      // Re-read the selected record so Edit remains reliable after a page refresh,
      // a filter change, or another HR user's update.
      const interview = localInterview || (await API.request(`/hr/interviews/${interviewId}`)).interview;
      openInterview(interview);
    } catch (error) { notify(error.message, 'danger'); }
    return;
  }
  const actions = [['deleteManager', 'managers', '主管', loadManagers], ['deleteCandidate', 'candidates', '面試者', loadCandidates], ['deleteInterview', 'interviews', '面試', loadInterviews]];
  for (const [dataset, path, label, reload] of actions) { const target = event.target.closest(`[data-${dataset.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`); if (target && confirm(`確定刪除這筆${label}資料？`)) { try { await API.request(`/hr/${path}/${target.dataset[dataset]}`, { method: 'DELETE' }); notify(`${label}已刪除。`); reload(); } catch (error) { notify(error.message, 'danger'); } return; } }
  const deleteSlot = event.target.closest('[data-delete-slot]'); if (deleteSlot && confirm('確定刪除此時段？')) { const type = value('#availability-type'); try { await API.request(`/hr/${type === 'manager' ? 'managers' : 'candidates'}/${value('#availability-owner')}/slots/${deleteSlot.dataset.deleteSlot}`, { method: 'DELETE' }); await loadAvailability(); } catch (error) { notify(error.message, 'danger'); } }
});

document.querySelector('#manager-form').addEventListener('submit', async (event) => { event.preventDefault(); const id = value('#manager-id'); const payload = { name: value('#manager-name'), email: value('#manager-email'), departmentId: value('#manager-department'), notes: value('#manager-notes') }; try { await API.request(id ? `/hr/managers/${id}` : '/hr/managers', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) }); modal('#manager-modal').hide(); notify('主管資料已儲存。'); loadManagers(); } catch (error) { notify(error.message, 'danger'); } });
document.querySelector('#candidate-form').addEventListener('submit', async (event) => { event.preventDefault(); const id = value('#candidate-id'); const payload = { name: value('#candidate-name'), email: value('#candidate-email'), phone: value('#candidate-phone'), position: value('#candidate-position'), departmentId: value('#candidate-department'), notes: value('#candidate-notes') }; try { await API.request(id ? `/hr/candidates/${id}` : '/hr/candidates', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) }); modal('#candidate-modal').hide(); notify('面試者資料已儲存。'); loadCandidates(); } catch (error) { notify(error.message, 'danger'); } });
document.querySelector('#availability-form').addEventListener('submit', async (event) => { event.preventDefault(); const type = value('#availability-type'); const timezone = value('#availability-timezone'); try { await API.request(`/hr/${type === 'manager' ? 'managers' : 'candidates'}/${value('#availability-owner')}/slots`, { method: 'POST', body: JSON.stringify({ startsAt: zonedLocalToIso(value('#availability-date'), value('#availability-start'), timezone), endsAt: zonedLocalToIso(value('#availability-date'), value('#availability-end'), timezone), timezone }) }); await loadAvailability(); } catch (error) { notify(error.message, 'danger'); } });
document.querySelector('#match-form').addEventListener('submit', async (event) => { event.preventDefault(); const managerIds = [...document.querySelectorAll('#match-managers input:checked')].map((input) => input.value); try { const data = await API.request('/hr/matches', { method: 'POST', body: JSON.stringify({ candidateId: value('#match-candidate'), managerIds, rangeStart: `${value('#match-from')}T00:00:00Z`, rangeEnd: `${value('#match-to')}T23:59:59Z`, durationMinutes: Number(value('#match-duration')) }) }); state.matches = data.matches; renderMatches(); } catch (error) { notify(error.message, 'danger'); } });
document.querySelector('#interview-form').addEventListener('submit', () => { setValue('#interview-notes', composeInterviewNotes(notesWithoutMeetingUrl(value('#interview-notes')), value('#interview-meeting-url'))); });
document.querySelector('#interview-form').addEventListener('submit', async (event) => { event.preventDefault(); const id = value('#interview-id'); const payload = { candidateId: value('#interview-candidate'), managerIds: value('#interview-managers').split(','), startsAt: value('#interview-start'), endsAt: value('#interview-end'), status: value('#edit-interview-status'), notes: value('#interview-notes') }; try { await API.request(id ? `/hr/interviews/${id}` : '/hr/interviews', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) }); modal('#interview-modal').hide(); notify('面試已儲存。'); showSection('interviews'); } catch (error) { notify(error.message, 'danger'); } });
document.querySelector('#password-form').addEventListener('submit', async (event) => { event.preventDefault(); try { await API.request('/auth/password', { method: 'PATCH', body: JSON.stringify({ currentPassword: value('#current-password'), newPassword: value('#new-password') }) }); API.clearSession(); location.href = 'login.html'; } catch (error) { notify(error.message, 'danger'); } });
document.querySelector('#profile-form').addEventListener('submit', async (event) => { event.preventDefault(); try { const result = await API.request('/auth/profile', { method: 'PATCH', body: JSON.stringify({ name: value('#profile-name'), email: value('#profile-email'), username: value('#profile-username') }) }); const saved = { ...API.profile(), username: result.user.username, full_name: result.profile.name, email: result.profile.email }; localStorage.setItem('interview_profile', JSON.stringify(saved)); renderCurrentUser(result.profile.name); notify('個人資料已更新。'); } catch (error) { notify(error.message, 'danger'); } });
['#manager-search', '#candidate-search', '#interview-search'].forEach((selector) => { let timer; document.querySelector(selector).addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => selector.includes('manager') ? loadManagers() : selector.includes('candidate') ? loadCandidates() : loadInterviews(), 300); }); });
document.querySelector('#interview-status').addEventListener('change', loadInterviews);
document.querySelector('#interview-sort').addEventListener('change', () => { state.interviewPage = 1; renderInterviews(); });
document.querySelector('#interview-page-size').addEventListener('change', (event) => { state.interviewPageSize = Number(event.target.value); state.interviewPage = 1; renderInterviews(); });
document.querySelector('#interview-prev').addEventListener('click', () => { if (state.interviewPage > 1) { state.interviewPage -= 1; renderInterviews(); } });
document.querySelector('#interview-next').addEventListener('click', () => { if (state.interviewPage * state.interviewPageSize < state.interviews.length) { state.interviewPage += 1; renderInterviews(); } });
document.addEventListener('submit', async (event) => {
  if (event.target.matches('#inline-interview-edit-form')) {
    event.preventDefault();
    const button = event.target.querySelector('button[type="submit"]'); button.disabled = true; button.textContent = '儲存中…';
    try {
      await API.request(`/hr/interviews/${value('#inline-interview-id')}`, { method: 'PATCH', body: JSON.stringify({ candidateId: value('#inline-interview-candidate'), managerIds: value('#inline-interview-managers').split(','), startsAt: value('#inline-interview-start'), endsAt: value('#inline-interview-end'), status: value('#inline-edit-interview-status'), notes: composeInterviewNotes(value('#inline-edit-interview-notes'), value('#inline-edit-interview-meeting-url')) }) });
      document.querySelector('#interview-edit-panel')?.remove(); notify('面試已更新。'); loadInterviews();
    } catch (error) { button.disabled = false; button.textContent = '儲存修改'; notify(error.message, 'danger'); }
    return;
  }
  if (!event.target.matches('#inline-interview-form')) return;
  event.preventDefault();
  const button = event.target.querySelector('button[type="submit"]'); button.disabled = true; button.textContent = '建立中…';
  try {
    await API.request('/hr/interviews', { method: 'POST', body: JSON.stringify({ ...state.pendingInterview, status: 'scheduled', notes: composeInterviewNotes(value('#inline-interview-notes'), value('#inline-interview-meeting-url')) }) });
    document.querySelector('#booking-panel')?.remove(); state.pendingInterview = null; notify('面試已成功建立。'); showSection('interviews');
  } catch (error) { button.disabled = false; button.textContent = '確認建立面試'; notify(error.message, 'danger'); }
});
document.querySelector('#match-form').addEventListener('change', () => { state.matches = []; document.querySelector('#match-count').textContent = ''; document.querySelector('#match-results').innerHTML = '<div class="empty">條件已變更，請重新尋找共同空檔。</div>'; });
document.addEventListener('change', (event) => {
  if (event.target.matches('#inline-edit-interview-status')) {
    const select = event.target; const previous = select.dataset.originalStatus || 'scheduled';
    if (select.value === previous) return;
    const message = select.value === 'completed'
      ? '將狀態改為「已完成」後，這筆面試會在三日後自動刪除，以節省資料庫空間。確定要變更嗎？'
      : '確定要變更這筆面試的狀態嗎？';
    if (!confirm(message)) { select.value = previous; return; }
    select.dataset.originalStatus = select.value;
  }
  else if (event.target.matches('#calendar-site-location')) { const site = IPEBG_TIMEZONES[Number(event.target.value)]; if (site) { document.querySelector('#calendar-day-timezone').value = site[1]; renderCalendarDay(); } }
  else if (event.target.matches('#calendar-day-timezone')) renderCalendarDay();
});
document.querySelector('#department-create-form').addEventListener('submit', async (event) => { event.preventDefault(); try { await API.request('/hr/departments', { method: 'POST', body: JSON.stringify({ name: value('#department-create-name') }) }); event.target.reset(); notify('部門已新增。'); loadDepartments(); } catch (error) { notify(error.message, 'danger'); } });
document.querySelector('#department-edit-form').addEventListener('submit', async (event) => { event.preventDefault(); const id = value('#department-edit-id'); try { await API.request(`/hr/departments/${id}`, { method: 'PATCH', body: JSON.stringify({ name: value('#department-edit-name') }) }); modal('#department-edit-modal').hide(); notify('部門已更新。'); loadDepartments(); } catch (error) { notify(error.message, 'danger'); } });

function renderInterviews() {
  const calendar = document.querySelector('#interview-calendar');
  if (!calendar) return;
  const month = state.interviewCalendarMonth || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  state.interviewCalendarMonth = month;
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  const interviewsByDate = state.interviews.reduce((all, interview) => {
    const parts = localParts(interview.starts_at, TAIWAN_TIMEZONE);
    if (parts.date.startsWith(monthKey)) (all[parts.date] ||= []).push({ interview, time: parts.time });
    return all;
  }, {});
  Object.values(interviewsByDate).forEach((entries) => entries.sort((a, b) => a.time.localeCompare(b.time)));
  const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六'].map((day) => `<div class="interview-calendar-weekday">週${day}</div>`).join('');
  const blanks = Array.from({ length: firstDay.getDay() }, () => '<div class="interview-calendar-day outside"></div>').join('');
  const today = new Date().toISOString().slice(0, 10);
  const days = Array.from({ length: lastDay.getDate() }, (_, index) => {
    const day = index + 1;
    const date = `${monthKey}-${String(day).padStart(2, '0')}`;
    const entries = interviewsByDate[date] || [];
    return `<div class="interview-calendar-day ${date === today ? 'today' : ''}"><span class="interview-calendar-date">${day}</span><div class="interview-calendar-events">${entries.map(({ interview, time }) => `<button class="interview-calendar-event status-${API.escape(interview.status)}" data-edit-interview="${interview.id}" title="${API.escape(interview.candidate?.name)} ${API.escape(time)}"><time>${API.escape(time)}</time><span>${API.escape(interview.candidate?.name)}</span></button>`).join('')}</div></div>`;
  }).join('');
  calendar.innerHTML = `<div class="interview-calendar-header"><button class="btn btn-sm btn-outline-secondary" type="button" data-interview-calendar-prev><i class="bi bi-chevron-left"></i> 上個月</button><h2>${month.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' })}</h2><button class="btn btn-sm btn-outline-secondary" type="button" data-interview-calendar-next>下個月 <i class="bi bi-chevron-right"></i></button></div><div class="interview-calendar-grid">${weekdayLabels}${blanks}${days}</div>`;
  document.querySelector('#interview-range').textContent = `${state.interviews.length} 筆面試`;
}

const renderCalendarDayBase = renderCalendarDay;
renderCalendarDay = function renderCalendarDayWithInterviewLocks() {
  renderCalendarDayBase();
  const context = state.availabilityContext;
  if (context?.type !== 'manager') return;
  const timezone = document.querySelector('#calendar-day-timezone')?.value || TAIWAN_TIMEZONE;
  const bookedIntervals = state.availability.bookedIntervals || [];
  document.querySelectorAll('#time-picker-content .time-check input').forEach((input) => {
    const startsAt = zonedLocalToIso(context.selectedDate, input.value, timezone);
    const endsAt = new Date(new Date(startsAt).getTime() + 30 * 60_000).toISOString();
    const isBooked = bookedIntervals.some((interval) => new Date(interval.startsAt) < new Date(endsAt) && new Date(interval.endsAt) > new Date(startsAt));
    if (!isBooked) return;
    input.checked = true;
    input.disabled = true;
    const label = input.nextElementSibling;
    label.title = '此時段已安排面試；若要修改，請先將面試刪除。';
    label.setAttribute('aria-label', label.textContent.trim() + '，此時段已安排面試；若要修改，請先將面試刪除。');
  });
};

function updateTaiwanClock() { const clock = document.querySelector('#taiwan-now'); if (clock) clock.textContent = new Intl.DateTimeFormat('zh-TW', { timeZone: TAIWAN_TIMEZONE, month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()); }
if (hrUser) { if (location.hash === '#timezone') location.replace('/timezone/'); else { document.querySelector('#edit-interview-status option[value="cancelled"]')?.remove(); const start = new Date(); const end = new Date(); end.setDate(end.getDate() + 30); setValue('#match-from', start.toISOString().slice(0, 10)); setValue('#match-to', end.toISOString().slice(0, 10)); setupInterviewCalendar(); updateTaiwanClock(); setInterval(updateTaiwanClock, 60_000); loadDepartments(); loadProfile(); showSection(currentAppView() || location.hash.slice(1) || 'dashboard'); } }
