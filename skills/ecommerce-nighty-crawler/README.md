# E-Commerce Nighty Crawler Skill

A comprehensive Playwright-based web scraper for extracting detailed product data, reviews, and purchaser insights from 10 major Indian e-commerce platforms specializing in women's nighty and tops.

## Quick Start

### Installation

1. **Via Claude Code**: Download [`ecommerce-nighty-crawler.skill`](ecommerce-nighty-crawler.skill) and double-click to install.
2. **Via Local Folder**: In Claude Code, select "Create from local folder" and point to this directory.

### Basic Usage

```javascript
const { crawlEcommercePlatforms } = require('./scripts/crawler.js');

// Crawl Amazon and Myntra for cotton nighties
const results = await crawlEcommercePlatforms({
  platforms: ['amazon', 'myntra'],
  keywords: ['women cotton nighty'],
  maxProducts: 20,
  includeImages: true
});

console.log(`Collected ${results.products.length} products`);
```

### CLI Usage

```bash
node scripts/crawler.js --platforms=amazon,myntra --keywords="cotton nighty" --max=10
```

### Incremental Storage (Recommended)

Use the `IncrementalStorageManager` for append-based storage with automatic deduplication:

```javascript
import IncrementalStorageManager from './scripts/incremental-storage.js';

const storage = new IncrementalStorageManager();

// During crawl, save each product
const result = storage.saveProduct('amazon', 'women cotton nighty', {
  url: 'https://amazon.in/dp/B123',
  title: 'Cotton Floral Nighty',
  price: 399,
  review_count: 150,
  average_rating: 4.2
});

console.log(result.isNew ? '✨ New product' : '📝 Updated');

// After crawl, save summary
storage.saveCrawlSummary('amazon', 'women cotton nighty', {
  products_fetched: 50,
  new_products: 12,
  updated_products: 5,
  skipped_duplicates: 33
});

// Query results
const newProducts = storage.getNewProducts('amazon', 'women cotton nighty');
const priceChanges = storage.getPriceChanges('amazon', 'women cotton nighty');
const trending = storage.getTrendingProducts('amazon', 'women cotton nighty');
```

**Key Advantages**:
- ✅ Append-only JSONL format (never overwrites data)
- ✅ Automatic deduplication by URL
- ✅ Tracks new vs updated products
- ✅ Preserves historical data for trend analysis
- ✅ Detects price & review changes
- ✅ Export as JSON or CSV

## Features

### Data Extraction

✅ **Product Information**
- Title, URL, Platform
- Cloth type (Cotton, Silk, Linen, etc.)
- Design name (Floral, Solid, Striped, etc.)
- Price

✅ **Reviews & Ratings**
- Review count
- Average rating
- Individual review text (with sentiment inference)
- Review date/timestamp
- Helpful count

✅ **Purchase Metrics**
- Maximum monthly purchases
- Recent purchase activity (last 30 days)
- Total units sold

✅ **Purchaser Demographics**
- Geographic location (state/city level)
- Age range estimation (18-25, 26-35, etc.)
- Repeat purchase rate
- Purchase frequency

✅ **Purchase Context**
- Primary purpose (casual, wedding, gift, medical)
- Wedding-season relevance
- Occasion tags (honeymoon, engagement, bridal-shower, etc.)

✅ **Media Assets**
- Product images (downloaded, base64 encoded)
- Product videos (with thumbnails)
- Image metadata (alt text, source)

### Supported Platforms

1. **Amazon.in** - Largest marketplace
2. **Myntra** - Fashion-focused
3. **Flipkart** - High-volume retailer
4. **Ajio** - Reliance's platform
5. **Meesho** - Budget segment
6. **Nykaa Fashion** - Premium tier
7. **Clovia** - Sleepwear specialist
8. **Zivame** - Lingerie specialist
9. **Tata CLiQ** - Premium marketplace
10. **Shyaway** - Intimatewear specialist

## Configuration

See [CONFIG.md](CONFIG.md) for detailed platform-specific settings, rate limits, and extraction rules.

### Storage

Crawled data is automatically saved to the `evidence/` directory:

```
evidence/
├── amazon/
│   └── women-cotton-nighty.json        # Array of products
├── myntra/
│   └── ladies-sleep-wear.json
├── _summary.json                       # Metadata from all runs
```

**Default storage**: `./evidence/` (configurable via `outputDir` option)

