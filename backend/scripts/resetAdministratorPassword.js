const readline = require('readline');
const bcrypt = require('bcrypt');
require('dotenv').config();
const { supabase, isConfigured } = require('../config/supabase');

const terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise((resolve) => terminal.question(prompt, resolve));

async function main() {
  if (!isConfigured) throw new Error('Supabase 尚未設定完成。');
  const username = (await ask('Administrator username [admin]: ')).trim() || 'admin';
  const password = await ask('New password (input is visible): ');
  const confirmation = await ask('Confirm new password: ');
  if (password.length < 8) throw new Error('密碼至少需要 8 個字元。');
  if (password !== confirmation) throw new Error('兩次輸入的密碼不一致。');
  const passwordHash = await bcrypt.hash(password, 12);
  const { data, error } = await supabase.from('users')
    .update({ password_hash: passwordHash, is_active: true })
    .eq('username', username).eq('role', 'administrator')
    .select('id, username').maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('找不到 Administrator 帳號。');
  console.log(`Administrator "${data.username}" password updated successfully.`);
  const localUrl = `http://127.0.0.1:${process.env.PORT || 3000}/api/auth/login`;
  try {
    const response = await fetch(localUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || `HTTP ${response.status}`);
    if (result.role !== 'administrator' || !result.token) throw new Error('登入回應內容不完整。');
    console.log('Local login API test passed.');
  } catch (error) {
    console.error(`Local login API test failed: ${error.message}`);
    process.exitCode = 2;
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => terminal.close());
