---
name: evidence-cleanup
description: Normalize and deduplicate enriched ladies nighty product records from evidence/image_features/. Use when cleaning garment-feature-enriched JSON files; converting price strings to numbers; parsing rating strings to floats; stripping sponsored URL redirects to canonical product URLs; normalizing cloth_texture "unsure" and secondary_color "unknown"; flagging low-confidence garment features; deduplicating by product ID across keyword files. Reads from evidence/image_features/, writes cleaned output to evidence/clean/.
compatibility: Node.js 18+ required for scripts/normalize.js bulk processing. LLM-only mode available for single-record or ad-hoc cleanup without script execution.
---

# Evidence Cleanup Skill

## Overview

This skill normalizes enriched product records from the `garment-features` skill — cleaning dirty product fields (price strings, rating prose, ephemeral URLs) and garment-feature fields (ambiguous values like `"unsure"` and `"unknown"`), then deduplicates across keyword files by stable product ID.

**Input:** `evidence/image_features/<source>/<keyword>.json` (18-field merged records)

**Output:** `evidence/clean/<source>/<keyword>.json` + `evidence/clean/_merged.json` (deduplicated)

---

## Quick Start

**For bulk processing:**

```bash
node skills/evidence-cleanup/scripts/normalize.js
# Reads evidence/image_features/, writes evidence/clean/
```

**For single-record or ad-hoc cleanup:**

Ask Claude: "Clean this product record" or "Normalize prices in this array" — Claude will apply the rules inline without running the script.

---

## Normalization Rules

### 1. Price Field

**Input:** Raw string like `"₹499"`, `"₹1,299"`, `"₹170 (approx, from listing meta)"`, or `""`

**Output:** Two derived fields:
- `price_numeric`: integer or null
- `price_confidence`: `"exact"` | `"approx"` | `null`

**Algorithm:**
1. If string is empty (`""`), set both to null
2. If string contains `"(approx"`, set `price_confidence: "approx"`; otherwise `"exact"`
3. Remove the suffix `" (approx, from listing meta)"` if present
4. Strip rupee symbol (`₹`), whitespace, and commas
5. Parse to integer; return null if not a valid number

**Examples:**

| Input | price_numeric | price_confidence |
|-------|---------------|------------------|
| `"₹499"` | 499 | `"exact"` |
| `"₹1,299"` | 1299 | `"exact"` |
| `"₹170 (approx, from listing meta)"` | 170 | `"approx"` |
| `""` | null | null |

---

### 2. Rating Field

**Input:** Raw string like `"4.2 out of 5 stars"`, `"4.2"`, or `""`

**Output:** One derived field:
- `rating_numeric`: float or null

**Algorithm:**
1. If empty, return null
2. Extract first decimal number using regex `/([\d.]+)/`; return as float
3. Return null if no number found

**Examples:**

| Input | rating_numeric |
|-------|---|
| `"4.2 out of 5 stars"` | 4.2 |
| `"4.2"` | 4.2 |
| `"3"` | 3.0 |
| `""` | null |

---

### 3. Review Count Field

**Input:** Raw string like `"1,234"`, `"1,234 ratings"`, or `""`

**Output:** One derived field:
- `review_count_numeric`: integer or null

**Algorithm:**
1. If empty, return null
2. Remove all non-digits (commas, spaces, text)
3. Parse to integer; return null if empty after stripping

**Examples:**

| Input | review_count_numeric |
|-------|---|
| `"1,234"` | 1234 |
| `"1,234 ratings"` | 1234 |
| `"5"` | 5 |
| `""` | null |

---

### 4. Title Field

**Output:** Two derived fields:
- `title_truncated`: boolean

**Algorithm:**
1. Set `title_truncated: true` if title ends with `"..."` or `"…"`
2. Do not strip the ellipsis from the title itself (preserve original for audit)

**Example:**

| Input | title_truncated |
|-------|---|
| `"Women Flower Printed Casual Wear Cotton Nighty"` | false |
| `"Women Flower Printed Casual Wear Cotton Nighty..."` | true |
| `"Bahumaan Pure Cotton Nighty…"` | true |

---

### 5. Sponsored Ad Title Prefix

**Input:** Title like `"Sponsored Ad - Bahumaan Pure Cotton Nighty"`

**Output:** Cleaned title without prefix

**Algorithm:**
1. Strip leading `"Sponsored Ad - "` using `.replace(/^Sponsored Ad - /, '')`
2. Note: This happens *before* checking for truncation (`title_truncated` flag)

**Example:**

```
Input:  "Sponsored Ad - Bahumaan Pure Cotton Nighty..."
Output: "Bahumaan Pure Cotton Nighty..."
title_truncated: true
```

---

### 6. URL Field

**Output:** Same URL field (modified in place)

**Algorithm:**

**For Amazon sspa/click URLs:**
1. Detect: `/gp/slredirect/` or `sspa/click` in URL
2. Extract ASIN from the URL path (pattern: `/dp/([A-Z0-9]+)/`)
3. Reconstruct canonical: `https://www.amazon.in/dp/{ASIN}`
4. Example:
   - Input: `https://www.amazon.in/gp/slredirect/picassoRedirect.html?ie=UTF8&adId=...&url=https%3A%2F%2Fwww.amazon.in%2Fdp%2FB0FG16XW7G%2F...`
   - Extract: `B0FG16XW7G`
   - Output: `https://www.amazon.in/dp/B0FG16XW7G`

