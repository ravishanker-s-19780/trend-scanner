# Dirty Input Patterns by Source

Reference guide for the kinds of data quality issues found in `evidence/image_features/` records by e-commerce source.

---

## Amazon

### Sponsored Ad Titles

Titles prefixed with `"Sponsored Ad - "` indicate paid placements that appeared in the search results alongside organic results.

```json
{
  "source": "amazon",
  "title": "Sponsored Ad - Bahumaan Pure Cotton Nighty for Women",
  "url": "https://www.amazon.in/gp/slredirect/picassoRedirect.html?ie=UTF8&adId=A1234&url=https%3A%2F%2Fwww.amazon.in%2Fdp%2FB0FG16XW7G%2F..."
}
```

**Cleaned:**
```json
{
  "title": "Bahumaan Pure Cotton Nighty for Women",
  "title_truncated": false,
  "url": "https://www.amazon.in/dp/B0FG16XW7G"
}
```

---

### Truncated Titles

Search result card displays are truncated at ~60 characters, ending with `"..."`.

```json
{
  "source": "amazon",
  "title": "Women Flower Printed Casual Wear Cotton Nighty - Gown-MFNT5014..."
}
```

**Cleaned:**
```json
{
  "title": "Women Flower Printed Casual Wear Cotton Nighty - Gown-MFNT5014...",
  "title_truncated": true
}
```

---

### Ephemeral Sponsored URLs

Sponsored results use redirect URLs that expire after the session ends. The ASIN is embedded in the URL path.

```json
{
  "url": "https://www.amazon.in/gp/slredirect/picassoRedirect.html?ie=UTF8&adId=A5678&url=https%3A%2F%2Fwww.amazon.in%2Fdp%2FB0FJ5KMPSX%2Fref%3Dsr_1_1%3Fkeywords%3Dladies%2Bcotton%2Bnighty..."
}
```

**Cleaned:**
```json
{
  "url": "https://www.amazon.in/dp/B0FJ5KMPSX"
}
```

---

### Price

Amazon prices are clean rupee strings with optional commas.

```json
{
  "price": "₹1,299"
}
```

**Cleaned:**
```json
{
  "price": "₹1,299",
  "price_numeric": 1299,
  "price_confidence": "exact"
}
```

---

### Rating

Amazon ratings are prose strings with the format `"X.X out of 5 stars"`.

```json
{
  "rating": "4.2 out of 5 stars"
}
```

**Cleaned:**
```json
{
  "rating": "4.2 out of 5 stars",
  "rating_numeric": 4.2
}
```

---

### Review Count

Review counts on Amazon search result cards are not captured by the scraper (selector finds nothing). Field is always empty.

```json
{
  "review_count": ""
}
```

**Cleaned:**
```json
{
  "review_count": "",
  "review_count_numeric": null
}
```

---

## IndiaMART

### URLs with Heavy Tracking Parameters

IndiaMART embeds geolocation, session, and ranking metadata in every product URL.

```json
{
  "url": "https://www.indiamart.com/proddetail/ladies-nighty-2858768924891.html?pos=1&kwd=ladies+cotton+nighty&tags=rk:A|plc:1|dt:0|cq:erode|gc:Gunaramanallur|ic:Chennai|ar:TN&imei=&pageType=nonBrandedSearch&pageId=null"
}
```

**Cleaned:**
```json
{
  "url": "https://www.indiamart.com/proddetail/ladies-nighty-2858768924891.html"
}
```

---

### Synthetic Prices from URL

When DOM price selector fails, IndiaMART fallback extracts the `prv:NNN` parameter from the URL and annotates it as approximate.

```json
{
  "price": "₹170 (approx, from listing meta)"
}
```

**Cleaned:**
```json
{
  "price": "₹170 (approx, from listing meta)",
  "price_numeric": 170,
  "price_confidence": "approx"
}
```

---

### Missing Price

Some listings have no price extracted at all (both DOM and URL regex fail).

```json
{
  "price": ""
}
```

**Cleaned:**
```json
{
  "price": "",
  "price_numeric": null,
  "price_confidence": null
}
```

