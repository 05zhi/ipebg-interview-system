const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const hrRoutes = require('./routes/hr');
const { query, isConfigured } = require('./config/database');
const { securityHeaders, apiLimiter, loginLimiter, configureTrustProxy } = require('./middleware/securityMiddleware');

const app = express();
const port = process.env.PORT || 3000;
const frontendPath = path.join(__dirname, '..', 'frontend');
const allowedOrigins = String(process.env.CORS_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean);
const interviewArchiveEnabled = String(process.env.ENABLE_INTERVIEW_ARCHIVE || '').toLowerCase() === 'true';
const configuredArchiveDays = Number(process.env.INTERVIEW_ARCHIVE_AFTER_DAYS || 90);
const interviewArchiveAfterDays = Number.isFinite(configuredArchiveDays) && configuredArchiveDays >= 1 ? configuredArchiveDays : 90;

configureTrustProxy(app);
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(cors({
  origin(origin, callback) {
    if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) return callback(null, true);
    const error = new Error('CORS origin is not allowed.'); error.status = 403; return callback(error);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(frontendPath));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'interview-system', database: isConfigured ? 'configured' : 'not-configured' });
});
app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api', (_req, res) => res.status(404).json({ message: '找不到此 API。' }));

app.use((error, _req, res, _next) => {
  const status = Number(error.status || error.statusCode) || 500;
  if (status >= 500) console.error(error);
  const message = status === 400 ? '請求格式不正確。' : status === 403 ? '此來源不允許連線。' : status === 413 ? '請求內容過大。' : '伺服器發生錯誤，請稍後再試。';
  res.status(status >= 400 && status < 600 ? status : 500).json({ message });
});

app.get('*', (_req, res) => res.sendFile(path.join(frontendPath, 'index.html')));

async function archiveExpiredCompletedInterviews() {
  if (!isConfigured) return;
  const cutoff = new Date(Date.now() - interviewArchiveAfterDays * 24 * 60 * 60 * 1000).toISOString();
  try {
    const result = await query(`update public.interviews set archived_at = now()
      where status = 'completed' and archived_at is null and updated_at < $1 returning id`, [cutoff]);
    if (result.rowCount) console.log(`Archived ${result.rowCount} completed interview(s).`);
  } catch (error) { console.error('Could not archive completed interviews:', error.message); }
}

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Interview System running at http://localhost:${port}`);
    if (interviewArchiveEnabled) {
      archiveExpiredCompletedInterviews();
      setInterval(archiveExpiredCompletedInterviews, 60 * 60 * 1000).unref();
    } else {
      console.log('Automatic interview archiving is disabled.');
    }
  });
}

module.exports = app;
