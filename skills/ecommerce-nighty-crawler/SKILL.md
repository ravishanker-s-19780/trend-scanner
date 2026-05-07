---
name: ecommerce-nighty-crawler
description: Crawl 10 major Indian e-commerce platforms (Amazon.in, Myntra, Flipkart, Ajio, Meesho, Nykaa Fashion, Clovia, Zivame, Tata CLiQ, Shyaway) to extract structured product data for women's nighty and tops. Captures cloth type, design name, reviews with dates, purchaser demographics (location, age, purchase purpose including wedding), and base64 images/videos. Use for market research, trend analysis, wedding-relevant product discovery, and building product databases.
compatibility: Requires Playwright (^1.47.0) for headless browser automation. Optional: Sharp (image processing), FFmpeg (video thumbnails).
---

# E-Commerce Nighty Crawler Skill

When asked to crawl, analyze, or extract nighty/tops product data from e-commerce platforms, use `scripts/crawler.js` via Playwright. Store results incrementally using `scripts/incremental-storage.js`. Never overwrite existing evidence files — always append.

## Platforms to Crawl

| # | Platform | URL |
|---|----------|-----|
| 1 | Amazon.in | https://www.amazon.in |
| 2 | Myntra | https://www.myntra.com |
| 3 | Flipkart | https://www.flipkart.com |
| 4 | Ajio | https://www.ajio.com |
| 5 | Meesho | https://www.meesho.com |
| 6 | Nykaa Fashion | https://www.nykaafashion.com |
| 7 | Clovia | https://www.clovia.com |
| 8 | Zivame | https://www.zivame.com |
| 9 | Tata CLiQ | https://www.tatacliq.com |
| 10 | Shyaway | https://www.shyaway.com |

## Required Output Fields Per Product

Extract and return all fields below. If a field is unavailable on a platform, set it to `null` — never omit it.

### Product Core
```json
{
  "product_id": "string (hash of platform + url)",
  "platform": "string (e.g. amazon.in)",
  "product_title": "string",
  "product_url": "string (full canonical URL)",
  "price": "number (INR)",
  "cloth_type": "string (Cotton | Silk | Linen | Polyester | Rayon | Satin | Blend | Bamboo)",
  "design_name": "string (Floral Print | Solid | Striped | Checked | Embroidered | Lace | Geometric | Plain)"
}
```

### Reviews
```json
{
  "reviews": {
    "count": "number (total review count)",
    "average_rating": "number (out of 5)",
    "details": [
      {
        "reviewer_name": "string",
        "rating": "number (1–5)",
        "review_text": "string (full review content)",
        "review_date": "string (ISO 8601, e.g. 2026-04-15T10:30:00Z)",
        "helpful_count": "number"
      }
    ]
  }
}
```

### Purchase Metrics
```json
{
  "purchase_metrics": {
    "max_purchased": "number (peak monthly/total purchases — use badge text like '1000+ sold')",
    "recent_purchase_count": "number (last 30 days, from 'X bought in past month' labels)",
    "recent_purchase_label": "string (raw label text, e.g. '500+ bought in past month')",
    "total_sold": "number | null"
  }
}
```

### Purchaser Profile
```json
{
  "purchaser_profile": {
    "purchaser_name": "string | null (reviewer/buyer name if shown in purchase history)",
    "primary_location": "string (city/state inferred from reviews, e.g. 'Chennai, Bangalore')",
    "age_range": "string (18-25 | 26-35 | 36-50 | 50+, inferred from review language/context)",
    "repeat_purchase_rate": "number | null (0–1, if shown)",
    "purchase_frequency": "string | null (e.g. 'weekly', 'monthly')"
  }
}
```

### Purchase Context
```json
{
  "purchase_context": {
    "purpose_of_purchase": "string[] (one or more: casual | wedding | gift | maternity | honeymoon | engagement | bridal-shower)",
    "wedding_relevant": "boolean (true if any wedding/bridal keyword detected in reviews or tags)",
    "occasion_tags": "string[] (specific occasions mentioned in reviews or product tags)"
  }
}
```

