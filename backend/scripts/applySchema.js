const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

async function main() {
  if (!process.env.DATABASE_URL_DIRECT) throw new Error('DATABASE_URL_DIRECT is required.');
  const sql = fs.readFileSync(path.resolve(__dirname, '..', '..', 'database', 'neon.sql'), 'utf8');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_DIRECT, max: 1 });
  try {
    await pool.query(sql);
    const result = await pool.query("select count(*)::int table_count from information_schema.tables where table_schema = 'public'");
    console.log(`Neon schema applied successfully (${result.rows[0].table_count} public tables).`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => { console.error(`FAILED: ${error.message}`); process.exitCode = 1; });
