---
name: garment-features
description: Extract structured design features from ladies nightwear product photos. Use this skill whenever the user provides a ladies' nighty, nightgown, or maxi product image and needs structured feature analysis. This includes analyzing single images for design validation, batch-processing product catalogs, extracting trends from e-commerce photos, building feature databases for B2B wholesale research, or classifying garments by style. The skill outputs clean JSON with all visual attributes (neckline, pattern, colors, sleeves, texture) plus confidence levels. Always use this when the user asks to "analyze this nighty", "extract garment features", "classify this product", or mentions analyzing fashion/product photos.
compatibility: Requires Claude's vision capabilities (image/jpeg, image/png, image/webp, etc.)
---

# Garment Features Extractor

## Overview

This skill analyzes product photos of ladies' nightwear (nighty, nightgown, maxi) and extracts **structured visual design features** into a standardized JSON format. It's designed for **B2B wholesale research, design validation, trend analysis, and product catalog classification**.

The skill returns consistent, machine-readable feature classifications with **confidence levels** to indicate extraction reliability. It handles single images, batch processing, and edge cases (small thumbnails, ambiguous details).

---

## Quick Start

**For a single image:**

1. Provide the image (file, URL, or reference from chat)
2. Ask: "Extract garment features from this image"
3. Get back JSON with all 10 fields

**Example:**

```
You: "Analyze this product photo"
[user provides image of blue nighty with floral print]

Skill outputs:
{
  "neck_type": "round",
  "design_pattern": "floral",
  "front_top_treatment": "print",
  "front_bottom_style": "straight",
  "primary_color": "dark blue",
  "secondary_color": "gold and cream",
  "sleeve_length": "half",
  "cloth_texture": "cotton",
  "confidence": "high",
  "notes": null
}
```

---

## Feature Extraction Framework

### Supported Features

The skill extracts **8 core features** + **2 metadata fields**:

| Feature | Type | Allowed Values | Definition |
|---------|------|---|---|
| **neck_type** | enum | round, v-neck, square, boat, other | The neckline shape visible from the front |
| **design_pattern** | enum | floral, geometric, plain, striped, checkered, abstract, other | Primary surface pattern or print on the fabric |
| **front_top_treatment** | enum | embroidery, print, plain, lace, other | Decorative or distinctive element on the upper front panel |
| **front_bottom_style** | enum | umbrella (flared), straight, open-type (front slit), a-line, other | Silhouette shape of the lower portion |
| **primary_color** | text | any color name (e.g. "blue", "pink", "cream", "multicolor") | The dominant/most visible color in the garment |
| **secondary_color** | text | any color name or "none" | Accent, design, or print color; "none" if monochrome/plain |
| **sleeve_length** | enum | half (short), three-quarter (mid), full, sleeveless | Length of sleeves |
| **cloth_texture** | enum | cotton, satin, silk-like, polyester-look, unsure | Best-effort fabric type based on visual appearance |
| **confidence** | enum | high, medium, low | Reliability of the extraction (see below) |
| **notes** | text or null | freeform string, or null | Image quality caveats or ambiguities that affected extraction |

---

## How This Skill Analyzes Images

When you provide an image, the skill **systematically examines** the product using this approach:

### 1. Image Assessment
- **Check clarity:** Is it a clear product shot, thumbnail, or heavily compressed?
- **Identify garment:** Confirm it's ladies' nightwear, not accessories or daywear
- **Determine coverage:** Can the neckline, sleeves, pattern, silhouette be clearly seen?

### 2. Feature Identification
For each feature, the skill:
- **Looks for the visual characteristic** (e.g., examine the neckline area for shape)
- **Matches to the closest allowed value** from the enum
- **Uses "other" if no enum value fits exactly**
- **Records ambiguities in notes** (e.g., "neckline detail unclear due to small thumbnail")

