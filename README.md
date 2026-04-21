# HTML Slides

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg) ![No dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg)

A self-contained HTML presentation framework. One file. No build step. No npm. Open `index.html` in any browser and you're presenting.

[Quick demo (template) →](https://willscott-v2.github.io/html-slides/) &nbsp;·&nbsp; [Production example: AI SEO talk →](https://slides.searchinfluence.com/ai-seo/)

Built for conference talks where you want version control, full design control, and a presenter mode that actually works — without a 40-step setup.

The single-file structure also makes it easy to edit with AI assistants — paste the whole thing into Claude or ChatGPT and ask it to add a slide, rewrite notes, or restyle a section. No build system to explain, no file tree to navigate.

---

## Quick start

```bash
# 1. Get the template
git clone https://github.com/willscott-v2/html-slides.git
cd html-slides/template

# 2. Edit your slides
# Open index.html in any text editor.
# Each <section class="slide"> is one slide.
# Update slideNotes[] in the script block for presenter notes.

# 3. Open in a browser
open index.html
```

That's it. No server required for basic use. For BroadcastChannel sync between two windows, serve locally:

```bash
python3 -m http.server 8080
# then open http://localhost:8080/template/
```

---

## Features

- **Two-window sync** — open `index.html` in your main window and `index.html?presenter=1` in a second window. Advance in either; both stay in sync via the [BroadcastChannel API](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel). No WebSockets, no server.
- **Zero dependencies** — one HTML file, one `assets/` folder. No npm, no bundler, no framework. Works offline.
- **Full presenter overlay** — press `N` (or open with `?presenter=1`) to see: slide title, full script notes, "Next:" preview.
- **URL hash navigation** — each slide gets a `#slug` URL from its `data-title`. Share or bookmark a specific slide.
- **Scroll-snap layout** — CSS `scroll-snap-type: y mandatory` handles the snap behavior. Smooth scrolling, works on touch.
- **One global scale knob** — `html { font-size: 24px; }` scales the entire deck. Bump it up for a big stage.
- **Slide navigator** — hamburger icon (top right) opens a drawer with clickable slide list, auto-highlighted by position.
- **Exports to PPTX** — included Playwright + python-pptx scripts capture screenshots and build a `.pptx` with speaker notes.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `→` `↓` `Space` `Enter` `Page Down` | Next slide |
| `←` `↑` `Page Up` | Previous slide |
| `Home` | First slide |
| `End` | Last slide |
| `N` | Toggle presenter overlay |
| `Esc` | Close slide navigator |
| Hamburger icon | Open slide navigator |

---

## Presenter mode

Two-window setup for the best experience:

**Window 1 — main display** (connect to projector)
```
http://localhost:8080/template/
```

**Window 2 — your laptop** (keep this to yourself)
```
http://localhost:8080/template/?presenter=1
```

Advance slides in either window. Both update instantly. The presenter window shows:
- Current slide number and title
- Full speaker notes
- "Next: [slide title]" preview at the bottom

You can also press `N` in any window to toggle the presenter overlay without opening a second window.

**Change the channel name** — find `'my-talk-2026'` in the script block and rename it. Using a unique name per talk prevents cross-talk if you have multiple decks open.

---

## Customizing

### Colors and fonts

Brand variables live at the top of the `<style>` block:

```css
:root {
  --color-primary:   #3b82f6;  /* accent, headings, stat numbers */
  --color-secondary: #10b981;  /* green callouts */
  --color-warning:   #f59e0b;  /* amber callouts */
  --bg:              #1a1a2e;  /* slide background */
  --font: "Inter", sans-serif;
}
```

Change those six values and the whole deck updates.

### Global text size

```css
html { font-size: 20px; }
```

- `16px` — laptop screen
- `20px` — medium conference room
- `26px` — large stage

Every `clamp()` in the CSS scales proportionally.

### Slide layouts

Apply these classes to `<section class="slide">`:

| Class | Content position |
|---|---|
| (none) | Bottom-left (default) |
| `.slide-bottom` | Bottom-left (explicit) |
| `.slide-center` | Vertically and horizontally centered |
| `.slide-center-left` | Vertically centered, left-aligned |

### Background images

Add a `.slide-bg` div as the first child of any slide:

```html
<div class="slide-bg" style="background-image: url('./assets/photo.jpg');"></div>
```

Wrap text in `.text-panel` for a frosted-glass overlay that keeps text readable over photos.

### Adding slides

Copy any existing `<section class="slide">` block. Set `data-title` to a unique name — this becomes the URL slug and appears in the presenter view. Add a matching entry to `slideNotes[]` in the script.

---

## Exporting and QA

Three scripts are included, all opt-in. The deck itself has zero runtime dependencies — install only what you need.

### Export to PowerPoint

For venues that require a `.pptx` file:

```bash
npm install playwright && npx playwright install chromium
pip install python-pptx

# From the repo root:
node export-screenshots.js     # captures slide_01.png, slide_02.png, ... + notes.json
python3 build-pptx.py          # builds presentation.pptx (13.333"×7.5" widescreen)
```

The PPTX uses full-bleed 1920×1080 screenshots as slide backgrounds. Speaker notes are pulled from `slideNotes[]` in your `index.html` — `export-screenshots.js` writes them to `notes.json`, `build-pptx.py` reads them back. No second array to maintain.

### Screenshot QA

Catch layout problems before you present. Same Playwright dependency as above:

```bash
node qa-screenshots.js
```

Captures each slide at 1920×1080 and writes `qa-screenshots/report.md` and `report.json` covering:

- Content-escape (any element whose bounding box extends past the slide — the most common silent failure)
- Vertical or horizontal overflow
- Missing `data-title` (breaks nav + URL hash)
- Slides with no entry in `slideNotes[]`

The script exits non-zero if any hard failure is found — wire it into CI or a pre-commit hook if you want.

### Optional: AI-assisted QA via Ollama

If you have a machine running [Ollama](https://ollama.com/) with a vision model loaded, the QA script can hand each screenshot to the VLM for a second-pass review — catches readability, low contrast, and awkward typography that deterministic checks miss. Skip this section if you don't want to run Ollama; the core QA pass works fine without it.

```bash
OLLAMA_HOST=your-ollama-host:11434 VLM_MODEL=qwen2.5vl:7b node qa-screenshots.js
```

The VLM judgements append to `report.md` as a second section. If `OLLAMA_HOST` is unreachable or `VLM_MODEL` isn't loaded, the script prints a warning and completes with deterministic results only.

### Deployment

For S3 + CloudFront deployments, copy the example script and set three env vars:

```bash
cp template/deploy.sh.example template/deploy.sh
export S3_BUCKET=my-slides-bucket
export S3_PREFIX=my-talk
export CF_DIST_ID=EXXXXXXXXXXXXX
./template/deploy.sh          # upload index.html, invalidate that path
./template/deploy.sh --all    # sync all assets, invalidate the whole prefix
```

Requires `pip install boto3` and AWS credentials. `template/deploy.sh` is gitignored so your config never gets committed.

---

## Why I built this

I give conference talks a few times a year. Google Slides doesn't version-control well — the `.pptx` format is binary, layout drifts between machines, and sharing a link means giving up control. Reveal.js is powerful but requires Node and a build step, which adds friction on travel days.

This started as a single-file experiment before a talk and has been through six presentations now. The BroadcastChannel two-window sync was the feature that made it worth sharing — it works without any server infrastructure, just two browser windows on the same machine.

If you use it for a talk, I'd like to hear how it went. — [Will Scott, AI SEO practitioner](https://www.searchinfluence.com/will-scott-ai-seo-expert/)

---

## Project structure

```
html-slides/
├── template/
│   ├── index.html          ← the entire framework
│   └── assets/             ← your images go here
├── export-screenshots.js   ← Playwright screenshot capture
├── build-pptx.py           ← python-pptx PPTX builder
├── .gitignore
└── LICENSE                 ← MIT
```

---

MIT License — Copyright (c) 2026 [Search Influence](https://searchinfluence.com)
