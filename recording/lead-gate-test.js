// Smoke test for the lead-capture gate: open demo, click Generate, verify modal opens,
// fill it, submit, verify modal closes and AI runs to completion.

const { chromium } = require('playwright');

const DEMO_URL = process.env.DEMO_URL || 'http://127.0.0.1:5000/demo.html';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  page.on('pageerror', err => console.log('!! pageerror:', err.message));
  page.on('console', msg => {
    if (['error', 'warning'].includes(msg.type())) console.log('console.' + msg.type() + ':', msg.text());
  });

  console.log('GO', DEMO_URL);
  await page.goto(DEMO_URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // First-time visitor — clear localStorage to be sure
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });

  // Switch to Quick form, fill it
  await page.click('#tab-form');
  await page.waitForTimeout(500);
  await page.selectOption('#form-tooth', { value: 'lower-left-first-molar|19' });
  await page.selectOption('#form-duration', { value: '6' });
  await page.fill('#form-age', '38');
  await page.selectOption('#form-health', { value: 'good' });
  await page.waitForTimeout(300);

  // Click Generate — should trigger modal, NOT loading state
  console.log('Click Generate (expect modal)...');
  await page.click('#run-btn');
  await page.waitForTimeout(800);

  const modalVisible = await page.isVisible('#lead-modal:not(.hidden)');
  const loadingVisible = await page.isVisible('#loading:not(.hidden)');
  console.log('Modal visible:', modalVisible);
  console.log('Loading visible (should be false at this point):', loadingVisible);
  if (!modalVisible) throw new Error('Modal did not open');
  if (loadingVisible) throw new Error('Loading state appeared before lead capture');

  // Fill modal
  console.log('Fill modal...');
  await page.fill('#lead-name', 'Smoke Test');
  await page.fill('#lead-email', 'smoke-test+gate@example.com');
  await page.fill('#lead-phone', '555-555-1234');
  await page.click('#lead-submit');

  // Wait for modal to close + AI request to start
  await page.waitForFunction(() => {
    const m = document.getElementById('lead-modal');
    return m && m.classList.contains('hidden');
  }, { timeout: 15000 });
  console.log('Modal closed after submit');

  // Verify localStorage now has the lead id (or at least an empty marker)
  const leadId = await page.evaluate(() => { try { return localStorage.getItem('medivoyage_lead_id'); } catch (e) { return null; } });
  console.log('localStorage medivoyage_lead_id:', leadId);

  // Wait for AI result to render
  await page.waitForFunction(() => {
    const r = document.getElementById('result');
    const o = document.getElementById('result-oos');
    return (r && !r.classList.contains('hidden')) || (o && !o.classList.contains('hidden'));
  }, { timeout: 60000 });
  console.log('AI result rendered');

  // Check what came back
  const findingsSummary = await page.evaluate(() => {
    return document.getElementById('result-summary') ? document.getElementById('result-summary').textContent : null;
  });
  console.log('Result summary:', findingsSummary && findingsSummary.slice(0, 120) + '...');

  // ===== Phase 2: simulate returning visitor — should SKIP the modal =====
  console.log('--- Returning-visitor flow ---');
  await page.click('#run-btn');  // try again
  await page.waitForTimeout(800);
  const modal2 = await page.isVisible('#lead-modal:not(.hidden)');
  const loading2 = await page.isVisible('#loading:not(.hidden)');
  console.log('Modal visible (should be false):', modal2);
  console.log('Loading visible (should be true):', loading2);
  if (modal2) throw new Error('Modal opened on second click but should have skipped');

  console.log('SUCCESS — gate flow works as expected');
  await browser.close();
})().catch(err => {
  console.error('FAIL:', err);
  process.exit(1);
});
