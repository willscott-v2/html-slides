/**
 * qa-screenshots.js
 * Deterministic (and optionally AI-assisted) QA pass on the slide deck.
 *
 * Phase A — deterministic (always runs):
 *   - Captures each slide to qa-screenshots/slide_NN.png at 1920×1080
 *   - Measures overflow, content-escape, missing data-title, missing notes
 *   - Writes qa-screenshots/report.md and report.json
 *   - Exits non-zero if any hard failure is found
 *
 * Phase B — VLM review via Ollama (opt-in, via env vars):
 *   - Gated on OLLAMA_HOST. Choose model via VLM_MODEL.
 *   - Sends each PNG to the Ollama /api/generate vision endpoint
 *   - Appends a per-slide VLM review section to report.md
 *   - VLM issues never change the exit code — deterministic pass is the source of truth
 *
 * Requirements:
 *   npm install playwright
 *   npx playwright install chromium
 *
 * Usage:
 *   node qa-screenshots.js
 *   node qa-screenshots.js --input path/to/index.html --output qa-screenshots/
 *   OLLAMA_HOST=host:11434 VLM_MODEL=qwen2.5vl:7b node qa-screenshots.js
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
const http = require('http');

const args   = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const inputFile = getArg('--input')
  ? path.resolve(getArg('--input'))
  : path.resolve(__dirname, 'template', 'index.html');

const outDir = getArg('--output')
  ? path.resolve(getArg('--output'))
  : path.resolve(__dirname, 'qa-screenshots');

const VIEWPORT = { width: 1920, height: 1080 };

const OLLAMA_HOST = process.env.OLLAMA_HOST || '';
const VLM_MODEL   = process.env.VLM_MODEL   || '';
const VLM_TIMEOUT_MS = parseInt(process.env.VLM_TIMEOUT_MS || '120000', 10);

// ── Phase A: deterministic checks ─────────────────────────────────────────

async function runDeterministic() {
  console.log(`Input:  ${inputFile}`);
  console.log(`Output: ${outDir}\n`);

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: file not found — ${inputFile}`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page    = await browser.newPage();
  await page.setViewportSize(VIEWPORT);

  await page.goto(`file://${inputFile}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  await page.addStyleTag({
    content: `
      .nav-rail, .nav-drawer, .nav-scrim, .slide-number { display: none !important; }
      .slide-container { scroll-snap-type: none !important; }
      .slide { scroll-snap-align: none !important; }
    `,
  });

  const findings = await page.evaluate(({ vpWidth, vpHeight }) => {
    const slides = Array.from(document.querySelectorAll('.slide'));
    const notes  = Array.isArray(window.slideNotes) ? window.slideNotes : [];

    return slides.map((slide, i) => {
      const rect = slide.getBoundingClientRect();
      const vOverflow = slide.scrollHeight > slide.clientHeight + 1;
      const hOverflow = slide.scrollWidth  > slide.clientWidth  + 1;

      // Content escape: any descendant whose bbox extends past the slide's bbox.
      // Use a generous 2px tolerance for sub-pixel rendering.
      const escapes = [];
      const tol = 2;
      slide.querySelectorAll('*').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        const dTop    = rect.top    - r.top;
        const dBottom = r.bottom    - rect.bottom;
        const dLeft   = rect.left   - r.left;
        const dRight  = r.right     - rect.right;
        const worst   = Math.max(dTop, dBottom, dLeft, dRight);
        if (worst > tol) {
          escapes.push({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().slice(0, 60),
            px: Math.round(worst),
          });
        }
      });

      const title    = slide.getAttribute('data-title') || '';
      const hasTitle = title.length > 0;
      const hasNotes = typeof notes[i] === 'string' && notes[i].trim().length > 0;

      return {
        index: i,
        title: title || `(untitled slide ${i + 1})`,
        vOverflow,
        hOverflow,
        escapes: escapes.slice(0, 5),
        escapeCount: escapes.length,
        hasTitle,
        hasNotes,
      };
    });
  }, { vpWidth: VIEWPORT.width, vpHeight: VIEWPORT.height });

  fs.mkdirSync(outDir, { recursive: true });

  const slideHandles = await page.$$('.slide');
  for (let i = 0; i < slideHandles.length; i++) {
    const filename = path.join(outDir, `slide_${String(i + 1).padStart(2, '0')}.png`);
    await slideHandles[i].screenshot({ path: filename });
    findings[i].png = path.basename(filename);
    console.log(`  ✓ Captured slide ${i + 1} / ${slideHandles.length}`);
  }

  await browser.close();
  return findings;
}

function severityOf(f) {
  if (!f.hasTitle || f.escapeCount > 0) return 'error';
  if (f.vOverflow || f.hOverflow) return 'warn';
  if (!f.hasNotes) return 'info';
  return 'ok';
}

function writeReports(findings, vlm) {
  const json = { slides: findings, vlm: vlm || null };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(json, null, 2));

  const lines = ['# Slide QA Report', ''];
  const errors = findings.filter(f => severityOf(f) === 'error');
  const warns  = findings.filter(f => severityOf(f) === 'warn');
  const infos  = findings.filter(f => severityOf(f) === 'info');

  lines.push(`**Slides:** ${findings.length}   **Errors:** ${errors.length}   **Warnings:** ${warns.length}   **Info:** ${infos.length}`);
  lines.push('');

  const render = (label, list) => {
    if (!list.length) return;
    lines.push(`## ${label}`, '');
    for (const f of list) {
      lines.push(`### Slide ${f.index + 1} — ${f.title}`);
      lines.push(`- PNG: \`${f.png}\``);
      if (!f.hasTitle)    lines.push('- **Missing `data-title`** (drives nav + URL hash + presenter view)');
      if (f.escapeCount)  lines.push(`- **Content escape:** ${f.escapeCount} descendant(s) outside slide bounds`);
      if (f.escapes.length) {
        for (const e of f.escapes) {
          lines.push(`  - \`<${e.tag}>\` overflows by ${e.px}px — "${e.text}${e.text.length === 60 ? '…' : ''}"`);
        }
      }
      if (f.vOverflow)    lines.push('- Vertical overflow (scrollHeight > clientHeight)');
      if (f.hOverflow)    lines.push('- Horizontal overflow (scrollWidth > clientWidth)');
      if (!f.hasNotes)    lines.push('- No speaker notes in `slideNotes[]`');
      lines.push('');
    }
  };

  render('Errors', errors);
  render('Warnings', warns);
  render('Info', infos);

  if (!errors.length && !warns.length && !infos.length) {
    lines.push('All slides pass deterministic checks.');
    lines.push('');
  }

  if (vlm) {
    lines.push('## VLM Review', '');
    lines.push(`Model: \`${vlm.model}\`   Host: \`${vlm.host}\`   Slides reviewed: ${vlm.results.length}`);
    lines.push('');
    for (const r of vlm.results) {
      lines.push(`### Slide ${r.index + 1}`);
      if (r.error) {
        lines.push(`- _Error:_ ${r.error}`);
      } else {
        lines.push(`- Clipped: **${r.clipped}**   Overflow: **${r.overflow}**   Readability: **${r.readability}**`);
        if (r.notes) lines.push(`- Notes: ${r.notes}`);
      }
      lines.push('');
    }
  }

  fs.writeFileSync(path.join(outDir, 'report.md'), lines.join('\n'));
}

// ── Phase B: Ollama VLM review (opt-in) ───────────────────────────────────

function httpJson(host, pathname, method, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const [h, p] = host.split(':');
    const req = http.request({
      host: h,
      port: parseInt(p || '11434', 10),
      path: pathname,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Invalid JSON from Ollama: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('timeout', () => { req.destroy(new Error(`Timeout after ${timeoutMs}ms`)); });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runVLM(findings) {
  if (!OLLAMA_HOST) return null;

  // Probe host
  let tags;
  try {
    tags = await httpJson(OLLAMA_HOST, '/api/tags', 'GET', null, 5000);
  } catch (e) {
    console.log(`\nOllama at ${OLLAMA_HOST} unreachable, skipping VLM review (${e.message})`);
    return null;
  }

  const available = (tags.models || []).map(m => m.name);
  if (!VLM_MODEL) {
    console.log(`\nOLLAMA_HOST set but VLM_MODEL not specified.`);
    console.log(`Models available on ${OLLAMA_HOST}:`);
    for (const n of available) console.log(`  - ${n}`);
    console.log(`Set VLM_MODEL to one of the above to enable VLM review.`);
    return null;
  }
  if (!available.includes(VLM_MODEL)) {
    console.log(`\nVLM_MODEL '${VLM_MODEL}' not found on ${OLLAMA_HOST}. Available:`);
    for (const n of available) console.log(`  - ${n}`);
    console.log(`Skipping VLM review.`);
    return null;
  }

  console.log(`\nRunning VLM review with ${VLM_MODEL} on ${OLLAMA_HOST}...`);

  const prompt = [
    "You are reviewing a slide from a conference presentation for layout quality.",
    "Respond with ONLY a single JSON object, no prose, no code fences. Schema:",
    '{"clipped": boolean, "overflow": boolean, "readability": "good"|"marginal"|"poor", "notes": string}',
    "clipped: true if any text or image is cut off at an edge.",
    "overflow: true if content appears crowded or spills past its container.",
    "readability: overall legibility of the main text.",
    "notes: one sentence describing the worst issue, or 'none' if the slide looks good.",
  ].join('\n');

  const results = [];
  for (const f of findings) {
    const pngPath = path.join(outDir, f.png);
    const b64 = fs.readFileSync(pngPath).toString('base64');
    try {
      const resp = await httpJson(OLLAMA_HOST, '/api/generate', 'POST', {
        model: VLM_MODEL,
        prompt,
        images: [b64],
        stream: false,
        format: 'json',
      }, VLM_TIMEOUT_MS);

      let parsed = {};
      try { parsed = JSON.parse(resp.response || '{}'); }
      catch (e) { parsed = { notes: `(could not parse model response: ${(resp.response || '').slice(0, 120)})` }; }

      results.push({
        index: f.index,
        clipped: !!parsed.clipped,
        overflow: !!parsed.overflow,
        readability: parsed.readability || 'unknown',
        notes: parsed.notes || '',
      });
      console.log(`  ✓ Slide ${f.index + 1} / ${findings.length} reviewed`);
    } catch (e) {
      results.push({ index: f.index, error: e.message });
      console.log(`  ✗ Slide ${f.index + 1} / ${findings.length}: ${e.message}`);
    }
  }

  return { host: OLLAMA_HOST, model: VLM_MODEL, results };
}

// ── Main ──────────────────────────────────────────────────────────────────

(async () => {
  const findings = await runDeterministic();
  const vlm = await runVLM(findings);
  writeReports(findings, vlm);

  const errors = findings.filter(f => severityOf(f) === 'error');
  const warns  = findings.filter(f => severityOf(f) === 'warn');

  console.log(`\nReport: ${path.join(outDir, 'report.md')}`);
  console.log(`Errors: ${errors.length}   Warnings: ${warns.length}   Slides: ${findings.length}`);

  process.exit(errors.length ? 1 : 0);
})();
