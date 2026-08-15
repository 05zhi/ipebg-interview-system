const API = {
  token: () => localStorage.getItem('interview_token'),
  profile: () => JSON.parse(localStorage.getItem('interview_profile') || 'null'),
  async request(path, options = {}) {
    const isFormData = options.body instanceof FormData;
    const response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
        ...(this.token() ? { Authorization: `Bearer ${this.token()}` } : {}),
        ...options.headers,
      },
    });
    const body = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (response.status === 401 && path !== '/auth/login') { this.logout(); return null; }
    if (!response.ok) throw new Error(body?.message || '操作失敗，請稍後再試。');
    return body;
  },
  guard(role) {
    const profile = this.profile();
    if (!this.token() || !profile) { location.href = 'login.html'; return null; }
    if (!['administrator', 'hr'].includes(profile.role)) { this.logout(); return null; }
    if (role && profile.role !== role) { location.href = this.homeFor(profile.role); return null; }
    document.querySelectorAll('[data-user-name]').forEach((node) => { node.textContent = profile.full_name || profile.username || profile.email; });
    return profile;
  },
  homeFor(role) { return role === 'administrator' ? 'admin.html' : role === 'hr' ? 'hr.html' : 'login.html'; },
  logout() {
    localStorage.removeItem('interview_token');
    localStorage.removeItem('interview_profile');
    location.href = 'login.html';
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