**For IndiaMART URLs:**
1. Detect: `/proddetail/` in URL
2. Extract slug (pattern: `/proddetail/([^?]+)`)
3. Strip all query parameters (`?pos=...&kwd=...&tags=...`)
4. Reconstruct canonical: `https://www.indiamart.com/proddetail/{SLUG}`
5. Example:
   - Input: `https://www.indiamart.com/proddetail/ladies-nighty-2858768924891.html?pos=1&kwd=ladies+cotton+nighty&tags=rk:A|plc:1|dt:0|...`
   - Extract: `ladies-nighty-2858768924891.html`
   - Output: `https://www.indiamart.com/proddetail/ladies-nighty-2858768924891.html`

**For other URLs:**
1. Leave as-is

---

### 7. Cloth Texture Field

**Input:** Enum value like `"cotton"`, `"satin"`, or `"unsure"`

**Output:** One derived field:
- `texture_resolved`: boolean

**Algorithm:**
1. Set `texture_resolved: false` if `cloth_texture === "unsure"`
2. Otherwise `texture_resolved: true`

**Example:**

| Input | texture_resolved |
|-------|---|
| `"cotton"` | true |
| `"unsure"` | false |

---

### 8. Secondary Color Field

**Input:** Enum value like `"blue"`, `"none"`, or `"unknown"`

**Output:** Same field (modified in place)

**Algorithm:**
1. If `secondary_color === "unknown"`, set to `null`
2. Keep `"none"` as-is (means single-color garment with no secondary)
3. Keep all color names as-is

**Example:**

| Input | Output |
|-------|--------|
| `"blue"` | `"blue"` |
| `"none"` | `"none"` |
| `"unknown"` | `null` |

---

### 9. Confidence & Feature Reliability

**Output:** One derived field:
- `features_reliable`: boolean

**Algorithm:**
1. Set `features_reliable: false` if `confidence === "low"`
2. Otherwise `features_reliable: true`
3. Do not filter out low-confidence records; just flag them

---

### 10. Product ID (Deduplication Key)

**Output:** New field `product_id`

**Algorithm:**
1. Use the canonical URL (after URL cleanup)
2. Compute: `sha256(source + "|" + canonical_url)`
3. Truncate to first 12 characters
4. Example:
   - Source: `"amazon"`
   - URL: `https://www.amazon.in/dp/B0FG16XW7G`
   - Key: `"amazon|https://www.amazon.in/dp/B0FG16XW7G"`
   - Hash: `sha256(key)` → first 12 chars → `"a3f9c12b4e7d"`

---

### 11. Keyword Matches (Deduplication Cross-File)

**Output:** New field `keyword_matches` (array)

**Algorithm:**
1. When deduplicating by `product_id` across files, union all matched keywords
2. For the merged `_merged.json`, keep the first occurrence and record all matched keywords
3. Example: If product `"a3f9c12b4e7d"` appears in:
   - `ladies-cotton-nighty.json` (keyword: `"ladies cotton nighty"`)
   - `nighty-wholesale-erode.json` (keyword: `"nighty wholesale erode"`)
   - Output: `keyword_matches: ["ladies cotton nighty", "nighty wholesale erode"]`

---

## Output Schema

All original fields preserved; derived fields added:

```json
{
  "product_id":            "a3f9c12b4e7d",
  "source":                "amazon",
  "keyword":               "ladies cotton nighty",
  "keyword_matches":       ["ladies cotton nighty", "nighty wholesale erode"],
  "title":                 "Bahumaan Pure Cotton Nighty for Women",
  "title_truncated":       false,
  "url":                   "https://www.amazon.in/dp/B0FG16XW7G",
  "price":                 "₹499",
  "price_numeric":         499,
  "price_confidence":      "exact",
  "rating":                "4.2 out of 5 stars",
  "rating_numeric":        4.2,
  "review_count":          "1,234",
  "review_count_numeric":  1234,
  "image":                 "https://m.media-amazon.com/images/I/41uDo10bdiL._AC_UL320_.jpg",
  "neck_type":             "round",
  "design_pattern":        "floral",
  "front_top_treatment":   "embroidery",
  "front_bottom_style":    "umbrella",
  "primary_color":         "pink",
  "secondary_color":       "none",
  "sleeve_length":         "half",
  "cloth_texture":         "cotton",
  "texture_resolved":      true,
  "confidence":            "high",
  "features_reliable":     true,
  "notes":                 null
}
```

---

## Files & Usage

**Bulk processing (Node.js):**

```bash
node skills/evidence-cleanup/scripts/normalize.js
# Reads:  evidence/image_features/<source>/<keyword>.json
# Writes: evidence/clean/<source>/<keyword>.json
#         evidence/clean/_merged.json
```

**Flags:**
- `--dry-run` — print stats, write nothing
- `--source=amazon` — process one source only
- `--verbose` — log every transformation

**Validation:**

```bash
python skills/evidence-cleanup/scripts/validate_output.py evidence/clean/_merged.json
```

---

## Limitations

- Requires canonical URL to generate stable `product_id` — if URL is empty, record is skipped
- IndiaMART image URLs are not captured (lazy-loaded) — remains empty string
- Product page details (full title, review count) require product-page scraping — not available from search results
