# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Start

```bash
npm install
npm run scrape                           # All sources, all keywords (~5–15 min)
npm run scrape:amazon                    # Single source (easier to debug CAPTCHAs)
npm run scrape:myntra
npm run scrape:meesho
npm run scrape:indiamart
```

## What This Project Does

A Playwright-based web scraper that collects **real** product evidence for South India B2B ladies-nighty design validation. It extracts product data from four e-commerce platforms:

- **Amazon.in**, **Myntra**, **Meesho**, **IndiaMART**

It writes one JSON file per `(source, keyword)` pair to `evidence/` with these fields per product:
- `source`, `keyword`, `title`, `url`, `price`, `rating`, `review_count`, `image`

**Core principle:** No homepage URLs, no fabricated fields. The agent reads only these files to build the Evidence Table and design candidates.

## Architecture

**Single entry point:** `scrape.js` (277 lines)

### Flow
1. Parse CLI args (sources, max items, keywords, headful mode)
2. Read `keywords.json` or accept custom keywords via `--keywords=`
3. For each source:
   - Launch a persistent Playwright browser context (stored in `user-data/<source>`) to preserve sessions across runs (crucial for CAPTCHA handling)
   - For each keyword:
     - Call the per-source scraper function
     - Extract product cards and their HTML text/attributes using source-specific selectors
     - Write extracted items to `evidence/<source>/<slug(keyword)>.json`
4. Write a summary of all runs to `evidence/_summary.json`

### Per-Source Scrapers

Each e-commerce platform has its own function (`scrapeAmazon`, `scrapeMyntra`, `scrapeMeesho`, `scrapeIndiamart`) because:
- HTML structure varies significantly
- Selectors are platform-specific
- Some require special handling (e.g., Meesho lazy-loads, IndiaMART has login modals)
- CAPTCHA/bot detection varies

**Common patterns:**
- Navigate to search URL, wait for DOM, detect blocking (CAPTCHA/access denied)
- Extract product cards using source-specific selectors
- For each card, safe-extract title, price, rating, reviews, image, URL
- Filter out homepage URLs (e.g., `amazon.in/` with no path)
- Deduplicate by URL (Meesho, IndiaMART)

### Key Implementation Details

- **Safe extraction:** `safeText()` and `safeAttr()` helpers with 1500ms timeout. Returns empty string on failure, preventing crashes from missing/moved selectors.
- **Persistent contexts:** Each source gets its own `user-data/<source>` directory. Browsers retain login/session state, reducing CAPTCHA re-challenges across runs.
- **User-Agent & locale:** Masquerades as Chrome on macOS (India-localized, `en-IN` locale, Kolkata timezone).
- **Lazy-loading:** Meesho requires a scroll before collecting cards; others use `waitUntil: 'domcontentloaded'` with additional waits.
- **Login modal cleanup:** IndiaMART can show a login overlay; scraper tries to close it before parsing.
- **Fallback selectors:** IndiaMART uses a fallback to anchor patterns if card selectors fail; price falls back to URL metadata (`prv:NNN`).

## CLI Flags

```bash
node scrape.js --sources=amazon,myntra        # Only these sources (comma-separated)
node scrape.js --max=8                        # Max products per keyword (default: 10)
node scrape.js --headful                      # Show browser window (disable headless)
node scrape.js --keywords="ladies cotton nighty,feeding nighty zip model"  # Custom keywords
```

Examples:
```bash
node scrape.js --sources=amazon --max=5 --headful
node scrape.js --keywords="plus size nighty" --max=20
```

## CAPTCHA / Bot Protection

If a site blocks the browser:

1. **Re-run with `--headful`** and solve the CAPTCHA/challenge once. The session persists in `user-data/<source>/`, so subsequent runs skip the challenge.
2. **Or skip that source** — the scraper continues with others and the agent works with whatever evidence is available.

## Output Structure

```
evidence/
  amazon/
    ladies-cotton-nighty.json
    women-cotton-nighty-front-zip.json
    ...
  myntra/
    ...
  meesho/
    ...
  indiamart/
    ...
  _summary.json
```

Each source file is an array of items with the structure above. `_summary.json` tracks per-run success/failure and item counts.

## Extending / Modifying

- **Change keywords:** Edit `keywords.json` or pass `--keywords=...` at runtime.
- **Tweak max items:** Use `--max=N` or change the default in the code.
- **Add a new e-commerce source:** Create a new scraper function (follow the pattern of existing ones), add it to `SCRAPERS` map, and add the source name to `ALL_SOURCES`.
- **Debug a selector:** Use `--headful` to open the browser and inspect element selectors live.

## Dependencies

- **Playwright:** ^1.47.0
  - Chromium is installed automatically via `postinstall` script.
  - Do not manually run Playwright commands; use the npm scripts or `node scrape.js`.

## Performance Notes

- **Full run (all sources, all keywords):** ~5–15 minutes depending on network and CAPTCHA challenges.
- **Per-source time:** ~1–3 minutes.
- **Rate limiting:** 1200–2700ms delay between requests per keyword (to avoid bot detection).

## Troubleshooting

- **Blank/missing products:** A selector may have changed on the site. Use `--headful` to inspect the current HTML and update the selector in the scraper function.
- **Browser crashes:** Ensure `node_modules/` and Chromium are present; re-run `npm install`.
- **Session errors in IndiaMART:** The login modal logic may fail if the modal structure changes; check with `--headful` and adjust the selector in `scrapeIndiamart()`.

## Skills

This project includes Claude Code Skills to enhance your workflow. See [README.md](README.md) for the complete skills documentation.

### garment-features

Extracts structured design features from ladies' nightwear product photos. Use `/garment-features` in Claude Code to analyze images and get JSON output with attributes like neck type, design pattern, sleeve length, colors, and more.

**Installation:**
1. Download [`garment-features.skill`](skills/garment-features.skill) and double-click to install in Claude Code, or
2. Create from local folder → point to `skills/garment-features/`

**Usage:** `Extract garment features from this image`

## Code Quality & CI

**Local Validation (before committing):**
```bash
# Pre-commit hook validates JSON and runs skill validation
# Post-commit hook evaluates changes after commit
# No special commands needed; hooks run automatically
```

See [HOOKS.md](HOOKS.md) for git hook details.

**GitHub CI (after pushing):**
- GitHub Actions workflow automatically validates all skill changes on push and PR
- Checks: JSON syntax, skill fields, enum values
- See [`.github/workflows/README.md`](.github/workflows/README.md) for CI pipeline details
- Status visible in GitHub PR checks and Actions tab

**Workflow:**
1. Make changes to `skills/` directory
2. `git commit` → pre-commit hook validates → post-commit hook evaluates (local feedback)
3. `git push` → GitHub Actions runs same validation (team visibility)
4. PR is blocked if validation fails (with branch protection enabled)