---

### Rating and Review Count

IndiaMART listings do not expose star ratings or review counts in the search card. Both fields are hardcoded to empty strings.

```json
{
  "rating": "",
  "review_count": ""
}
```

**Cleaned:**
```json
{
  "rating": "",
  "rating_numeric": null,
  "review_count": "",
  "review_count_numeric": null
}
```

---

### Image

IndiaMART images are lazy-loaded and require JavaScript rendering. The scraper does not wait for them, so images are always empty.

```json
{
  "image": ""
}
```

**Cleaned:** (unchanged)
```json
{
  "image": ""
}
```

---

## Garment Feature Fields

### Cloth Texture "Unsure"

When the image is low quality or the fabric is ambiguous, confidence is `"medium"` or `"low"` and `cloth_texture` is set to `"unsure"`.

```json
{
  "cloth_texture": "unsure",
  "confidence": "medium",
  "notes": "Image is thumbnail size, fabric type unclear"
}
```

**Cleaned:**
```json
{
  "cloth_texture": "unsure",
  "texture_resolved": false,
  "confidence": "medium",
  "features_reliable": true,  // medium is not low
  "notes": "Image is thumbnail size, fabric type unclear"
}
```

---

### Secondary Color "Unknown"

When the garment has multiple colors but the secondary color cannot be determined, it is marked as `"unknown"` (not `"none"`, which means single-color).

```json
{
  "primary_color": "pink",
  "secondary_color": "unknown"
}
```

**Cleaned:**
```json
{
  "primary_color": "pink",
  "secondary_color": null
}
```

---

### Low Confidence Features

When confidence is `"low"`, features are flagged as unreliable (but not filtered out).

```json
{
  "confidence": "low",
  "notes": "Thumbnail image, features uncertain"
}
```

**Cleaned:**
```json
{
  "confidence": "low",
  "features_reliable": false,
  "notes": "Thumbnail image, features uncertain"
}
```

---

## Deduplication Examples

### Within-File Duplicates (Amazon)

Same product appears as both a sponsored ad and an organic result on the same search page.

**Before dedup:**
```json
[
  {
    "source": "amazon",
    "keyword": "ladies cotton nighty",
    "title": "Sponsored Ad - Bahumaan Pure Cotton Nighty...",
    "url": "https://www.amazon.in/gp/slredirect/...",
    "price_numeric": 499,
    "product_id": "a3f9c12b4e7d"
  },
  {
    "source": "amazon",
    "keyword": "ladies cotton nighty",
    "title": "Bahumaan Pure Cotton Nighty for Women",
    "url": "https://www.amazon.in/dp/B0FG16XW7G",
    "price_numeric": 499,
    "product_id": "a3f9c12b4e7d"
  }
]
```

**After dedup (keep first, organic version preferred):**
```json
[
  {
    "source": "amazon",
    "keyword": "ladies cotton nighty",
    "title": "Bahumaan Pure Cotton Nighty for Women",
    "url": "https://www.amazon.in/dp/B0FG16XW7G",
    "price_numeric": 499,
    "product_id": "a3f9c12b4e7d"
  }
]
```

---

### Cross-File Duplicates (Dedup for Merged)

Same product matched by two keyword searches.

**File 1: `ladies-cotton-nighty.json`**
```json
{
  "source": "amazon",
  "keyword": "ladies cotton nighty",
  "url": "https://www.amazon.in/dp/B0FG16XW7G",
  "product_id": "a3f9c12b4e7d"
}
```

**File 2: `nighty-wholesale-erode.json`**
```json
{
  "source": "amazon",
  "keyword": "nighty wholesale erode",
  "url": "https://www.amazon.in/dp/B0FG16XW7G",
  "product_id": "a3f9c12b4e7d"
}
```

**In merged (keep first, union keywords):**
```json
{
  "source": "amazon",
  "keyword": "ladies cotton nighty",
  "keyword_matches": ["ladies cotton nighty", "nighty wholesale erode"],
  "url": "https://www.amazon.in/dp/B0FG16XW7G",
  "product_id": "a3f9c12b4e7d"
}
```
