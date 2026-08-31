require('./testSetup');
const fs = require('fs');
const path = require('path');
const app = require('../server');

function assert(value, message) { if (!value) throw new Error(message); }

async function main() {
  const frontend = path.resolve(__dirname, '..', '..', 'frontend');
  const pages = ['index.html', 'login.html', 'admin.html', 'hr.html', 'availability/index.html'];
  const scriptPages = { 'login.js': 'login.html', 'admin.js': 'admin.html', 'hr.js': 'hr.html', 'availability-public.js': 'availability/index.html' };
  let assertions = 0;

  for (const page of pages) {
    const html = fs.readFileSync(path.join(frontend, page), 'utf8');
    assert(/<!doctype html>/i.test(html), `${page}: missing HTML5 doctype`); assertions += 1;
    assert(/<meta[^>]+name=["']viewport["']/i.test(html), `${page}: missing responsive viewport`); assertions += 1;
    assert(/bootstrap@5/i.test(html), `${page}: Bootstrap 5 missing`); assertions += 1;
    const ids = [...html.matchAll(/\sid=["']([^"']+)["']/gi)].map((match) => match[1]);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    assert(duplicateIds.length === 0, `${page}: duplicate IDs: ${[...new Set(duplicateIds)].join(', ')}`); assertions += 1;
    for (const target of [...html.matchAll(/<label[^>]+for=["']([^"']+)["']/gi)].map((match) => match[1])) {
      assert(ids.includes(target), `${page}: label points to missing #${target}`); assertions += 1;
    }
    for (const source of [...html.matchAll(/(?:src|href)=["']([^"'#?]+)(?:\?[^"']*)?["']/gi)].map((match) => match[1])) {
      if (/^(?:https?:|data:|mailto:|tel:)/i.test(source)) continue;
      assert(fs.existsSync(path.resolve(path.dirname(path.join(frontend, page)), source)), `${page}: missing local asset ${source}`); assertions += 1;
    }
  }

  for (const [script, page] of Object.entries(scriptPages)) {
    const js = fs.readFileSync(path.join(frontend, 'js', script), 'utf8');
    const html = fs.readFileSync(path.join(frontend, page), 'utf8');
    const ids = new Set([
      ...[...html.matchAll(/\sid=["']([^"']+)["']/gi)].map((match) => match[1]),
      ...[...js.matchAll(/\sid=["']([^"']+)["']/gi)].map((match) => match[1]),
      ...[...js.matchAll(/\.id\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]),
    ]);
    const selectors = new Set([
      ...[...js.matchAll(/querySelector\(["']#([A-Za-z0-9_-]+)["']\)/g)].map((match) => match[1]),
      ...[...js.matchAll(/getElementById\(["']([A-Za-z0-9_-]+)["']\)/g)].map((match) => match[1]),
    ]);
    for (const id of selectors) { assert(ids.has(id), `${script}: selector #${id} missing from ${page}`); assertions += 1; }
  }
  const apiSource = fs.readFileSync(path.join(frontend, 'js', 'api.js'), 'utf8');
  const hrHtml = fs.readFileSync(path.join(frontend, 'hr.html'), 'utf8');
  assert(/class=["'][^"']*sidebar-profile[^"']*["'][^>]*data-go=["']account["']/.test(hrHtml), 'hr.html: profile control must navigate to account settings'); assertions += 1;
  assert(!(apiSource.includes("dateStyle:") && apiSource.includes("timeZoneName:")), 'api.js: incompatible Intl dateStyle/timeZoneName combination'); assertions += 1;
  assert(!apiSource.includes('interview_token') && apiSource.includes("credentials: 'same-origin'"), 'api.js: JWT must remain in an HttpOnly same-origin cookie'); assertions += 1;
  const formattedDate = new Intl.DateTimeFormat('zh-TW', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(new Date('2027-08-15T03:00:00.000Z'));
  assert(formattedDate.length > 0, 'date formatter failed'); assertions += 1;

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const resource of [...pages.map((page) => `/${page}`), '/css/style.css', '/js/api.js', '/js/login.js', '/js/admin.js', '/js/hr.js', '/js/availability-public.js']) {
      const response = await fetch(`${origin}${resource}`);
      assert(response.status === 200, `${resource}: HTTP ${response.status}`); assertions += 1;
      assert((await response.text()).length > 20, `${resource}: empty response`); assertions += 1;
    }
  } finally { server.close(); }

  console.log(`SUCCESS: ${assertions} frontend structure, selector, accessibility and asset assertions passed.`);
}

main().catch((error) => { console.error(`FAILED: ${error.message}`); process.exitCode = 1; });