### 3. Color Analysis
- **Primary color:** The dominant solid color (background of the garment)
- **Secondary color:** The next-most-visible color (usually design/print color or embroidery accent)
- **Special case:** If the garment has multiple colors equally mixed, use "multicolor"

### 4. Confidence Assignment
- **high:** Clear, high-resolution image; all details visible and unambiguous
- **medium:** Decent image but some details slightly unclear; educated guess on 1-2 features
- **low:** Small thumbnail, blurry, unusual angle, or garment obscured; multiple features are guesses

### 5. Notes Field
- **When to populate:** Add notes if confidence is medium/low OR if there are image quality issues that affected extraction
- **When to set to null:** Only when the image is clear, extraction is confident, and no caveats apply

---

## Input Formats

Provide images in **any of these ways:**

### Local File
Drag a `.jpg`, `.png`, `.webp`, or other image file into the conversation

### Image URL
Paste an HTTPS image URL (e.g., `https://example.com/product.jpg`)

### In-Conversation Reference
"Analyze the image I just uploaded" or "Look at the nighty in the chat above"

### Batch Processing
Provide multiple images at once: "Extract features from all 5 of these images"

---

## Output Format

### Single Image

Returns **one JSON object** with all 10 fields:

```json
{
  "neck_type": "round",
  "design_pattern": "floral",
  "front_top_treatment": "print",
  "front_bottom_style": "straight",
  "primary_color": "blue",
  "secondary_color": "white",
  "sleeve_length": "half",
  "cloth_texture": "cotton",
  "confidence": "high",
  "notes": null
}
```

### Multiple Images (Batch Mode)

When you ask to extract from multiple images at once, the skill returns a **JSON array** with one object per image, **clearly labeled by filename or position**:

```json
{
  "images": [
    {
      "source": "image_1.jpg",
      "features": {
        "neck_type": "round",
        "design_pattern": "floral",
        ...
        "confidence": "high",
        "notes": null
      }
    },
    {
      "source": "image_2.jpg",
      "features": {
        "neck_type": "v-neck",
        "design_pattern": "plain",
        ...
        "confidence": "medium",
        "notes": "small thumbnail, embroidery detail unclear"
      }
    }
  ]
}
```

Or as **individual JSON objects** (one per line) if preferred for processing.

---

## Examples

### Example 1: High-Confidence Extraction

**Image:** High-resolution Amazon product photo of a navy blue cotton nighty with floral print, round neckline, short sleeves, straight silhouette

```json
{
  "neck_type": "round",
  "design_pattern": "floral",
  "front_top_treatment": "print",
  "front_bottom_style": "straight",
  "primary_color": "navy blue",
  "secondary_color": "gold and cream",
  "sleeve_length": "half",
  "cloth_texture": "cotton",
  "confidence": "high",
  "notes": null
}
```

### Example 2: Medium-Confidence with Notes

**Image:** Compressed thumbnail (320px) of a pink nighty; some print detail is lost

```json
{
  "neck_type": "round",
  "design_pattern": "floral",
  "front_top_treatment": "print",
  "front_bottom_style": "straight",
  "primary_color": "pink",
  "secondary_color": "white",
  "sleeve_length": "half",
  "cloth_texture": "cotton",
  "confidence": "medium",
  "notes": "small thumbnail; floral pattern is blurry, may have geometric elements too"
}
```

### Example 3: Low-Confidence with Ambiguities

**Image:** Heavily compressed 200px thumbnail; details are hard to discern

```json
{
  "neck_type": "round",
  "design_pattern": "other",
  "front_top_treatment": "print",
  "front_bottom_style": "other",
  "primary_color": "multicolor",
  "secondary_color": "unknown",
  "sleeve_length": "half",
  "cloth_texture": "unsure",
  "confidence": "low",
  "notes": "very small, heavily compressed image; pattern and silhouette are ambiguous; treating as multicolor due to unclear color distribution"
}
```

---

## When to Use This Skill

