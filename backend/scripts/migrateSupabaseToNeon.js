const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
require('dotenv').config();

const tables = [
  { name: 'users', columns: ['id', 'username', 'password_hash', 'role', 'is_active', 'created_at', 'updated_at'] },
  { name: 'hr_accounts', columns: ['id', 'user_id', 'name', 'email', 'created_at', 'updated_at'] },
  { name: 'departments', columns: ['id', 'name', 'notes', 'is_active', 'created_by', 'created_at', 'updated_at'] },
  { name: 'managers', columns: ['id', 'name', 'email', 'department_id', 'notes', 'is_active', 'created_by', 'created_at', 'updated_at'] },
  { name: 'manager_available_slots', columns: ['id', 'manager_id', 'starts_at', 'ends_at', 'timezone', 'location', 'created_at'] },
  { name: 'candidates', columns: ['id', 'name', 'email', 'phone', 'position', 'department_id', 'notes', 'is_active', 'created_by', 'created_at', 'updated_at'] },
  { name: 'candidate_available_slots', columns: ['id', 'candidate_id', 'starts_at', 'ends_at', 'timezone', 'location', 'created_at'] },
  { name: 'interviews', columns: ['id', 'candidate_id', 'starts_at', 'ends_at', 'status', 'notes', 'created_by', 'created_at', 'updated_at'] },
  { name: 'interview_managers', columns: ['interview_id', 'manager_id', 'created_at'] },
];

async function fetchAll(source, table) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await source.from(table).select('*').range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

async function main() {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL_DIRECT'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  const source = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  const target = new Pool({ connectionString: process.env.DATABASE_URL_DIRECT, max: 1 });
  const sourceRows = new Map();
  try {
    for (const table of tables) sourceRows.set(table.name, await fetchAll(source, table.name));
    const targetCounts = await Promise.all(tables.map(async (table) => ({
      name: table.name,
      count: Number((await target.query(`select count(*) from public.${table.name}`)).rows[0].count),
    })));
    const occupied = targetCounts.filter((item) => item.count > 0);
    if (occupied.length) throw new Error(`Target is not empty: ${occupied.map((item) => `${item.name}=${item.count}`).join(', ')}`);

    const client = await target.connect();
    try {
      await client.query('begin');
      for (const table of tables) {
        const rows = sourceRows.get(table.name);
        const placeholders = table.columns.map((_, index) => `$${index + 1}`).join(', ');
        for (const row of rows) {
          const values = table.columns.map((column) => {
            if (column === 'location' && !row[column]) return row.timezone || 'Asia/Taipei';
            return row[column] === undefined ? null : row[column];
          });
          await client.query(`insert into public.${table.name} (${table.columns.join(', ')}) values (${placeholders})`, values);
        }
        console.log(`${table.name}: ${rows.length} rows copied`);
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }

    for (const table of tables) {
      const targetCount = Number((await target.query(`select count(*) from public.${table.name}`)).rows[0].count);
      if (targetCount !== sourceRows.get(table.name).length) throw new Error(`${table.name}: verification count mismatch`);
    }
    console.log('Supabase to Neon migration completed and all table counts match.');
  } finally { await target.end(); }
}

main().catch((error) => { console.error(`FAILED: ${error.message}`); process.exitCode = 1; });
