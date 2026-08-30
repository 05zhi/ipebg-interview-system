const API = {
  profile: () => JSON.parse(localStorage.getItem('interview_profile') || 'null'),
  async request(path, options = {}) {
    const isFormData = options.body instanceof FormData;
    const response = await fetch(`/api${path}`, {
      ...options,
      credentials: 'same-origin',
      headers: {
        ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    const body = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (response.status === 401 && path !== '/auth/login') {
      this.clearSession();
      location.href = 'login.html';
      throw new Error(body?.message || '登入已失效，請重新登入。');
    }
    if (!response.ok) throw new Error(body?.message || '操作失敗，請稍後再試。');
    return body;
  },
  guard(role) {
    const profile = this.profile();
    if (!profile) { location.href = 'login.html'; return null; }
    if (!['administrator', 'hr'].includes(profile.role)) { this.logout(); return null; }
    if (role && profile.role !== role) { location.href = this.homeFor(profile.role); return null; }
    document.querySelectorAll('[data-user-name]').forEach((node) => { node.textContent = profile.full_name || profile.username || profile.email; });
    return profile;
  },
  homeFor(role) { return role === 'administrator' ? 'admin.html' : role === 'hr' ? 'hr.html' : 'login.html'; },
  clearSession() {
    localStorage.removeItem('interview_profile');
  },
  async logout() {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); }
    finally {
      this.clearSession();
      location.href = 'login.html';
    }
  },
  date(value) {
    return new Intl.DateTimeFormat(navigator.language, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    }).format(new Date(value));
  },
  escape(value = '') {
    const node = document.createElement('div'); node.textContent = value ?? ''; return node.innerHTML;
  },
};

document.addEventListener('click', (event) => { if (event.target.closest('[data-logout]')) API.logout(); });
