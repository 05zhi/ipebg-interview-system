const { Pool } = require('pg');

// This app is a long-running Express server. Prefer the stable direct endpoint;
// retain DATABASE_URL as a fallback for deployments that intentionally use pooling.
const connectionString = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
const pool = connectionString ? new Pool({
  connectionString,
  max: Number(process.env.DB_POOL_MAX || 1),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 60_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
}) : null;

if (!connectionString) console.warn('Neon is not configured. Add DATABASE_URL to backend/.env.');
if (pool) pool.on('error', (error) => console.error('Unexpected PostgreSQL pool error:', error));

async function query(text, params = [], client = pool) {
  if (!client) {
    const error = new Error('Neon database is not configured.');
    error.status = 503;
    throw error;
  }
  return client.query(text, params);
}

async function transaction(work) {
  if (!pool) {
    const error = new Error('Neon database is not configured.');
    error.status = 503;
    throw error;
  }
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, transaction, isConfigured: Boolean(pool) };
