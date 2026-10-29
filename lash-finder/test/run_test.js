const { chromium } = require('playwright');
const S = process.argv[2];
const imgs = process.argv.slice(3);
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 420, height: 900 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => { if (m.type()==='error') console.log('CONSOLE', m.text()); });
  await page.goto('http://127.0.0.1:8765/test.html?lfdebug=1');
  await page.click('text=AI Oog Scan');
  for (const f of imgs) {
    await page.evaluate(() => lfReset());
    await page.setInputFiles('#lfFileInput', `${S}/testimg/${f}`);
    await page.waitForSelector('#lfAnalyzeBtn', { state: 'visible' });
    await page.click('#lfAnalyzeBtn');
    await page.waitForFunction(() => document.getElementById('lfScanQ').style.display !== 'none' || document.getElementById('lfSCard').classList.contains('show'), null, { timeout: 60000 });
    if (await page.isVisible('#lfScanQ')) {
      const m = await page.evaluate(() => lfScan);
      console.log(`OK   ${f}: shape=${m.shape} size=${m.size} tilt=${m.m.tilt.toFixed(1)} open=${m.m.open.toFixed(3)} sizeR=${m.m.sizeRatio.toFixed(3)} faceW=${m.m.faceW|0} yaw=${m.m.yaw.toFixed(1)} pitch=${m.m.pitch.toFixed(1)} roll=${m.m.roll.toFixed(1)} squint=${m.m.squint.toFixed(2)} smile=${m.m.smile.toFixed(2)}`);
      await page.screenshot({ path: `${S}/shots/q1_${f}.png`, fullPage: false });
      for (const pick of ['Hangend ooglid', 'Wispy', 'Beginner']) {
        await page.click(`#lfScanQ .lf-opt:has-text("${pick}")`);
        await page.click('#lfScanNext');
      }
      await page.waitForSelector('#lfSCard.show');
      const t = await page.innerText('#lfSCard');
      console.log('     result:', t.split('\n').filter(Boolean).slice(0, 8).join(' | '));
      await page.screenshot({ path: `${S}/shots/res_${f}.png`, fullPage: true });
    } else {
      console.log(`FAIL ${f}:`, (await page.innerText('#lfSCard')).replace(/\s+/g, ' ').slice(0, 260));
    }
  }
  await b.close();
})();
