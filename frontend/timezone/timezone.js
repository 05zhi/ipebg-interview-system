const profile = JSON.parse(localStorage.getItem('interview_profile') || 'null');
if (!localStorage.getItem('interview_token') || !profile || profile.role !== 'hr') location.replace('../login.html');

const zones = [
  ['台灣、台北 Taipei，高雄 Kaohsiung', 'Asia/Taipei'], ['中國、北京 Beijing，上海 Shanghai，重慶 Chongqing', 'Asia/Shanghai'], ['印度、新德里 New Delhi，孟買 Mumbai，加爾各答 Kolkata', 'Asia/Kolkata'], ['印尼、雅加達 Jakarta，萬隆 Bandung', 'Asia/Jakarta'], ['美國、芝加哥 Chicago，休士頓 Houston，達拉斯 Dallas', 'America/Chicago'], ['美國、洛杉磯 Los Angeles，舊金山 San Francisco，西雅圖 Seattle', 'America/Los_Angeles'], ['美國、紐約 New York，華盛頓 Washington，邁阿密 Miami', 'America/New_York'], ['墨西哥、墨西哥城 Mexico City，瓜達拉哈拉 Guadalajara', 'America/Mexico_City'], ['越南、胡志明市 Ho Chi Minh City，河內 Hanoi', 'Asia/Ho_Chi_Minh'], ['馬來西亞、吉隆坡 Kuala Lumpur，檳城 Penang', 'Asia/Kuala_Lumpur'], ['新加坡 Singapore', 'Asia/Singapore'], ['日本、東京 Tokyo', 'Asia/Tokyo'], ['英國、倫敦 London，曼徹斯特 Manchester', 'Europe/London'], ['捷克、布拉格 Prague', 'Europe/Prague'], ['匈牙利、布達佩斯 Budapest', 'Europe/Budapest'], ['澳洲、雪梨 Sydney，坎培拉 Canberra', 'Australia/Sydney'], ['UTC', 'UTC'],
];
const escapeHtml = (value) => { const node = document.createElement('div'); node.textContent = value; return node.innerHTML; };
function zonedLocalToIso(date, time, timezone) {
  const [year, month, day] = date.split('-').map(Number); const [hour, minute] = time.split(':').map(Number); let guess = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let index = 0; index < 3; index += 1) { const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)])); guess += Date.UTC(year, month - 1, day, hour, minute) - Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute); }
  return new Date(guess).toISOString();
}
function render() {
  const source = document.querySelector('#timezone-source'); const target = document.querySelector('#timezone-target'); const localTime = document.querySelector('#timezone-local-time'); if (!localTime.value) return;
  const [date, time] = localTime.value.split('T'); const converted = new Intl.DateTimeFormat('zh-TW', { timeZone: target.value, year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(zonedLocalToIso(date, time, source.value)));
  document.querySelector('#timezone-result').innerHTML = `<div class="timezone-result-label">換算結果</div><div class="timezone-result-value">${escapeHtml(converted)}</div><div class="text-muted-app mt-1">${escapeHtml(zones.find((zone) => zone[1] === target.value)?.[0] || target.value)}</div>`;
}
const options = zones.map(([label, zone]) => `<option value="${escapeHtml(zone)}">${escapeHtml(label)}</option>`).join('');
document.querySelector('#timezone-source').innerHTML = options; document.querySelector('#timezone-target').innerHTML = options;
document.querySelector('#timezone-source').value = 'Asia/Taipei'; document.querySelector('#timezone-target').value = 'America/New_York';
const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); document.querySelector('#timezone-local-time').value = now.toISOString().slice(0, 16);
document.querySelectorAll('#timezone-source, #timezone-target, #timezone-local-time').forEach((node) => node.addEventListener('change', render));
function renderUserName(name) {
  const userName = name || profile?.full_name || 'HR';
  document.querySelector('#user-name').textContent = userName;
  document.querySelector('.sidebar-profile-avatar').textContent = userName.slice(0, 1).toUpperCase();
}
renderUserName();
fetch('/api/auth/me', { headers: { Authorization: `Bearer ${localStorage.getItem('interview_token')}` } })
  .then((response) => response.ok ? response.json() : null)
  .then((data) => {
    if (!data) return;
    renderUserName(data.profile?.name || data.user?.username);
    localStorage.setItem('interview_profile', JSON.stringify({ ...profile, username: data.user?.username || profile?.username, full_name: data.profile?.name || profile?.full_name, email: data.profile?.email || profile?.email }));
  })
  .catch(() => {});
document.querySelector('#logout').addEventListener('click', () => { localStorage.removeItem('interview_token'); localStorage.removeItem('interview_profile'); location.href = '../login.html'; });
render();
