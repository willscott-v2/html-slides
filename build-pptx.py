"""
build-pptx.py
Build a PPTX from slide screenshots + speaker notes.
Run after export-screenshots.js has generated the screenshots folder.

Requirements:
    pip install python-pptx

Usage:
    python3 build-pptx.py
    python3 build-pptx.py --input path/to/screenshots/ --output my-talk.pptx

Output: a 16:9 PPTX at 1920×1080 with full-bleed slide images and speaker notes.
"""

import argparse
import glob
import os
import sys

try:
    from pptx import Presentation
    from pptx.util import Inches
except ImportError:
    print("Error: python-pptx not installed. Run: pip install python-pptx")
    sys.exit(1)


# ── Config ───────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Build PPTX from slide screenshots")
parser.add_argument("--input",  default=os.path.join(os.path.dirname(__file__), "template", "screenshots"),
                    help="Folder containing slide_01.png, slide_02.png, ...")
parser.add_argument("--output", default=os.path.join(os.path.dirname(__file__), "presentation.pptx"),
                    help="Output .pptx file path")
args = parser.parse_args()

SLIDE_DIR = args.input
OUTPUT    = args.output


# ── Speaker notes ────────────────────────────────────────────
# Mirror the slideNotes[] array in template/index.html.
# Add one entry per slide, in the same order as the HTML.
# These appear in the Notes pane in PowerPoint / Keynote.
NOTES = [
    # Slide 0 — Title
    "Welcome everyone. Introduce yourself and the talk. This is your opening. Set the context.",

    # Slide 1 — Zero Dependencies
    "Core value prop: one HTML file, works offline, no install required.\n\nThree stat boxes reinforce the message. Let the numbers land before moving on.",

    # Slide 2 — vs. Other Tools
    "Walk the comparison table row by row.\n\nFocus on the BroadcastChannel row — two-window sync is built-in here. Other tools need plugins.",

    # Slide 3 — Before / After
    "Before/after contrast. Left = pain. Right = solution.\n\nKey line: 'Version-controlled. Forkable. Works offline.' Pause after the callout bar.",

    # Slide 4 — Get Started
    "Closing slide. QR code to the repo. Quick-start in three steps.\n\nOpen it up for questions.",
]


# ── Build ─────────────────────────────────────────────────────
if not os.path.isdir(SLIDE_DIR):
    print(f"Error: screenshot folder not found: {SLIDE_DIR}")
    print("Run export-screenshots.js first.")
    sys.exit(1)

screenshots = sorted(glob.glob(os.path.join(SLIDE_DIR, "slide_*.png")))
if not screenshots:
    print(f"Error: no slide_*.png files found in: {SLIDE_DIR}")
    sys.exit(1)

print(f"Building PPTX from {len(screenshots)} screenshots...")
print(f"Output: {OUTPUT}\n")

# 16:9 at 1920×1080 = 10 × 5.625 inches
prs = Presentation()
prs.slide_width  = Inches(10)
prs.slide_height = Inches(5.625)

blank_layout = prs.slide_layouts[6]  # completely blank — no placeholders

for i, img_path in enumerate(screenshots):
    slide = prs.slides.add_slide(blank_layout)

    # Full-bleed slide image
    slide.shapes.add_picture(
        img_path,
        left=Inches(0), top=Inches(0),
        width=prs.slide_width,
        height=prs.slide_height,
    )

    # Speaker notes (if provided)
    if i < len(NOTES) and NOTES[i]:
        slide.notes_slide.notes_text_frame.text = NOTES[i]

    print(f"  ✓ Slide {i + 1} / {len(screenshots)}")

prs.save(OUTPUT)
print(f"\nSaved → {OUTPUT}")
