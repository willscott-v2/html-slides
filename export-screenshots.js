/**
 * export-screenshots.js
 * Captures each slide as a PNG using Playwright and writes a notes.json
 * file alongside the PNGs. Run this before build-pptx.py.
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
 * Output: <outDir>/slide_01.png, slide_02.png, ... and notes.json
 */

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.error("Missing dependency: run 'npm install playwright && npx playwright install chromium'");
  process.exit(1);
}

const path = require('path');
const fs   = require('fs');

const args   = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const inputFile = getArg('--input')
  ? path.resolve(getArg('--input'))
  : path.resolve(__dirname, 'template', 'index.html');

const outDir = getArg('--output')
  ? path.resolve(getArg('--output'))
  : path.join(path.dirname(inputFile), 'screenshots');

const VIEWPORT = { width: 1920, height: 1080 };

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
  await page.waitForTimeout(1000);

  // Hide nav chrome and disable scroll-snap so elementHandle screenshots
  // can auto-scroll freely. .slide-number hidden so exported decks don't
  // double-number (PowerPoint adds its own).
  await page.addStyleTag({
    content: `
      .nav-rail, .nav-drawer, .nav-scrim, .slide-number { display: none !important; }
      .slide-container { scroll-snap-type: none !important; }
      .slide { scroll-snap-align: none !important; }
    `,
  });

  const slideHandles = await page.$$('.slide');
  const slideCount   = slideHandles.length;
  console.log(`\nFound ${slideCount} slides\n`);

  fs.mkdirSync(outDir, { recursive: true });

  for (let i = 0; i < slideCount; i++) {
    const filename = path.join(outDir, `slide_${String(i + 1).padStart(2, '0')}.png`);
    await slideHandles[i].screenshot({ path: filename });
    console.log(`  ✓ Slide ${i + 1} / ${slideCount} → ${path.basename(filename)}`);
  }

  // Pull speaker notes directly from window.slideNotes — the single source of
  // truth. build-pptx.py reads this JSON instead of maintaining a second array.
  const notes = await page.evaluate(() => Array.isArray(window.slideNotes) ? window.slideNotes : []);
  const notesPath = path.join(outDir, 'notes.json');
  fs.writeFileSync(notesPath, JSON.stringify(notes, null, 2));
  console.log(`\n  ✓ Notes → ${path.basename(notesPath)} (${notes.length} entries)`);
  if (notes.length < slideCount) {
    console.log(`    Warning: ${slideCount - notes.length} slide(s) have no speaker notes`);
  }

  await browser.close();
  console.log(`\nDone. Output: ${outDir}`);
  console.log('Next step: python3 build-pptx.py');
})();