✅ **Use this skill for:**
- Analyzing a single product image for design attributes
- Batch-processing product catalogs (10s to 100s of images)
- Extracting design trends from e-commerce photos
- Building feature databases for B2B wholesale validation
- Classifying garments by style (for inventory or research)
- Validating product descriptions against actual images
- Trend analysis: "What design patterns are trending?"

❌ **Do NOT use this skill for:**
- Non-nightwear garments (use general clothing classifier instead)
- Images that don't show garments (packaging, flat lays, models' faces)
- Detailed fabric quality assessment (durability, thread count, etc.) — this skill only guesses texture
- Size estimation or fit analysis
- Price predictions or market research beyond visual features
- Brand identification or copyright analysis
- Real-time inventory counting or barcode reading

---

## Edge Cases & Limitations

### Small Thumbnails (320px or smaller)
- **Behavior:** The skill will extract what it can, set confidence to "low" or "medium", and note the limitation
- **Recommendation:** Use higher-resolution images if possible, but small thumbnails can still be processed

### Blurry or Compressed Images
- **Behavior:** Color may be distorted, patterns blurred; the skill will choose the closest match
- **Recommendation:** Note the ambiguity in the confidence/notes fields

### Non-Nightwear Images (e.g., day dresses, t-shirts, accessories)
- **Behavior:** The skill is optimized for nightwear; results for other garments may be less accurate
- **Recommendation:** For clothing outside the nightwear category, use a general clothing classification tool

### Unusual Angles or Partially Hidden Garment
- **Behavior:** The skill will extract what's visible and mark confidence as "low" if key areas (neckline, silhouette) are obscured
- **Recommendation:** Front-view, full-body product shots produce the best results

### Monochrome or Plain Garments
- **Behavior:** `primary_color` captures the main color, `secondary_color` is set to "none"
- **Recommendation:** This is expected behavior; no action needed

---

## Batch Processing Tips

### For Large Runs (50+ images):
1. **Group by source** — Process images from the same source together (e.g., all Amazon images first)
2. **Check progress** — After 10-20 images, review the output format and confidence levels to spot patterns
3. **Adjust expectations** — If many images return low confidence, the source may have low-quality images
4. **Reuse results** — Save intermediate JSON files in case the process is interrupted

### Output Management:
- Save results to a **features/** directory with the same structure as your evidence files
- Name files the same as evidence: `features/amazon/ladies-cotton-nighty.json`
- Use timestamps or versioning if re-processing: `features/v2/amazon/...`

---

## Integration with Evidence Files

If you're using this skill with scraped product data:

1. **Evidence files** contain product info + image URLs
2. **Feature extraction** analyzes each image URL and adds a `features` field to each product record
3. **Output** is enriched JSON that combines both evidence and extracted features

Example enriched product:
```json
{
  "source": "amazon",
  "keyword": "ladies cotton nighty",
  "title": "Bahumaan Pure Cotton Nighty...",
  "url": "https://www.amazon.in/...",
  "image": "https://m.media-amazon.com/images/I/61nKeRpCaiL._AC_UL320_.jpg",
  "features": {
    "neck_type": "round",
    "design_pattern": "floral",
    ...
  }
}
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Confidence: low" on many images | Images may be too small/blurry; try higher-resolution versions |
| Features all marked "other" | Image may not show the garment clearly; check it's a front view |
| Secondary color is "unknown" | Image may be monochrome or color is too compressed; try "none" if truly plain |
| Extraction seems wrong for your images | Review the notes field; the image may have ambiguities the skill flagged |
| Need to re-process with different criteria | Save original evidence separately; feature extraction can be re-run independently |

---

## Implementation Notes

- This skill uses **Claude's native vision capabilities** — no external APIs or libraries required
- Optimized for **Indian ladies' nightwear** (B2B wholesale context) but works with any nightwear category
- **No image storage** — images are analyzed in-session and not persisted
- **Confidence is subjective** — based on image clarity and feature visibility, not on statistical certainty
