const helmet = require('helmet');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const isProduction = process.env.NODE_ENV === 'production';
const trustProxy = String(process.env.TRUST_PROXY || '').trim();

const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", 'https://cdn.jsdelivr.net', 'data:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", 'https://cdn.jsdelivr.net', "'unsafe-inline'"],
      upgradeInsecureRequests: isProduction ? [] : null,
    },
  },
  frameguard: { action: 'deny' },
  strictTransportSecurity: isProduction ? undefined : false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT || 600),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: '請求次數過多，請稍後再試。' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_LIMIT || 5),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator(req) {
    const username = String(req.body?.username || '').trim().toLocaleLowerCase() || 'missing';
    return `${ipKeyGenerator(req.ip)}:${username}`;
  },
  message: { message: '登入失敗次數過多，請 15 分鐘後再試。' },
});

function configureTrustProxy(app) {
  if (!trustProxy) return;
  const numeric = Number(trustProxy);
  app.set('trust proxy', Number.isInteger(numeric) ? numeric : trustProxy);
}

module.exports = { securityHeaders, apiLimiter, loginLimiter, configureTrustProxy };
