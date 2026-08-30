const existingUser = API.profile();
if (existingUser && ['administrator', 'hr'].includes(existingUser.role)) {
  fetch('/api/auth/me', { credentials: 'same-origin' }).then((response) => {
    if (response.ok) location.href = API.homeFor(existingUser.role);
    else API.clearSession();
  }).catch(() => API.clearSession());
} else if (existingUser) {
  API.clearSession();
}

document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  const message = document.querySelector('#login-message');
  button.disabled = true; button.textContent = '登入中…'; message.className = 'alert d-none';
  try {
    const result = await API.request('/auth/login', { method: 'POST', body: JSON.stringify({ username: document.querySelector('#username').value.trim(), password: document.querySelector('#password').value }) });
    localStorage.setItem('interview_profile', JSON.stringify(result.user));
    location.href = API.homeFor(result.role);
  } catch (error) {
    message.textContent = error.message; message.className = 'alert alert-danger mt-3 mb-0';
    button.disabled = false; button.textContent = '登入';
  }
});
