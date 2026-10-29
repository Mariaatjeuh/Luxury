const { chromium } = require('playwright');
const S = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 }, permissions: ['camera'] });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8765/test.html');
  await page.click('text=AI Oog Scan');
  await page.screenshot({ path: `${S}/shots/start.png` });
  await page.click('#lfCamBtn');
  await page.waitForFunction(() => document.getElementById('lfVideo').videoWidth > 0, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${S}/shots/cam.png` });
  await page.click('text=Maak foto');
  console.log('shot visible:', await page.isVisible('#lfShot'), 'stream stopped:', await page.evaluate(() => lfStream === null));
  await page.click('#lfAnalyzeBtn');
  await page.waitForSelector('#lfSCard.show', { timeout: 60000 });
  console.log('fake camera (no face) ->', (await page.innerText('#lfSCard')).replace(/\s+/g,' ').slice(0,120));
  // tab wisselen stopt camera
  await page.evaluate(() => lfReset()); await page.click('#lfCamBtn');
  await page.waitForFunction(() => lfStream !== null);
  await page.click('.lf-mode-btn >> nth=0');
  console.log('camera stopped after tab switch:', await page.evaluate(() => lfStream === null));
  await b.close();
})();