**Each file contains**:
- Timestamp of crawl
- Array of products (cloth type, design, reviews, demographics, images, etc.)
- Metadata (total count, data quality)

### Crawl Quantity

**Default per platform**: 50 products per keyword

Options to adjust:
```javascript
{
  maxProducts: 20,        // Reduce for faster crawls
  // Total = platforms × keywords × maxProducts
  // Example: 2 platforms × 2 keywords × 20 = 80 products
}
```

### Data Updates

Each run **appends** to existing data using incremental storage:
- **Incremental**: New products are appended; existing ones are updated only if price/rating changed
- **Deduplication**: Global across all runs via `_dedup_index.json`
- **Price tracking**: Historical price changes are preserved
- **No data loss**: Previous crawl records are never deleted

See [CONFIG.md](CONFIG.md) for full incremental storage details and JSONL querying examples.

```javascript
{
  platforms: ['amazon', 'myntra'],      // Which platforms to crawl
  keywords: ['cotton nighty'],           // Search keywords
  maxProducts: 50,                       // Max per platform
  includeImages: true,                   // Download + base64 encode
  includeVideos: true,                   // Download videos
  includeReviews: true,                  // Extract review data
  requireAuthentication: false,          // Use saved sessions
  headful: false                         // Show browser window
}
```

## Output Format

```json
{
  "success": true,
  "products": [
    {
      "product_id": "amazon-abc123def456",
      "platform": "amazon.in",
      "product_title": "Women's 100% Cotton Floral Print Nighty",
      "product_url": "https://amazon.in/...",
      "cloth_type": "Cotton",
      "design_name": "Floral Print",
      "reviews": {
        "count": 245,
        "average_rating": 4.2,
        "details": [
          {
            "reviewer_name": "User123",
            "rating": 5,
            "review_text": "Great quality, comfortable fit...",
            "review_date": "2026-04-15T10:30:00Z",
            "helpful_count": 32
          }
        ]
      },
      "purchase_metrics": {
        "max_purchased": 450,
        "recent_purchase_count": 32,
        "total_sold": 2150
      },
      "purchaser_profile": {
        "primary_location": "Delhi, Mumbai",
        "age_range": "26-35",
        "repeat_purchase_rate": 0.32
      },
      "purchase_context": {
        "primary_purpose": "casual",
        "wedding_relevant": true,
        "occasion_tags": ["wedding-gift"]
      },
      "media": {
        "images": [
          {
            "url": "https://...",
            "base64": "iVBORw0KGgoAAAANS...",
            "alt_text": "Product image"
          }
        ],
        "videos": [
          {
            "url": "https://...",
            "duration": 45,
            "thumbnail_base64": "iVBORw0KGgoAAAANS..."
          }
        ]
      },
      "timestamp": "2026-05-07T14:30:00Z"
    }
  ],
  "metadata": {
    "crawl_date": "2026-05-07",
    "total_products": 150,
    "total_duration_ms": 125000,
    "platforms_crawled": ["amazon", "myntra"],
    "keywords_used": 1,
    "data_quality": "high"
  },
  "errors": null
}
```

## How to Use This Skill (Claude Prompts)

Once installed in Claude Code, use natural language. Claude activates the skill automatically — no skill name needed.

### Basic Crawls
```
Crawl Amazon and Myntra for women nighty products
```
```
Extract nighty product data from all 10 platforms
```
```
Crawl Meesho and Flipkart for cotton nighty, max 20 products each
```

### With Specific Fields
```
Crawl Amazon for women nighty and get cloth type, design name, review content with dates, and purchaser location
```
```
Extract nighty products from Myntra with base64 images and videos
```
```
Get purchaser age range and purchase purpose (especially wedding) from Nykaa Fashion nighties
```

### Wedding / Occasion Focus
```
Find wedding-relevant nighty products from premium platforms — Nykaa, Tata CLiQ, Shyaway
```
```
Crawl all platforms for bridal nighty and extract purchaser demographics and occasion tags
```

### Review Analysis
```
Crawl Amazon nighty products and extract full review text, reviewer name, date, and helpful count
```
```
Get top 50 Meesho nighties with recent purchase count and purchaser location
```

### Incremental / Repeat Runs
```
Re-crawl Amazon nighty — show me what's new since last run and any price changes
```
```
Update the evidence database for all platforms, skip products already crawled
```

---

## Code Examples

