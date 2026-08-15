const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.warn('Supabase is not configured. Copy .env.example to .env and add your project credentials.');
}

const supabase = url && serviceKey
  ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

module.exports = { supabase, isConfigured: Boolean(supabase) };
