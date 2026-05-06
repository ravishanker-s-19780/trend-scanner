# Garment Features - Reference Guide

This document provides detailed reference information for the garment-features skill, including comprehensive feature definitions, analysis methodology, and troubleshooting.

## Table of Contents

1. [Feature Taxonomy](#feature-taxonomy)
2. [Analysis Methodology](#analysis-methodology)
3. [Confidence Scoring](#confidence-scoring)
4. [Color Interpretation](#color-interpretation)
5. [Common Patterns by Region](#common-patterns-by-region)
6. [Troubleshooting](#troubleshooting)
7. [Production Integration](#production-integration)

---

## Feature Taxonomy

### Neck Type (enum)

The neckline shape visible from the front of the garment.

| Value | Description | Visual Cues |
|-------|-------------|-------------|
| **round** | Crew neck, circular opening | Even curve around neck, no deep plunge |
| **v-neck** | V-shaped plunge | Clear V-shaped opening, pointed downward |
| **square** | Straight horizontal neckline | Rectangular opening, sharp corners |
| **boat** | Wide horizontal neckline | Extends across shoulders, sits at collarbone |
| **other** | Irregular or unique neckline | Asymmetrical, halter, high-neck, ornate designs |

**Note:** Focus on the visible neckline shape, not neck width or depth. If unsure between round and square, choose the one that's more dominant visually.

---

### Design Pattern (enum)

The primary surface pattern or print on the fabric.

| Value | Characteristics | Examples |
|-------|---|---|
| **floral** | Recognizable flower/leaf shapes | Roses, marigolds, jasmine, leaves, vines |
| **geometric** | Regular mathematical shapes | Diamonds, stripes, dots, hexagons, grids, checks |
| **plain** | No visible pattern or print | Solid color, monochrome, smooth texture |
| **striped** | Linear repeated pattern | Horizontal, vertical, diagonal lines |
| **checkered** | Alternating pattern in grid | Gingham, checks, crosshatch |
| **abstract** | Non-representational artistic design | Modern art, splashes, irregular shapes |
| **other** | Doesn't fit above categories | Mixed patterns, ombré, gradient, tie-dye effects |

**Decision Logic:**
- If pattern contains recognizable flowers → **floral**
- If pattern is purely geometric shapes → **geometric**
- If pattern is repetitive linear → **striped**
- If pattern is alternating colors in grid → **checkered**
- If no discernible pattern → **plain**
- If doesn't fit clearly → **other** (note the specific pattern in notes field)

---

### Front Top Treatment (enum)

Decorative or distinctive element applied to the upper front panel.

| Value | Definition | Application Method |
|-------|-----------|-------------------|
| **embroidery** | Decorative stitched design | Thread-based, hand or machine stitched |
| **print** | Design applied via printing | Screen print, digital print, block print |
| **plain** | No additional treatment | Base fabric only |
| **lace** | Openwork fabric insert | Lace panel, trim, or overlay |
| **other** | Other decorative treatment | Sequins, beads, appliqué, patches |

**How to Identify:**
- **Embroidery:** Raised, textured appearance; visible stitching; shiny thread
- **Print:** Flat appearance; part of fabric surface; no raised texture
- **Plain:** Smooth fabric; uniform color; no added elements
- **Lace:** Openwork pattern; see-through areas; delicate holes
- **Other:** Any other visible decoration

**Note:** If garment has BOTH print and embroidery, choose the MORE PROMINENT one. If equal, note both in the notes field.

---

### Front Bottom Style (enum)

The silhouette shape of the lower portion of the garment.

| Value | Shape | Silhouette |
|-------|-------|-----------|
| **umbrella** | Flared/circular | Bottom wider than waist; A-line shape; flowy |
| **straight** | Vertical parallel sides | Waist to hem roughly same width; no flare |
| **open-type** | Front slit or opening | Front panel split or open from waist down |
| **a-line** | Gradual flare from waist | Subtle widening from waist to hem |
| **other** | Irregular silhouette | Asymmetrical, gathered at ankles, empire waist |

**Visual Assessment:**
- Observe the garment from waist down
- Compare width at waist vs width at hem
- Check for intentional openings or slits

---

### Sleeve Length (enum)

The length of the sleeves measured from shoulder seam to cuff.

| Value | Length | Reaches To |
|-------|--------|-----------|
| **half** | Short sleeves | Upper arm (above elbow) |
| **three-quarter** | Midi sleeves | Mid-forearm area (between elbow and wrist) |
| **full** | Long sleeves | Wrist or slightly past |
| **sleeveless** | No sleeves | Shoulder/armpit area only |

**Measurement Reference:**
- **Sleeveless:** No sleeve at all
- **Half (short):** ~0-2 inches below shoulder
- **Three-quarter:** ~4-6 inches below elbow  
- **Full:** Reaches wrist or beyond

---

### Cloth Texture (enum)

Best-effort visual guess at fabric type based on appearance.

| Value | Appearance | Drape | Touch |
|-------|-----------|-------|-------|
| **cotton** | Matte finish; natural look | Soft drape; breathable | Crisp, breathable |
| **satin** | Glossy, shiny finish | Smooth, slippery | Slick, lustrous |
| **silk-like** | Semi-gloss; luxurious appearance | Flowing, elegant | Soft, smooth |
| **polyester-look** | Synthetic sheen; uniform | Can be stiff or flowy | Plastic-like feel |
| **unsure** | Cannot determine from image | Ambiguous | Indeterminate |

**Visual Cues:**
- **Cotton:** Matte surface, visible weave texture, natural colors
- **Satin:** High shine, reflective, often solid colors
- **Silk-like:** Semi-glossy, flows well, luxurious appearance
- **Polyester:** Synthetic appearance, can look plastic-y or slippery
- **Unsure:** When image quality is too low or mixed materials visible

---

## Analysis Methodology

### Step-by-Step Feature Extraction

#### 1. Image Quality Assessment

Before extracting features, evaluate:

- **Resolution:** Is image 320px+ (acceptable) or smaller (thumbnail)?
- **Clarity:** Are details sharp or blurry/pixelated?
- **Angle:** Is it front-facing (good) or at an angle (less ideal)?
- **Obstruction:** Is the garment fully visible or partially hidden?
- **Lighting:** Is lighting even or shadows obscuring details?

**Impact on Confidence:**
- Clear, high-res, front-facing, well-lit, fully visible → **confidence: high**
- Some ambiguity but mostly visible → **confidence: medium**
- Very small, blurry, partial view, or poor lighting → **confidence: low**

#### 2. Systematic Feature Examination

Proceed in this order:

**Neckline Area:**
- Look at the top front of the garment
- Identify the shape of the neck opening
- Note any embellishments or treatment

**Pattern & Design:**
- Step back and view the overall fabric pattern
- Identify primary pattern type (floral, geometric, plain, etc.)
- Note secondary pattern if present

**Front Panel Decoration:**
- Examine the upper front closely
- Identify if print, embroidery, lace, or plain
- Note if multiple treatments present

**Silhouette:**
- View the full garment from waist down
- Compare width at waist vs hem
- Check for intentional openings or slits

**Sleeves:**
- Measure approximate sleeve length
- Classify as sleeveless, half, three-quarter, or full

**Color:**
- Primary color: the dominant base color
- Secondary color: accent/print color or "none"

**Texture:**
- Assess fabric appearance
- Make best-effort guess on type
- Set as "unsure" if genuinely ambiguous

#### 3. Confidence Assignment

Combine image quality + feature clarity:

- **high:** Clear image, all features unambiguous, high resolution, good lighting
- **medium:** Decent image but some features slightly unclear or ambiguous; one or two fields are educated guesses
- **low:** Small thumbnail, blurry, poor lighting, partial view, or multiple features are uncertain

#### 4. Notes Field Population

Include notes when:
- Confidence is **medium or low** — explain why
- Image quality issues affected extraction — note them
- Feature is ambiguous or borderline between two values — explain the choice
- Multiple features are present (e.g., both print AND embroidery) — note which was chosen as primary
- Non-nightwear garment — flag it

Leave **null** only when:
- Image is clear
- All features are obvious/unambiguous
- No caveats apply

---

## Confidence Scoring

### Confidence: HIGH

**When to assign:**
- Image resolution: 500px+
- All features clearly visible and unambiguous
- Good lighting, front-facing angle, fully visible garment
- No secondary pattern or feature competing for primary classification

**Example:**
```
Image: High-res Amazon product photo
- Clear round neckline ✓
- Distinct floral print throughout ✓
- Printed design on front panel ✓
- Straight silhouette obvious ✓
- Sleeves clearly short ✓
- Colors well-defined ✓
→ confidence: "high"
```

---

### Confidence: MEDIUM

**When to assign:**
- Image resolution: 320-500px
- Most features visible but some details ambiguous
- Lighting or angle slightly compromises clarity
- 1-2 features require educated guessing
- Pattern is mixed (could be geometric + floral)

**Example:**
```
Image: Amazon thumbnail (320px), slightly compressed
- Neckline appears round (pretty clear) ✓
- Pattern appears to be geometric dots (pretty sure) ~
- Color looks blue but could be teal (ambiguous) ~
- Sleeves are short (clear) ✓
- Silhouette straight (looks like it) ~
- Fabric appears cotton (standard for this product line) ~
→ confidence: "medium"
→ notes: "Thumbnail compression makes some color/pattern details slightly unclear"
```

---

### Confidence: LOW

**When to assign:**
- Image resolution: <320px or heavily compressed
- Key features (neckline, silhouette) ambiguous or partially hidden
- Poor lighting, at an angle, or garment partially obscured
- Multiple features require guessing
- Cannot confidently choose between 2+ enum values

**Example:**
```
Image: Very small (200px) compressed thumbnail
- Neckline shape ambiguous (could be round or square) ?
- Pattern blurry - could be geometric, abstract, or floral ?
- Can't see if plain or print clearly ?
- Sleeve length unclear due to angle ?
→ confidence: "low"
→ notes: "Very small thumbnail makes most details ambiguous; pattern and neckline shape are uncertain"
```

---

## Color Interpretation

Colors in product photos vary due to:
- Camera white balance
- Lighting conditions
- Monitor/screen differences
- Compression artifacts

### Color Naming Convention

**Primary Colors (use these preferred names):**
- Black, white, gray, grey
- Red, pink, maroon, burgundy
- Orange, gold, yellow, cream
- Green, teal, cyan
- Blue, navy, indigo
- Purple, violet, magenta
- Brown, tan, beige, chocolate

**Special Cases:**
- **Multicolor:** Use when 3+ colors are equally prominent
- **"none":** Only for secondary_color when garment is truly monochrome
- **Compound colors:** "blue and white", "gold and cream" (when both visible)
- **Uncertain colors:** "teal_or_blue", "burgundy_or_maroon" (in notes, not in color field)

### Common Color Variations

**Lighting Effects:**
- Same fabric can appear different under warm vs cool lighting
- Shadows can darken colors
- Reflections can brighten colors

**Acceptable Variations:**
- "blue" vs "light_blue" — both reasonable
- "beige" vs "tan" — both reasonable
- "maroon" vs "burgundy" — both reasonable

**Standardization Tips:**
For bulk processing, consider creating a color lookup table if exact matching is required.

---

## Common Patterns by Region

### Indian Ladies' Nightwear (Primary Focus)

#### North India (Rajasthani, Jaipur)
- **Patterns:** Geometric, traditional motifs, floral embroidery
- **Treatment:** Embroidery on front panel, mirror work, gold thread
- **Colors:** Maroon, gold, cream, navy with metallic accents
- **Sleeves:** Half or three-quarter common
- **Silhouette:** Straight, traditional A-line

#### South India (Karnataka, Tamil Nadu)
- **Patterns:** Floral prints, simple geometric
- **Treatment:** Print or plain
- **Colors:** Bright colors (pink, blue), pastels
- **Sleeves:** Half to full
- **Silhouette:** Straight, flowing

#### East India
- **Patterns:** Floral, checks, stripes
- **Treatment:** Print or plain
- **Colors:** Varied; pastels and bright colors both common
- **Sleeves:** Variable
- **Silhouette:** Varies

---

## Troubleshooting

### Issue: Confidence marked as "low" but product is important

**Solution:** 
1. Try to find a higher-resolution image of the product
2. If unavailable, accept the low confidence and use the extraction as provisional
3. Have domain expert verify the classification manually

### Issue: Pattern is ambiguous (could be floral OR geometric)

**Solution:**
1. Examine closely: does it contain recognizable flower/leaf shapes (floral) or just geometric forms (geometric)?
2. If truly mixed, choose the MORE PROMINENT one
3. In notes, document: "Pattern contains both floral and geometric elements; classified as [chosen] as primary"

### Issue: Front top treatment unclear (print vs embroidery)

**Solution:**
1. Look for texture: embroidery has raised stitching; print is flat
2. On small thumbnails, default to "print" as more common for nighty products
3. If unclear, note in notes field

### Issue: Color differences between runs on same product

**Solution:**
1. This is normal due to lighting/camera variations
2. For consistent results, use color lookup table or manual review
3. Or, accept slight variations as normal uncertainty in color perception

### Issue: Sleeve length borderline between half and three-quarter

**Solution:**
1. Measure: half = upper arm; three-quarter = between elbow and wrist
2. If exactly at elbow, choose three-quarter as more conservative
3. Note the ambiguity in notes field if questionable

---

## Production Integration

### Batch Processing Recommendations

**Setup:**
```
For 100+ products:
1. Process in groups of 10-20
2. Monitor confidence levels in batch
3. If >50% are "low" confidence, image quality may be too poor
4. Consider alternative image sources if available
```

**Quality Control:**
```
After extraction:
1. Sample check: manually review 10% of results
2. Look for patterns in misclassifications
3. Adjust confidence threshold if needed
4. Validate confidence field matches image quality
```

**Output Structure:**
```
evidence/
  amazon/
    product-1.json (original scraped data)
    
features/
  amazon/
    product-1.json (enriched with features field)
```

### API Integration (Claude)

When using with Claude API:
```python
from anthropic import Anthropic

client = Anthropic()

# For each product image URL:
image_url = "https://m.media-amazon.com/images/I/..."

message = client.messages.create(
    model="claude-opus-4-7",
    max_tokens=1024,
    system="[garment-features SKILL.md content]",
    messages=[{
        "role": "user",
        "content": [
            {
                "type": "image",
                "source": {
                    "type": "url",
                    "url": image_url
                }
            },
            {
                "type": "text",
                "text": "Extract garment features from this image"
            }
        ]
    }]
)

# Parse response JSON
features = parse_json(message.content[0].text)
```

---

## Related Resources

- **Main Skill:** See SKILL.md for usage instructions
- **Evaluations:** See evals/ directory for test cases and results
- **License:** See LICENSE.txt
