/**
 * export-screenshots.js
 * Captures each slide as a PNG using Playwright.
 * Run this before build-pptx.py.
 *
 * Requirements:
 *   npm install playwright
 *   npx playwright install chromium
 *
 * Usage:
 *   node export-screenshots.js
 *   node export-screenshots.js --input path/to/index.html
 *   node export-screenshots.js --output path/to/screenshots/
 *
 * Output: screenshots/slide_01.png, slide_02.png, ...
 */

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

// ── Config ──────────────────────────────────────────────────
// Override with --input / --output flags if needed
const args    = process.argv.slice(2);
const getArg  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const inputFile = getArg('--input')
  ? path.resolve(getArg('--input'))
  : path.resolve(__dirname, 'template', 'index.html');

const outDir = getArg('--output')
  ? path.resolve(getArg('--output'))
  : path.join(path.dirname(inputFile), 'screenshots');

// Viewport matches a standard 16:9 projector
const VIEWPORT = { width: 1920, height: 1080 };

// ── Main ─────────────────────────────────────────────────────
(async () => {
  if (!fs.existsSync(inputFile)) {
    console.error(`Error: file not found — ${inputFile}`);
    process.exit(1);
  }

  console.log(`Input:  ${inputFile}`);
  console.log(`Output: ${outDir}`);

  const browser = await chromium.launch();
  const page    = await browser.newPage();
  await page.setViewportSize(VIEWPORT);

  await page.goto(`file://${inputFile}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000); // let fonts and images settle

  // Hide the nav rail so it doesn't appear in exports
  await page.addStyleTag({
    content: '.nav-rail, .nav-drawer, .nav-scrim { display: none !important; }',
  });

  const slideCount = await page.evaluate(() =>
    document.querySelectorAll('.slide').length
  );
  console.log(`\nFound ${slideCount} slides\n`);

  fs.mkdirSync(outDir, { recursive: true });

  for (let i = 0; i < slideCount; i++) {
    // Scroll to slide without smooth animation (faster, more reliable)
    await page.evaluate((idx) => {
      const container = document.querySelector('.slide-container');
      const slides    = document.querySelectorAll('.slide');
      if (container && slides[idx]) {
        container.scrollTop = slides[idx].offsetTop;
      }
    }, i);
    await page.waitForTimeout(500); // wait for any CSS transitions

    const filename = path.join(outDir, `slide_${String(i + 1).padStart(2, '0')}.png`);
    await page.screenshot({ path: filename });
    console.log(`  ✓ Slide ${i + 1} / ${slideCount} → ${path.basename(filename)}`);
  }

  await browser.close();
  console.log(`\nDone. Screenshots saved to: ${outDir}`);
  console.log('Next step: python3 build-pptx.py');
})();
