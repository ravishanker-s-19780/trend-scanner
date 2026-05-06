# trend-scanner

Local Playwright scraper that collects **real** product/listing evidence for the
South India B2B ladies-nighty design validation workflow from:

1. Amazon.in
2. Myntra
3. Meesho
4. IndiaMART

It writes one JSON file per `(source, keyword)` into `evidence/`. The Copilot
agent then reads only those files to build the Evidence Table and design
candidates — no fabricated data.

## Setup

```bash
cd trend-scanner
npm install
# Chromium is installed automatically via postinstall.
```

## Run

```bash
# All sources, all keywords (slow; ~5–15 min):
npm run scrape

# Or one source at a time (recommended first run, easier to debug CAPTCHAs):
npm run scrape:amazon
npm run scrape:myntra
npm run scrape:meesho
npm run scrape:indiamart
```

Useful flags:

```bash
node scrape.js --sources=amazon,myntra        # subset of sources
node scrape.js --max=8                         # max products per keyword (default 10)
node scrape.js --headful                       # show the browser window
node scrape.js --keywords="ladies cotton nighty,feeding nighty zip model"
```

## What it captures

For every product card it can see on the listing page:

- `source` (amazon | myntra | meesho | indiamart)
- `keyword`
- `title`
- `url` (absolute, specific product/listing — never the homepage)
- `price` (visible text, e.g. "₹399")
- `rating` and `review_count` (when visible)
- `image`

It does **not** invent fabric / model / features. Those fields are left for the
agent to read from the title or for you to enrich manually. Homepage URLs are
never written.

## CAPTCHAs / bot protection

If a site challenges the browser:

1. Re-run with `--headful` and solve it once. The session persists in
   `user-data/<source>` so subsequent runs skip the challenge.
2. Or just skip that source — the scraper will continue with others and the
   agent will work with whatever evidence is collected.

## Output layout

```
evidence/
  amazon/
    ladies-cotton-nighty.json
    women-cotton-nighty-front-zip.json
    ...
  myntra/
  meesho/
  indiamart/
  _summary.json
```

Then tell Copilot: *”Read `evidence/` and produce the Evidence Table + design
candidates.”*

## Skills

This project includes **Claude Code Skills** to enhance your workflow in Claude Code, Claude.ai, and the Claude API.

### garment-features

Extract structured design features from ladies' nightwear product photos.

**What it does:**
- Analyzes product images and extracts 8 core design attributes
- Features: neckline type, design pattern, front treatment, silhouette, colors, sleeves, fabric texture
- Outputs clean JSON with confidence levels (high/medium/low)
- Handles low-resolution thumbnails gracefully with appropriate confidence calibration

**Quick Start:**

#### Option 1: One-Click Install (Recommended)
1. Download: [`garment-features.skill`](skills/garment-features.skill)
2. Double-click the file → Claude Code auto-installs
3. Done! Use `/garment-features` in Claude Code

#### Option 2: Install from Local Folder
1. Clone this repo: `git clone https://github.com/ravishanker-s-19780/trend-scanner.git`
2. Open Claude Code → Skills
3. Click “Create from local folder”
4. Point to: `skills/garment-features/`
5. Start using: `/garment-features`

#### Option 3: Share with Team
1. Download [`garment-features.skill`](skills/garment-features.skill)
2. Share via Slack, email, or your team drive
3. Collaborators double-click to install

**Usage:**

```
You: “Extract garment features from this image”
[provide product image]

Skill outputs:
{
  “neck_type”: “round”,
  “design_pattern”: “floral”,
  “front_top_treatment”: “print”,
  “front_bottom_style”: “straight”,
  “primary_color”: “blue”,
  “secondary_color”: “white”,
  “sleeve_length”: “half”,
  “cloth_texture”: “cotton”,
  “confidence”: “high”,
  “notes”: null
}
```

**Features:**
- ✅ 100% JSON compliance
- ✅ Optimized for low-resolution Amazon thumbnails
- ✅ Includes validation utility (`scripts/validate_output.py`)
- ✅ Production-ready with test cases and evaluation results

**Documentation:**
- Main guide: [`skills/garment-features/SKILL.md`](skills/garment-features/SKILL.md)
- Detailed reference: [`skills/garment-features/reference.md`](skills/garment-features/reference.md)
- License: [`skills/garment-features/LICENSE.txt`](skills/garment-features/LICENSE.txt)

**Evaluation Results:**
- 3 test cases with real Amazon product images
- Accuracy: 100% on complex images (vs 67% baseline without skill)
- Performance: Minimal overhead (+7.6% tokens for improved accuracy)
- See: [`skills/garment-features/evals/`](skills/garment-features/evals/)
