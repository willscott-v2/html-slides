# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A zero-dependency, single-file HTML presentation framework. The entire runtime — CSS, markup, and JS engine — lives in [template/index.html](template/index.html). There is no build system, no package.json, no framework. Open the file in a browser and it works.

The single-file shape is load-bearing: it's what makes the deck forkable, offline-capable, and easy to paste into an AI chat for edits. Do not split it into separate CSS/JS files unless the user explicitly asks.

## Common commands

```bash
# Serve locally (needed for BroadcastChannel two-window sync)
python3 -m http.server 8080
# then open http://localhost:8080/template/ (main) and /template/?presenter=1 (notes)

# Export to PPTX (for venues that require it)
npm install playwright && npx playwright install chromium
pip install python-pptx
node export-screenshots.js   # writes template/screenshots/slide_NN.png + notes.json
python3 build-pptx.py        # writes presentation.pptx at 13.333"×7.5" widescreen

# Screenshot QA (deterministic overflow/content-escape check)
node qa-screenshots.js       # writes qa-screenshots/report.md + report.json; exits non-zero on errors

# Optional: second-pass VLM review via Ollama
OLLAMA_HOST=host:11434 VLM_MODEL=qwen2.5vl:7b node qa-screenshots.js
```

All three JS scripts accept `--input` / `--output` flags — see the header comments.

The root [index.html](index.html) is just a meta-refresh redirect to `template/`; the demo lives under `template/`. GitHub Pages serves this at `willscott-v2.github.io/html-slides/`.

## Architecture

**One file, three regions** in [template/index.html](template/index.html):

1. `<style>` block — brand variables in `:root`, then layout and components. The `html { font-size: 20px; }` rule is the global scale knob (16/20/26 px → laptop/medium/big-stage). Every `clamp()` in the stylesheet scales off it.
2. `<body>` — a `.slide-container` with `scroll-snap-type: y mandatory`, containing one `<section class="slide" data-title="...">` per slide. `data-title` drives the nav drawer label, the presenter overlay heading, and (slugified) the URL hash `#slug`.
3. `<script>` IIFE — the engine. Auto-generates slide IDs, handles keyboard/wheel/scroll navigation, syncs two windows via `BroadcastChannel`, and renders the presenter overlay.

**Adding a slide is a two-place edit:**

- Add a `<section class="slide" data-title="Unique Title">…</section>` to the body (copy an existing one for structure).
- Add a matching entry to the `slideNotes[]` array in the script block (same order as the HTML) — else the presenter view shows "(No notes for this slide.)".

`slideNotes` is the single source of truth for speaker notes. `template/index.html` exposes it on `window.slideNotes` so `export-screenshots.js` can write `notes.json` alongside the PNGs; `build-pptx.py` reads that JSON. Don't maintain a second `NOTES[]` array anywhere.

**BroadcastChannel name is per-talk.** The script uses `new BroadcastChannel('my-talk-2026')`. Rename it to something unique per deck — otherwise two decks open in the same browser will fight over slide position.

**Presenter mode has two entry points** (`?presenter=1` URL param or pressing `N`) that share one overlay builder (`buildPresenterOverlay`) and one updater (`updatePresenterView`). The URL-param path hides the main slide view entirely; the `N` toggle flips visibility of `.slide-container` and the overlay together.

**Slide layout classes** applied to `<section class="slide">`: default is bottom-left; `.slide-center`, `.slide-center-left`, `.slide-bottom` shift content. Full-bleed photo slides use a `.slide-bg` div as first child and wrap text in `.text-panel` for a frosted-glass readability overlay.

## Things to preserve

- **Zero dependencies in the runtime.** No npm in `template/`, no bundler, no CDN scripts beyond the optional Google Fonts link. The PPTX export toolchain (Playwright, python-pptx) and the QA/deploy scripts are opt-in and live outside `template/`.
- **The brand variables pattern.** Colors and the font stack are defined once in `:root`; every component references them. Don't hardcode colors in individual slides.
- **`window.slideNotes` exposure.** The `template/index.html` IIFE assigns `window.slideNotes = slideNotes;` so external tooling can read the array. Don't remove that line — `export-screenshots.js` depends on it.
- **`.gitignore` excludes build artifacts.** `*.pptx`, `screenshots/`, `template/screenshots/`, `qa-screenshots/`, `template/deploy.sh` — all project-specific outputs, never commit them. `PROMOTION.md` is also gitignored.

## Layout trap: centered content + absolute-positioned footer

A recurring failure mode: a slide uses `.slide-center` (which applies `justify-content: center`) with tall content AND carries an absolute-positioned logo or footer. The logo sits outside normal flow, so the flexbox centers the main content against the full slide height — which pushes the top of the content above the viewport and silently clips it. Nothing visibly errors; you just lose the first two lines of the slide.

Fixes (in order of preference):
1. Use `.slide-center-left` instead — vertically centered but with room for a footer.
2. Drop the global `html { font-size }` down one step (24px → 20px → 16px) so the content fits.
3. Make the footer part of normal flow (inside `.slide` as a last child, not position: absolute).

If `qa-screenshots.js` flags "content escape" on a centered slide with no apparent overflow, this is almost always the cause.
