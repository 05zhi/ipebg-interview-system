const cookieName = process.env.AUTH_COOKIE_NAME || 'interview_session';

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

function tokenFromRequest(req) {
  if (req.cookies?.[cookieName]) return req.cookies[cookieName];
  const match = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function setSessionCookie(res, token) {
  res.cookie(cookieName, token, cookieOptions());
}

function clearSessionCookie(res) {
  res.clearCookie(cookieName, cookieOptions());
}

module.exports = { cookieName, tokenFromRequest, setSessionCookie, clearSessionCookie };
