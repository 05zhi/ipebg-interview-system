const path = require('path');
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const hrRoutes = require('./routes/hr');
const { supabase } = require('./config/supabase');

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
  const { isConfigured } = require('./config/supabase');
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
  if (!supabase) return;
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const { data: expiredInterviews, error: findError } = await supabase
    .from('interviews')
    .select('id, candidate_id')
    .eq('status', 'completed')
    .lt('updated_at', cutoff);
  if (findError) return console.error('Could not find completed interviews to purge:', findError.message);
  if (!expiredInterviews.length) return;

  const candidateIds = [...new Set(expiredInterviews.map((interview) => interview.candidate_id))];
  const { error: deleteInterviewError } = await supabase
    .from('interviews')
    .delete()
    .in('id', expiredInterviews.map((interview) => interview.id));
  if (deleteInterviewError) return console.error('Could not purge completed interviews:', deleteInterviewError.message);

  // A candidate may have another interview scheduled or retained for the same three-day period.
  // Only remove the candidate once no interview record still refers to them.
  const { data: remainingInterviews, error: remainingError } = await supabase
    .from('interviews')
    .select('candidate_id')
    .in('candidate_id', candidateIds);
  if (remainingError) return console.error('Could not check remaining candidate interviews:', remainingError.message);
  const remainingCandidateIds = new Set(remainingInterviews.map((interview) => interview.candidate_id));
  const removableCandidateIds = candidateIds.filter((id) => !remainingCandidateIds.has(id));
  if (!removableCandidateIds.length) return;

  const { error: deleteCandidateError } = await supabase.from('candidates').delete().in('id', removableCandidateIds);
  if (deleteCandidateError) console.error('Could not purge completed interview candidates:', deleteCandidateError.message);
}

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Interview System running at http://localhost:${port}`);
    purgeExpiredCompletedInterviews();
    setInterval(purgeExpiredCompletedInterviews, 60 * 60 * 1000).unref();
  });
}

module.exports = app;
