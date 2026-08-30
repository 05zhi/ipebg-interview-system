const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const hrRoutes = require('./routes/hr');
const { query, transaction, isConfigured } = require('./config/database');

const app = express();
const port = process.env.PORT || 3000;
const frontendPath = path.join(__dirname, '..', 'frontend');
const allowedOrigins = String(process.env.CORS_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean);

app.disable('x-powered-by');
app.use(cors({
  origin(origin, callback) {
    if (!origin || !allowedOrigins.length || allowedOrigins.includes(origin)) return callback(null, true);
    const error = new Error('CORS origin is not allowed.'); error.status = 403; return callback(error);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(frontendPath));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'interview-system', database: isConfigured ? 'configured' : 'not-configured' });
});
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

async function purgeExpiredCompletedInterviews() {
  if (!isConfigured) return;
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  try {
    await transaction(async (client) => {
      const expiredInterviews = (await query(`select id, candidate_id from public.interviews
        where status = 'completed' and updated_at < $1 for update`, [cutoff], client)).rows;
      if (!expiredInterviews.length) return;
      const candidateIds = [...new Set(expiredInterviews.map((interview) => interview.candidate_id))];
      await query('delete from public.interviews where id = any($1::uuid[])', [expiredInterviews.map((interview) => interview.id)], client);
      // Only remove candidates that are no longer referenced by another retained interview.
      await query(`delete from public.candidates c where c.id = any($1::uuid[])
        and not exists (select 1 from public.interviews i where i.candidate_id = c.id)`, [candidateIds], client);
    });
  } catch (error) { console.error('Could not purge completed interviews:', error.message); }
}

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Interview System running at http://localhost:${port}`);
    purgeExpiredCompletedInterviews();
    setInterval(purgeExpiredCompletedInterviews, 60 * 60 * 1000).unref();
  });
}

module.exports = app;