### Media
```json
{
  "media": {
    "images": [
      {
        "url": "string",
        "base64": "string (data:image/jpeg;base64,...)",
        "alt_text": "string",
        "width": "number | null",
        "height": "number | null"
      }
    ],
    "videos": [
      {
        "url": "string",
        "duration_seconds": "number | null",
        "thumbnail_base64": "string (data:image/jpeg;base64,...)",
        "format": "string (mp4 | webm)"
      }
    ]
  }
}
```

### Crawl Metadata (per record)
```json
{
  "crawl_sequence": "number (which crawl run this product appeared in)",
  "times_seen": "number (how many runs this URL has appeared)",
  "is_new_in_this_run": "boolean",
  "first_seen": "string (ISO 8601)",
  "last_updated": "string (ISO 8601)",
  "price_changed": "boolean",
  "previous_price": "number | null",
  "review_count_changed": "boolean",
  "previous_review_count": "number | null",
  "timestamp": "string (ISO 8601, this crawl run)"
}
```

## Incremental Storage Rules

1. Read existing `evidence/<platform>/<keyword>.jsonl` and `_dedup_index.json` before crawling.
2. Generate `product_id = sha256(platform + canonical_url).slice(0,12)`.
3. Normalize URLs: strip query params (`ref=`, `tag=`, UTM), lowercase domain.
4. **New product**: set `is_new_in_this_run: true`, append to `.jsonl`, add to dedup index.
5. **Seen before**: compare `price`, `review_count`, `average_rating` — if changed, append updated record with `price_changed: true` / `review_count_changed: true`. If unchanged, skip (do not duplicate).
6. After crawl, update `evidence/<platform>/<keyword>.meta.json` and `evidence/_crawl_log.json`.

## Storage Layout

```
evidence/
├── amazon/
│   ├── women-nighty.jsonl         # One JSON object per line
│   └── women-nighty.meta.json     # Crawl history, unique count
├── myntra/
│   └── ...
├── _dedup_index.json              # product_id → "platform/keyword"
├── _crawl_log.json                # Timeline of all crawl runs
└── _summary.json                  # Aggregated stats
```

## Crawl Execution

Run via CLI:
```bash
node scripts/crawler.js --platforms=amazon,myntra --keywords="women nighty" --max=50
node scripts/crawler.js --platforms=all --keywords="ladies nighty,cotton nightgown" --max=50
node scripts/crawler.js --platforms=amazon --headful   # Show browser (for CAPTCHA)
```

Or via API:
```javascript
import { crawlEcommercePlatforms } from './scripts/crawler.js';
const results = await crawlEcommercePlatforms({
  platforms: ['amazon', 'myntra'],
  keywords: ['women nighty'],
  maxProducts: 50,
  includeImages: true,
  includeVideos: true
});
```

## CAPTCHA Handling

If a platform blocks the browser:
1. Re-run with `--headful` and solve the challenge manually once.
2. Session persists in `user-data/<platform>/` for subsequent runs.
3. If unresolvable, skip that platform and continue with others.

## Key Inference Rules

- **cloth_type**: Extract from product title, material specs, or description. Map synonyms (e.g. "100% cotton" → "Cotton").
- **design_name**: Extract from title/tags. Prefer specific over generic (e.g. "Floral Print" over "Printed").
- **age_range**: Infer from review language ("gift for my mom" → 50+, "comfortable for college" → 18-25).
- **purpose_of_purchase**: Scan review text and product tags for keywords: wedding/bridal/marriage/honeymoon → wedding; maternity/nursing/postpartum → maternity.
- **max_purchased**: Use "X+ sold", "bestseller rank", or "X bought in past month" badges.

## Error Handling

- On network timeout: retry up to 3 times with exponential backoff.
- On missing selector: log warning, set field to `null`, continue.
- On 429 rate limit: wait `2^attempt` seconds before retry.
- On 403/blocked: skip platform, log in `_crawl_log.json`.

## Example Usage Phrases

- "Crawl Amazon and Myntra for cotton nighty products"
- "Extract review data and purchaser demographics from all 10 platforms"
- "Find wedding-relevant nighties from premium platforms (Nykaa, Tata CLiQ, Shyaway)"
- "Get product images and videos for the top 20 Meesho nighties"
- "Build a product database with purchaser age and location data"

See [CONFIG.md](CONFIG.md) for platform-specific rate limits, selector configs, and session management.