### Crawl Multiple Platforms
```javascript
const results = await crawlEcommercePlatforms({
  platforms: ['amazon', 'myntra', 'meesho'],
  keywords: ['ladies cotton nighty', 'sleep wear women'],
  maxProducts: 30
});
```

### Wedding-Focused Search
```javascript
const results = await crawlEcommercePlatforms({
  platforms: ['nykaa', 'tatacliq', 'shyaway'],  // Premium platforms
  keywords: ['wedding nighty', 'bridal nightwear'],
  maxProducts: 50,
  includeImages: true,
  includeVideos: true
});

// Filter for wedding-relevant products
const weddingProducts = results.products.filter(p => p.purchase_context.wedding_relevant);
```

### Budget-Friendly Segment
```javascript
const results = await crawlEcommercePlatforms({
  platforms: ['meesho', 'flipkart'],
  keywords: ['cheap nighty', 'affordable nightwear'],
  maxProducts: 100
});

// Group by price
const byPrice = results.products.reduce((acc, p) => {
  const range = p.price < 300 ? 'under-300' : p.price < 600 ? '300-600' : 'over-600';
  acc[range] = (acc[range] || 0) + 1;
  return acc;
}, {});
```

### High-Volume Analysis
```javascript
const results = await crawlEcommercePlatforms({
  platforms: ['all'],                              // All 10 platforms
  keywords: ['women nighty', 'ladies tops', 'cotton nightgown'],
  maxProducts: 50,
  includeImages: true
});

// Analyze trends
const byClothType = results.products.reduce((acc, p) => {
  acc[p.cloth_type] = (acc[p.cloth_type] || 0) + 1;
  return acc;
}, {});

console.log('Top cloth types:', byClothType);
```

## Performance

- **Single platform crawl**: 3-5 minutes
- **All 10 platforms**: 30-50 minutes
- **With image download**: +20% time
- **With video download**: +30% time

**Optimization tips:**
1. Reduce `maxProducts` for faster crawls
2. Skip `includeImages`/`includeVideos` if not needed
3. Use specific keywords instead of broad searches
4. Crawl off-peak hours to avoid rate limiting

## Troubleshooting

### CAPTCHA Blocking
```bash
# Run with headful mode and manually solve CAPTCHA
node scripts/crawler.js --headful --platforms=amazon

# Sessions are saved in user-data/<platform>/
# Subsequent runs skip CAPTCHA if session is valid
```

### Missing Products
- Update CSS selectors in [CONFIG.md](CONFIG.md)
- Check if platform HTML structure has changed
- Use `--headful` to inspect element live

### Rate Limiting (429 errors)
- Built-in exponential backoff handles retries
- Default: 30 requests/minute, per-platform delays
- Adjust in `CONFIG.md` if needed

### Image Encoding Issues
- Ensure Sharp or similar image library is installed
- Check image URLs are accessible
- Fall back to storing URLs instead of base64

## Dependencies

```json
{
  "playwright": "^1.47.0",
  "cheerio": "^1.0.0",
  "sharp": "^0.33.0"
}
```

Install with:
```bash
npm install
```

## Related Skills

- [**garment-features**](../garment-features/) - Extract design attributes from individual product images
- [**trend-catalog**](../trend-catalog/) - Aggregate crawler findings into trend reports

## Development

### Adding a New Platform

1. Add platform config to `PLATFORMS` object in [crawler.js](scripts/crawler.js)
2. Create a `scrape<PlatformName>()` function
3. Update `crawlEcommercePlatforms()` to include it
4. Test with `--headful` mode
5. Add to [CONFIG.md](CONFIG.md)

### Testing a Single Platform

```bash
node scripts/crawler.js --platform=amazon --keyword="cotton nighty" --max=5 --headful
```

## Legal & Ethics

⚠️ **Important**: Ensure compliance with each platform's Terms of Service:
- Respect `robots.txt` directives
- Follow rate limiting guidelines
- Do not overload servers
- Respect intellectual property (images, reviews)
- Consider adding proper User-Agent headers
- Cache results to avoid redundant requests

## License

This skill is part of the Trend Scanner project and follows the same license terms.

## Support

For bugs, feature requests, or questions:
1. Check [CONFIG.md](CONFIG.md) for configuration help
2. Run with `--headful` to debug selectors
3. Check browser console for JavaScript errors
4. Open an issue with platform name and error details

---

**Last Updated**: May 2026
