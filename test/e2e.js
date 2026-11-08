// End-to-end: build -> encrypt with a TEST password -> serve on localhost -> decrypt in headless Chromium
// -> upload a PDF generated from the MSR sample -> assert charts render and no console errors -> screenshots.
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const S = require('./fixtures/samples.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'test-output');
const TEST_PW = 'e2e-test-password';
fs.mkdirSync(OUT, { recursive: true });

function fail(msg) { console.error('E2E FAIL: ' + msg); process.exitCode = 1; }

(async () => {
  execFileSync('node', ['build.js'], { cwd: ROOT, stdio: 'inherit' });
  const enc = path.join(ROOT, 'dist', 'e2e-encrypted.html');
  execFileSync('npx', ['pagecrypt', 'dist/plain.html', enc, TEST_PW], { cwd: ROOT, stdio: 'inherit' });
  const encHtml = fs.readFileSync(enc, 'utf8');
  if (encHtml.includes('DSModel') || encHtml.includes('Cedar Creek Deal Screen')) fail('encrypted file leaks plaintext');

  const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(encHtml); }).listen(0);
  const url = `http://127.0.0.1:${server.address().port}/`;

  const browser = await chromium.launch();
  // 1) Make a PDF from the MSR text
  const pdfPage = await browser.newPage();
  await pdfPage.setContent(`<html><body style="font-family:Helvetica;padding:40px"><h2>MSR Mineral &amp; Royalty Package</h2><h4>Executive Summary</h4><p>${S.msr}</p><p>Operators include Diamondback, Exxon and Occidental.</p></body></html>`);
  const pdfPath = path.join(OUT, 'msr-sample.pdf');
  await pdfPage.pdf({ path: pdfPath, format: 'Letter' });
  await pdfPage.close();

  async function run(label, ctxOpts) {
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await page.goto(url);
    await page.fill('#pwd', TEST_PW);
    await page.press('#pwd', 'Enter');
    await page.waitForFunction(() => window.DSApp && window.Chart && window.pdfjsLib, null, { timeout: 30000 });
    if (label === 'mobile') await page.click('#tabbar [data-view="ingest"]');
    await page.setInputFiles('#fileInput', pdfPath);
    await page.waitForFunction(() => window.DSApp.S.deal.ntmCF === 4e6, null, { timeout: 30000 });
    await page.waitForTimeout(900);
    const st = await page.evaluate(() => {
      const S = window.DSApp.S;
      return { verdict: document.querySelector('#verdict').textContent, pv: [S.deal.pvPDP, S.deal.pvPDNP, S.deal.pvPUD, S.deal.pvTotal], share: S.deal.pdpShareNTM, ducs: S.deal.ducs, bid: S.deal.bidDate };
    });
    if (st.verdict !== 'Development story') fail(`${label}: verdict ${st.verdict}`);
    if (JSON.stringify(st.pv) !== JSON.stringify([3e6, 9e6, 13e6, 25e6])) fail(`${label}: PV10 ${st.pv}`);
    if (st.share !== 0.16 || st.ducs !== 14) fail(`${label}: share/ducs ${st.share}/${st.ducs}`);
    await page.screenshot({ path: path.join(OUT, `${label}-review.png`), fullPage: label !== 'mobile' });
    if (label === 'mobile') { await page.click('#tabbar [data-view="analysis"]'); await page.waitForTimeout(700); }
    // Enter an ask to exercise the price line
    await page.fill('#askMain', '$9MM');
    await page.waitForTimeout(800);
    const charts = await page.evaluate(() => Object.entries(window.DSApp.charts).map(([id, c]) => {
      const cv = c.canvas; const ctx = cv.getContext('2d');
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data; let lit = 0;
      for (let i = 3; i < d.length; i += 16) if (d[i] > 0) lit++;
      return { id, w: cv.width, h: cv.height, lit, points: c.data.datasets.reduce((s, ds) => s + ds.data.length, 0) };
    }));
    for (const id of ['chCF', 'chProd', 'chPV', 'chWF', 'chStack']) {
      const c = charts.find((x) => x.id === id);
      if (!c || c.w < 50 || c.h < 50 || c.lit < 50 || c.points < 2) fail(`${label}: chart ${id} did not render ${JSON.stringify(c)}`);
    }
    const heat = await page.$$eval('#heat td', (t) => t.length);
    if (heat !== 35) fail(`${label}: heatmap cells ${heat}`);
    await page.screenshot({ path: path.join(OUT, `${label}-analysis.png`), fullPage: true });
    // Horizontal overflow check
    const overflow = await page.evaluate((w) => document.documentElement.scrollWidth - w, ctxOpts.viewport.width);
    if (overflow > 1) fail(`${label}: horizontal page overflow ${overflow}px`);
    // Save to deal list and check persistence
    await page.click('#btnSave');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ccds.v1.deals') || '[]').length);
    if (saved < 1) fail(`${label}: deal not saved`);
    if (errors.length) fail(`${label}: console errors:\n  ${errors.join('\n  ')}`);
    console.log(`${label}: verdict=${st.verdict}, charts=${charts.map((c) => c.id).join(',')}, errors=${errors.length}`);
    await ctx.close();
  }

  try {
    await run('desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await run('mobile', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  } catch (e) { fail(e.stack || e.message); }
  await browser.close();
  server.close();
  fs.rmSync(enc, { force: true });
  console.log(process.exitCode ? 'E2E: FAILED' : 'E2E: all checks passed');
})();
