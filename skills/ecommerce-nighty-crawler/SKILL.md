---
name: ecommerce-nighty-crawler
description: One-shot crawl of 8 Indian e-commerce platforms (Amazon.in, Myntra, Flipkart, Ajio, Meesho, Clovia, Tata CLiQ, Shyaway) for women's nighty products. Targets 100 items per platform (~800 total). Outputs flat JSON with trend-prediction fields: price, rating, review_count, cloth_type, design_name, recent_purchase_count, wedding_relevant, images. No dedup — handled in a separate layer.
compatibility: Requires Playwright (^1.47.0) for headless browser automation.
---

# E-Commerce Nighty Crawler Skill

One-shot crawl. No incremental storage, no dedup — raw evidence only. Deduplication is handled downstream in the clean-up layer.

## Platforms

| # | Platform | Domain |
|---|----------|--------|
| 1 | Amazon.in | amazon.in |
| 2 | Myntra | myntra.com |
| 3 | Flipkart | flipkart.com |
| 4 | Ajio | ajio.com |
| 5 | Meesho | meesho.com |
| 6 | Clovia | clovia.com |
| 7 | Tata CLiQ | tatacliq.com |
| 8 | Shyaway | shyaway.com |

## Output

One JSON file per platform written to `evidence/original/<platform>.json`. Each file is a plain JSON array of up to 100 product records.

```
evidence/
└── original/
    ├── amazon.json
    ├── myntra.json
    ├── flipkart.json
    ├── ajio.json
    ├── meesho.json
    ├── clovia.json
    ├── tatacliq.json
    └── shyaway.json
```

## Output Fields

All fields are required. Set to `null` if unavailable — never omit.

```json
{
  "product_id":            "string  — sha256(platform+url), 12 hex chars",
  "platform":              "string  — e.g. amazon.in",
  "keyword":               "string  — search keyword that found this product",
  "product_title":         "string",
  "product_url":           "string  — full URL",
  "price":                 "number (INR) | null",
  "rating":                "number (0–5) | null",
  "review_count":          "number | null",
  "recent_purchase_label": "string  — raw badge e.g. '500+ bought in past month' | null",
  "recent_purchase_count": "number | null",
  "cloth_type":            "Cotton | Silk | Linen | Polyester | Rayon | Satin | Blend | Bamboo | null",
  "design_name":           "Floral Print | Solid | Striped | Checked | Embroidered | Lace | Geometric | Plain | null",
  "images":                "string[] — all image URLs visible on the listing card",
  "wedding_relevant":      "boolean",
  "purpose_of_purchase":   "string[] — casual | wedding | maternity | gift"
}
```

## Trend Prediction Impact

| Field | Score Dimension | Impact |
|---|---|---|
| `review_count` | A — Evidence Strength | **Critical.** Without it, score is capped at ≤14 |
| `rating` | A — Evidence Strength | Partial Tier B signal alongside review_count |
| `price` | C — B2B Fit, E — Margin | Wholesale band ₹150–320 → C+2; retail-only → C-1 |
| `recent_purchase_count` | B — Trend Signal | "500+ bought in past month" → B+3 to +5 |
| `cloth_type` | C — B2B Fit, E — Margin | Cotton → C+2, E+2; Polyester → C-1, E-1 |
| `design_name` | D — Production Simplicity | Embroidered → D-1; Plain/Floral → D neutral |
| `wedding_relevant` | B — Trend Signal | Wedding/bridal context → premium demand signal |
| `images` | — | Multiple views fed to garment-features skill |

## CLI Usage

```bash
node skills/ecommerce-nighty-crawler/scripts/crawler.js                          # All 8 platforms
node skills/ecommerce-nighty-crawler/scripts/crawler.js --platforms=amazon,myntra
node skills/ecommerce-nighty-crawler/scripts/crawler.js --max=50
node skills/ecommerce-nighty-crawler/scripts/crawler.js --concurrency=2          # Lower if RAM-constrained
node skills/ecommerce-nighty-crawler/scripts/crawler.js --headful                # Show browser (for CAPTCHA)
node skills/ecommerce-nighty-crawler/scripts/crawler.js --keywords="ladies nighty,plus size nighty"
```

## CAPTCHA Handling

1. Re-run with `--headful` and solve the challenge manually once.
2. Session persists in `user-data/<platform>/` — subsequent headless runs skip the challenge.
3. If unresolvable, skip that platform; the crawler continues with others.

## Inference Rules

- **`cloth_type`**: Longest-match from title (`poly-cotton` → Blend before `cotton` → Cotton).
- **`design_name`**: `floral`/`flower` → Floral Print; `embroidered` → Embroidered; generic `printed` without qualifier → `null`.
- **`wedding_relevant`**: `true` if title or keyword contains: wedding, bridal, bride, marriage, honeymoon, engagement.
- **`recent_purchase_count`**: Parsed from badge text — `1K+` → 1000, `500+` → 500.

## Downstream Pipeline

```
evidence/original/      ← 1. raw crawl output (this skill)
evidence/image-feature/ ← 2. garment-features skill (input: crawl data)
evidence/clean-up/      ← 3. dedup, normalize, validate (input: image-feature data)
```
