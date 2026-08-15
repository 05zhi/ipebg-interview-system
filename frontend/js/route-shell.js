(async () => {
  const response = await fetch('/hr.html', { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load the HR workspace.');
  const html = await response.text();
  document.open();
  document.write(html.replace('<head>', '<head><base href="/">'));
  document.close();
})().catch(() => { document.body.innerHTML = '<main style="padding:2rem;font-family:sans-serif">無法載入 HR 工作台，請重新整理頁面。</main>'; });
