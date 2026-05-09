# E-Commerce Nighty Crawler

Playwright-based one-shot crawler for women's nighty products across 8 Indian e-commerce platforms.

## Quick Start

```bash
npm install
npm run scrape                            # All 8 platforms, 100 items each
npm run scrape:amazon                     # Single platform
npm run scrape:myntra
```

## CLI

```bash
node skills/ecommerce-nighty-crawler/scripts/crawler.js
node skills/ecommerce-nighty-crawler/scripts/crawler.js --platforms=amazon,flipkart
node skills/ecommerce-nighty-crawler/scripts/crawler.js --max=50
node skills/ecommerce-nighty-crawler/scripts/crawler.js --concurrency=2
node skills/ecommerce-nighty-crawler/scripts/crawler.js --headful
node skills/ecommerce-nighty-crawler/scripts/crawler.js --keywords="ladies nighty,plus size nighty"
```

## Platforms

Amazon · Myntra · Flipkart · Ajio · Meesho · Clovia · Tata CLiQ · Shyaway

## Output

`evidence/original/<platform>.json` — plain JSON array, up to 100 records per platform.

Each record:
```json
{
  "product_id":            "abc123def456",
  "platform":              "amazon.in",
  "keyword":               "ladies nighty",
  "product_title":         "...",
  "product_url":           "https://...",
  "price":                 499,
  "rating":                4.2,
  "review_count":          312,
  "recent_purchase_label": "1K+ bought in past month",
  "recent_purchase_count": 1000,
  "cloth_type":            "Cotton",
  "design_name":           "Floral Print",
  "images":                ["https://...jpg", "https://...jpg"],
  "wedding_relevant":      false,
  "purpose_of_purchase":   ["casual"]
}
```

## File Structure

```
scripts/
  crawler.js          ← entry point + parallel runner
  config.js           ← CLI args, paths, platform list
  browser.js          ← Playwright context, stealth patches
  utils.js            ← enc, abs, parsePrice, parseRating, parseCount
  inference.js        ← cloth/design inference, buildRecord
  scrapers/
    amazon.js
    myntra.js
    flipkart.js
    ajio.js
    meesho.js
    clovia.js
    tatacliq.js
    shyaway.js
    index.js          ← SCRAPERS map
```

## CAPTCHA

Run once with `--headful` and solve the challenge. Session persists in `user-data/<platform>/` for future headless runs.

## Downstream Pipeline

```
evidence/original/      ← 1. this crawler (raw crawl)
evidence/image-feature/ ← 2. garment-features skill (runs on crawl data)
evidence/clean-up/      ← 3. dedup + normalize (runs on image-feature data)
```
