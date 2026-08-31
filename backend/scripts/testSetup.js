const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

function identity(connectionString) {
  const url = new URL(connectionString);
  const host = url.hostname.replace('-pooler.', '.');
  return `${host}:${url.port || '5432'}${url.pathname}`.toLocaleLowerCase();
}

function derivedTestUrl() {
  if (process.env.DATABASE_URL_TEST) return process.env.DATABASE_URL_TEST;
  const databaseName = String(process.env.TEST_DATABASE_NAME || 'interview_system_test').trim();
  if (!databaseName || !process.env.DATABASE_URL_DIRECT) return null;
  if (!/^[a-z][a-z0-9_]{2,62}$/i.test(databaseName)) throw new Error('TEST_DATABASE_NAME 格式不正確。');
  const url = new URL(process.env.DATABASE_URL_DIRECT);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

const testUrl = derivedTestUrl();
if (!testUrl) throw new Error('測試已中止：請設定 DATABASE_URL_TEST 或 TEST_DATABASE_NAME。');

const productionUrls = [process.env.DATABASE_URL, process.env.DATABASE_URL_DIRECT].filter(Boolean);
if (productionUrls.some((url) => identity(url) === identity(testUrl))) {
  throw new Error('測試已中止：測試資料庫不可與正式資料庫相同。');
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL_TEST = testUrl;
process.env.EMAIL_TRANSPORT = process.env.EMAIL_TRANSPORT || 'json';

module.exports = { testUrl, identity };
