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

Then tell Copilot: *“Read `evidence/` and produce the Evidence Table + design
candidates.”*
