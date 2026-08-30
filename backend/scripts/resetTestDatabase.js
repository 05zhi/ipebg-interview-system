const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { testUrl } = require('./testSetup');

async function main() {
  const schema = fs.readFileSync(path.resolve(__dirname, '..', '..', 'database', 'neon.sql'), 'utf8');
  const pool = new Pool({ connectionString: testUrl, max: 1 });
  try {
    await pool.query('drop schema if exists public cascade; create schema public');
    await pool.query(schema);
    const result = await pool.query("select count(*)::int as table_count from information_schema.tables where table_schema = 'public'");
    console.log(`Test database reset successfully (${result.rows[0].table_count} public tables).`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => { console.error(`FAILED: ${error.message}`); process.exitCode = 1; });
