---
name: b2b-trend-scorer
description: Score and rank ladies' nighty design clusters on a 25-point B2B framework. Use this skill whenever you need to analyze product trends, evaluate design archetypes for B2B fit, score design clusters by evidence strength and market signal, or generate ranked trend recommendations for wholesalers. Takes product data from evidence/clean/_merged.json, clusters by design archetype (pattern, neck, sleeve, treatment), scores each cluster on Evidence Strength, Trend Signal, TN B2B Fit, Production Simplicity, and Margin Possibility, and outputs ranked trends with decision recommendations (Send Now / Send as Backup / Needs More Evidence / Do Not Send).
compatibility: Node.js, Playwright-based project with scraped product data
---

# B2B Trend Scorer

Analyze and score product design clusters against the 25-point B2B framework to identify high-potential trends for wholesale distribution.

## What This Skill Does

The skill reads cleaned product data, groups products into design archetypes (combinations of pattern, neckline, sleeve, and front treatment), and scores each cluster across five dimensions:

| Dimension | Max | What It Measures |
|-----------|-----|------------------|
| **A. Evidence Strength** | 5 | Multi-source data, ratings, product count |
| **B. Trend Signal** | 5 | Customer satisfaction, keyword diversity |
| **C. TN B2B Fit** | 5 | Price point, fabric suitability, production viability |
| **D. Production Simplicity** | 5 | Design complexity, ease of scaling |
| **E. Margin Possibility** | 5 | Profit margin potential at wholesale prices |

**Total: 0–25 points**, with a cap at 14 if evidence is weak (single source, low rating count).

The skill outputs a **ranked list** with decision recommendations:
- **Send Now** (≥20): Strong evidence, high margins, simple production
- **Send as Backup** (≥15): Good signals, acceptable margins
- **Needs More Evidence** (10–14): Promising but risky; collect more reviews
- **Do Not Send** (<10): Poor fit, low evidence, or complexity issues

## When to Use

- **Market analysis:** "Analyze the top 5 design trends across all scraped platforms"
- **B2B recommendations:** "Score these nighty designs — which ones should we send to the TN wholesaler?"
- **Design validation:** "I need to rank design archetypes by market evidence and production feasibility"
- **Single-source analysis:** "Show me the top trends from Amazon only" (`--source=amazon`)
- **Conservative assessment:** "Only score clusters with at least 5 products" (`--min-count=5`)

## Prerequisites

Your project must have:
1. **`evidence/clean/_merged.json`** — cleaned product data with these fields:
   - `features_reliable` (boolean) — skip unreliable rows
   - `design_pattern`, `neck_type`, `sleeve_length`, `front_top_treatment` — clustering keys
   - `source`, `keyword`, `product_id` — provenance
   - `rating_numeric`, `price_numeric`, `cloth_texture` — scoring inputs
   - `primary_color`, `secondary_color` — for color analysis

2. **Node.js** and the project's dependencies (Node.js built-in modules only)

If `_merged.json` doesn't exist, run `node normalize.js` first to clean and deduplicate scraped data.

## Usage

### Basic: Top 5 trends, all sources, all keywords
```bash
node analyze-trends.js
```

### Show top 10 trends
```bash
node analyze-trends.js --top=10
```

### Analyze single platform
```bash
node analyze-trends.js --source=amazon
```

### Conservative: clusters with ≥5 products
```bash
node analyze-trends.js --min-count=5
```

### JSON-only output (suppress console cards)
```bash
node analyze-trends.js --json
```

### Combine flags
```bash
node analyze-trends.js --source=myntra --top=8 --min-count=3
```

## Output

### Console (default)
Displays ranked trends with:
- Design attributes (pattern, neckline, sleeve, treatment)
- Market signal (products, keywords, sources, ratings, price range)
- Score breakdown (A–E dimensions)
- Decision recommendation
- Color distribution

### JSON File
Always writes to `evidence/output/trends.json` with full cluster data.

### HTML Report
Always generates `evidence/output/trends.html` — an interactive HTML dashboard showing:
- Top trends as styled cards with visual score bars
- Design attributes and market signal in a clean layout
- Color palette preview for each trend
- Decision recommendation with color coding (green for Send Now, yellow for Send as Backup, etc.)
```json
{
  "rank": 1,
  "design_pattern": "floral",
  "neck_type": "round",
  "sleeve_length": "half",
  "front_top_treatment": "print",
  "product_count": 8,
  "keyword_count": 3,
  "sources": {"amazon": 4, "myntra": 4},
  "avg_rating": 4.2,
  "avg_price": 485,
  "score": {
    "total": 22,
    "evidence_strength": 5,
    "trend_signal": 4,
    "tn_b2b_fit": 4,
    "production_simplicity": 4,
    "margin_possibility": 5,
    "capped": false
  },
  "decision": "Send Now",
  "sample_product_ids": ["p1", "p2", "p3"],
  "colors": [{"primary": "maroon", "secondary": "gold"}, ...]
}
```

## Score Interpretation

### Evidence Strength (A)
- **5:** ≥2 sources AND avg rating ≥3.8
- **3:** ≥2 sources OR (1 source with ≥3 products AND ≥2 rated)
- **1:** Default fallback

### Trend Signal (B)
- **5:** Avg rating ≥4.0 AND ≥3 keywords
- **3:** Avg rating ≥3.9 AND ≥2 keywords
- **1:** Avg rating ≥3.7
- **0:** Avg rating <3.7

### TN B2B Fit (C)
Starts at 5, deducts for:
- Avg price >₹600 (−2 points) — exceeds wholesale margin ceiling
- No price data (−1 point)
- Non-cotton fabric (−2 points) — TN wholesaler prefers cotton
- Embroidery or lace (−1 point) — difficult to scale production

### Production Simplicity (D)
Average of treatment complexity and sleeve complexity:
- **Treatment:** plain (5), print (3), lace (2), embroidery (1)
- **Sleeve:** half (5), sleeveless (4), 3/4 (3), full (2)

### Margin Possibility (E)
Based on avg price:
- ≤₹450: **5** (good wholesale margin)
- ≤₹600: **3** (acceptable)
- ≤₹750: **1** (tight margin)
- >₹750: **1** (not viable)

## Capping Rule

If a cluster has weak evidence (Evidence Strength < 3), the total score is capped at 14, even if the other dimensions score well. This prevents recommending designs based on thin data.

## Extending / Modifying

**Change which dimensions are scored:** Edit `scoreCluster()` to adjust weights or add new criteria (e.g., seasonal trend signal, Instagram mentions).

**Adjust TN B2B thresholds:** Modify `scoreTNB2BFit()` to reflect different price ceilings, fabric preferences, or production constraints.

**Add new design attributes:** If your cleaned data includes new fields (e.g., `rise`, `neckline_depth`), add them to the clustering key in `clusters` loop and the output object.

**Change decision boundaries:** Adjust the thresholds in `decision()` (currently 20, 15, 10) based on your risk appetite.

## Troubleshooting

- **"_merged.json not found":** Run `node normalize.js` first to clean and deduplicate scraped data.
- **No products after filtering:** Ensure that `features_reliable === true` for at least some products. If all are false, re-run the scraper or check feature extraction.
- **Unexpected cluster count:** Run with `--min-count=1` to see all clusters, or `--source=<platform>` to debug a specific source.
- **All trends scored low:** Check average prices (might be too high for TN) or check if products are mostly non-cotton.
