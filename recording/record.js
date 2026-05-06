// Record a walkthrough of the Medivoyage AI demo using Playwright.
// Drives /demo through the X-ray sample flow (the most visual scenario).
// Outputs WebM video; subsequent ffmpeg step transcodes to MP4.

const { chromium } = require('playwright');

const DEMO_URL = process.env.DEMO_URL || 'http://127.0.0.1:5000/demo.html';
const VIDEO_DIR = process.env.VIDEO_DIR || './out';
const VIEWPORT = { width: 1280, height: 720 };

(async () => {
  console.log('Launching headless Chromium...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: {
      dir: VIDEO_DIR,
      size: VIEWPORT
    }
  });

  const page = await context.newPage();

  // Suppress demo's runtime errors from background scripts (e.g., Firebase loading).
  page.on('pageerror', err => console.log('page error:', err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('console error:', msg.text());
  });

  console.log('Navigating to', DEMO_URL);
  await page.goto(DEMO_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Scroll to the demo section
  console.log('Scroll into demo input area...');
  await page.evaluate(() => {
    document.getElementById('demo').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  await page.waitForTimeout(2000);

  // Click X-ray tab
  console.log('Click X-ray tab...');
  await page.click('#tab-xray');
  await page.waitForTimeout(1500);

  // Click "Use our sample x-ray"
  console.log('Click sample x-ray...');
  await page.click('#use-sample-btn');
  // Wait for preview to show
  await page.waitForSelector('#xray-preview-wrap:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(1500);

  // Add some context
  console.log('Type context...');
  await page.click('#xray-context');
  await page.type('#xray-context', 'Tooth has been missing about 18 months. Age 42, non-smoker.', { delay: 35 });
  await page.waitForTimeout(1000);

  // Click Generate
  console.log('Click Generate...');
  await page.click('#run-btn');

  // Wait for loading state to start, hold a beat for thinking animation
  await page.waitForSelector('#loading:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(4500); // Let thinking animation play out

  // Wait for result to render (either #result or #result-oos)
  console.log('Wait for result...');
  await page.waitForFunction(() => {
    const r = document.getElementById('result');
    const o = document.getElementById('result-oos');
    return (r && !r.classList.contains('hidden')) || (o && !o.classList.contains('hidden'));
  }, { timeout: 60000 });

  await page.waitForTimeout(2500);

  // Scroll through the result to show plan + costs
  console.log('Scroll through result...');
  await page.evaluate(() => {
    const r = document.getElementById('result');
    const o = document.getElementById('result-oos');
    const target = (r && !r.classList.contains('hidden')) ? r : o;
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  await page.waitForTimeout(2500);

  await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
  await page.waitForTimeout(2500);

  await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
  await page.waitForTimeout(2500);

  await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
  await page.waitForTimeout(2500);

  // Final hold on cost comparison
  await page.waitForTimeout(2000);

  console.log('Closing context to flush video...');
  await context.close();
  await browser.close();

  console.log('Done. Video should be at', VIDEO_DIR);
})().catch(err => {
  console.error('Recording failed:', err);
  process.exit(1);
});
