'use strict';

const token = new URLSearchParams(location.search).get('token') || '';
const form = document.querySelector('#public-availability-form');
const message = document.querySelector('#availability-message');
let savedSlots = [];

function showMessage(text, type = 'success') {
  message.className = `alert alert-${type}`;
  message.textContent = text;
}

function localParts(iso, timezone) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function renderTimes() {
  const date = document.querySelector('#availability-date').value;
  const timezone = document.querySelector('#availability-timezone').value;
  const selected = new Set(savedSlots.flatMap((slot) => {
    const start = localParts(slot.starts_at, timezone); const end = localParts(slot.ends_at, timezone);
    if (`${start.year}-${start.month}-${start.day}` !== date || `${end.year}-${end.month}-${end.day}` !== date) return [];
    return [`${start.hour}:${start.minute}`];
  }));
  const times = [];
  for (let hour = 0; hour < 24; hour += 1) for (const minute of ['00', '30']) times.push(`${String(hour).padStart(2, '0')}:${minute}`);
  document.querySelector('#availability-times').innerHTML = times.map((time) => `<div class="time-check"><input id="public-time-${time.replace(':', '')}" type="checkbox" value="${time}" ${selected.has(time) ? 'checked' : ''}><label for="public-time-${time.replace(':', '')}"><strong>${time}</strong></label></div>`).join('');
}

async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || '連線失敗，請稍後再試。');
  return body;
}

async function load() {
  if (!token) throw new Error('連結缺少安全憑證。');
  const data = await request(`/api/availability/${encodeURIComponent(token)}`);
  savedSlots = data.slots;
  document.querySelector('#availability-title').textContent = `${data.subject.name}，請填寫可面試時間`;
  document.querySelector('#availability-summary').textContent = `此連結有效至 ${new Date(data.expiresAt).toLocaleString('zh-TW')}。選擇日期、所在地與時區後，可分日儲存。`;
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  document.querySelector('#availability-date').value = tomorrow;
  document.querySelector('#availability-date').min = new Date().toISOString().slice(0, 10);
  form.classList.remove('d-none');
  renderTimes();
}

document.querySelector('#availability-date').addEventListener('change', renderTimes);
document.querySelector('#availability-timezone').addEventListener('change', renderTimes);
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]'); button.disabled = true;
  try {
    const payload = {
      date: document.querySelector('#availability-date').value,
      timezone: document.querySelector('#availability-timezone').value.trim(),
      location: document.querySelector('#availability-location').value.trim(),
      selectedTimes: [...document.querySelectorAll('#availability-times input:checked')].map((input) => input.value),
    };
    await request(`/api/availability/${encodeURIComponent(token)}/day`, { method: 'PUT', body: JSON.stringify(payload) });
    const refreshed = await request(`/api/availability/${encodeURIComponent(token)}`); savedSlots = refreshed.slots;
    renderTimes(); showMessage('這一天的可面試時間已儲存。');
  } catch (error) { showMessage(error.message, 'danger'); }
  finally { button.disabled = false; }
});

load().catch((error) => {
  document.querySelector('#availability-title').textContent = '無法開啟此連結';
  document.querySelector('#availability-summary').textContent = error.message;
  showMessage('請聯絡 HR 重新產生安全連結。', 'danger');
});
