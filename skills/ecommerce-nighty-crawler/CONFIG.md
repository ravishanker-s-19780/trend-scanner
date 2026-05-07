# Configuration for E-Commerce Nighty Crawler

## Incremental Storage Strategy (Recommended Approach)

This crawler uses **append-only JSONL storage** with automatic deduplication instead of file overwrite.

### Why Incremental Storage?

| Aspect | File Overwrite ❌ | Incremental Append ✅ |
|--------|---|---|
| Historical data | Lost on each run | Preserved forever |
| Price tracking | No | Yes (detect changes) |
| New products | Can't identify | Clearly flagged |
| Review growth | No | Full trend history |
| Duplicate detection | Per-run only | Global across runs |
| Storage efficiency | Minimal | Slight overhead |

### File Structure

```
evidence/
├── amazon/
│   ├── women-nighty.jsonl           ← Product records (one per line)
│   ├── women-nighty.meta.json       ← Metadata, crawl history
│   ├── cotton-nightgown.jsonl
│   ├── cotton-nightgown.meta.json
│   └── ...
├── myntra/
│   ├── ladies-sleep-wear.jsonl
│   ├── ladies-sleep-wear.meta.json
│   └── ...
├── _dedup_index.json                ← Global product URL index
├── _crawl_log.json                  ← Timeline of all crawls
└── _summary.json                    ← Aggregated statistics
```

### JSONL Format (Newline-Delimited JSON)

Each line is a complete JSON object:

```jsonl
{"product_id":"amazon-abc123","url":"https://amazon.in/dp/B123","title":"Cotton Nighty","price":399,"is_new_in_this_run":true,"price_changed":false,"times_seen":1,"crawl_sequence":5,"first_seen":"2026-05-01T10:30:00Z","last_updated":"2026-05-08T10:30:00Z"}
{"product_id":"amazon-def456","url":"https://amazon.in/dp/B456","title":"Silk Nightgown","price":599,"is_new_in_this_run":false,"price_changed":true,"previous_price":649,"current_price":599,"times_seen":3,"crawl_sequence":5,"first_seen":"2026-04-25T14:20:00Z","last_updated":"2026-05-08T10:30:00Z"}
```

**Advantages of JSONL**:
- Streaming-friendly (process line by line)
- Append without rebuilding entire file
- Compatible with tools like `jq`, `grep`
- Easy to parse in any language

### Metadata File Structure

```json
{
  "platform": "amazon",
  "keyword": "women cotton nighty",
  "created_at": "2026-05-01T10:30:00Z",
  "crawl_history": [
    "2026-05-01T10:30:00Z",
    "2026-05-02T10:30:00Z",
    "2026-05-08T10:30:00Z"
  ],
  "total_unique_products": 145,
  "new_in_last_crawl": ["amazon-xyz789"],
  "updated_in_last_crawl": ["amazon-abc123", "amazon-def456"],
  "last_updated": "2026-05-08T10:30:00Z"
}
```

### Deduplication Index

```json
{
  "amazon-abc123": "amazon/women-nighty",
  "amazon-def456": "amazon/women-nighty",
  "myntra-ghi789": "myntra/ladies-sleep-wear",
  ...
}
```

**Key**: Product ID (hash of URL)  
**Value**: Path where product is stored

### Crawl Log

```json
[
  {
    "crawl_id": "crawl-2026-05-01T10-30-00Z-abc123",
    "platform": "amazon",
    "keyword": "women cotton nighty",
    "timestamp": "2026-05-01T10:30:00Z",
    "products_fetched": 50,
    "new_products": 35,
    "updated_products": 10,
    "skipped_duplicates": 5
  },
  {
    "crawl_id": "crawl-2026-05-02T10-30-00Z-def456",
    "platform": "amazon",
    "keyword": "women cotton nighty",
    "timestamp": "2026-05-02T10:30:00Z",
    "products_fetched": 50,
    "new_products": 8,
    "updated_products": 15,
    "skipped_duplicates": 27
  }
]
```

### Deduplication Logic

1. **Product ID Generation**: Hash of normalized URL
2. **Normalization**: Remove tracking parameters, standardize domain
3. **Index Lookup**: Check if URL exists in global index
4. **If New**: Flag as `is_new_in_this_run: true`, append to JSONL
5. **If Exists**: Compare fields, append only if changed
6. **Dedup Index**: Updated with all discovered products

### Change Detection

**Fields Monitored for Changes**:
- `price` → Sets `price_changed: true`, stores `previous_price`
- `review_count` → Sets `review_count_changed: true`, stores `previous_review_count`
- `average_rating` → Triggers update if different
- `title` → Minor field, triggers update

**Example Product with Changes**:
```json
{
  "product_id": "amazon-def456",
  "url": "https://amazon.in/dp/B456",
  "title": "Silk Nightgown",
  "is_new_in_this_run": false,
  "times_seen": 3,
  "price_changed": true,
  "previous_price": 649,
  "current_price": 599,
  "review_count_changed": true,
  "previous_review_count": 120,
  "current_review_count": 145,
  "first_seen": "2026-04-25T14:20:00Z",
  "last_updated": "2026-05-08T10:30:00Z",
  "crawl_sequence": 5
}
```

### Querying Examples

**Get all products**:
```bash
cat evidence/amazon/women-nighty.jsonl | jq '.'
```

**Get only new products**:
```bash
cat evidence/amazon/women-nighty.jsonl | jq 'select(.is_new_in_this_run==true)'
```

**Get price drops**:
```bash
cat evidence/amazon/women-nighty.jsonl | jq 'select(.price_changed==true and .current_price < .previous_price)'
```

**Get trending products** (seen 3+ times with growing reviews):
```bash
cat evidence/amazon/women-nighty.jsonl | jq 'select(.times_seen >= 3 and .review_count_changed==true and .current_review_count > .previous_review_count * 1.1)'
```

## Platform Configurations

Each platform has:
- Base URL for product search
- Search query parameter name
- CSS selectors for product elements
- Rate limiting rules

## Supported Platforms

### 1. Amazon.in
- **Base URL**: https://www.amazon.in
- **Search Path**: /s?k=
- **Rate Limit**: 1-2 requests per second
- **Authentication**: Optional (improves review access)
- **Special Notes**: 
  - Requires User-Agent header
  - CAPTCHA challenges possible
  - Dynamic content may require JavaScript execution

### 2. Myntra
- **Base URL**: https://www.myntra.com
- **Search Path**: /?search=
- **Rate Limit**: 1-2 requests per second
- **Authentication**: Optional
- **Special Notes**:
  - React-based, requires full page load
  - Lazy-loaded images
  - Price filters available

### 3. Flipkart
- **Base URL**: https://www.flipkart.com
- **Search Path**: /search?q=
- **Rate Limit**: 1 request per second
- **Authentication**: May block without login
- **Special Notes**:
  - Dynamic elements require waiting
  - CAPTCHA common for automated access

### 4. Ajio
- **Base URL**: https://www.ajio.com
- **Search Path**: /search/?text=
- **Rate Limit**: 1-2 requests per second
- **Authentication**: Not required
- **Special Notes**:
  - Clean HTML structure
  - No CAPTCHA issues typically

### 5. Meesho
- **Base URL**: https://www.meesho.com
- **Search Path**: /search?q=
- **Rate Limit**: 2-3 requests per second
- **Authentication**: Not required
- **Special Notes**:
  - Budget-friendly platform
  - Requires scrolling for lazy-loaded content
  - No complex anti-bot measures

### 6. Nykaa Fashion
- **Base URL**: https://www.nykaafashion.com
- **Search Path**: /search?q=
- **Rate Limit**: 1-2 requests per second
- **Authentication**: Not required
- **Special Notes**:
  - Premium segment
  - Clean product pages
  - Good review data

### 7. Clovia
- **Base URL**: https://www.clovia.com
- **Search Path**: /search?q=
- **Rate Limit**: 1-2 requests per second
- **Authentication**: Not required
- **Special Notes**:
  - Specialized sleepwear retailer
  - Consistent HTML structure
  - Detailed size guides

### 8. Zivame
- **Base URL**: https://www.zivame.com
- **Search Path**: /search?q=
- **Rate Limit**: 1-2 requests per second
- **Authentication**: Not required
- **Special Notes**:
  - Lingerie/sleepwear specialist
  - Good quality images
  - Detailed reviews

### 9. Tata CLiQ
- **Base URL**: https://www.tatacliq.com
- **Search Path**: /tata-cliq-search?searchQuery=
- **Rate Limit**: 1 request per second
- **Authentication**: May require login
- **Special Notes**:
  - Premium marketplace
  - Authentication improves data access
  - CAPTCHA possible

### 10. Shyaway
- **Base URL**: https://www.shyaway.com
- **Search Path**: /search?q=
- **Rate Limit**: 1-2 requests per second
- **Authentication**: Not required
- **Special Notes**:
  - Specialized intimatewear retailer
  - Niche product focus
  - Consistent structure

## Extraction Rules

### Cloth Type Detection
- Cotton
- Silk
- Linen
- Polyester
- Blend
- Bamboo
- Rayon
- Satin

### Design Name Patterns
- Floral Print
- Solid Color
- Striped
- Checked
- Embroidered
- Lace
- Plain
- Geometric

### Purchase Context Detection
- **Wedding**: Keywords: wedding, bridal, marriage, engagement, honeymoon
- **Casual**: Keywords: casual, everyday, comfortable, lounge
- **Medical**: Keywords: maternity, postpartum, nursing
- **Gift**: Keywords: gift, present, special occasion

## Data Quality Rules

### Review Filtering
- Minimum review length: 10 characters
- Remove spam/promotional reviews
- Exclude reviews from unverified purchases (when available)
- Filter by recency (prioritize recent reviews)

### Image Quality
- Minimum image resolution: 300x300 pixels
- Support formats: JPEG, PNG, WebP
- Prefer product images over lifestyle images

### Video Requirements
- Duration: 5-120 seconds
- Format: MP4, WebM
- Include thumbnail extraction

## Rate Limiting Strategy

```
Global rate limit: 30 requests per minute
Per-platform delay: 2-5 seconds
After 429 error: Exponential backoff (2^n seconds)
Daily limit per platform: ~1440 requests
```

## Session Management

Sessions are stored in: `user-data/<platform>/`

Each session includes:
- Cookies
- Local storage
- Service worker cache
- Login credentials (optional)

Session duration: 30 days before refresh

## Error Handling

### Recoverable Errors
- Network timeouts → Retry with exponential backoff
- Rate limit (429) → Wait and retry
- Temporary CAPTCHA → User interaction (headful mode) or skip

### Non-Recoverable Errors
- 403 Forbidden → Skip platform or use proxy
- Missing selectors → Update selector config
- Invalid product data → Log and skip

## Environment Variables

```bash
HEADFUL=false                    # Show browser window
DEBUG=false                      # Verbose logging
USE_PROXY=false                  # Use proxy server
PROXY_URL=http://proxy:8080      # Proxy URL
SESSION_PERSIST=true             # Save/reuse sessions
CAPTCHA_TIMEOUT=300000           # 5 minutes for CAPTCHA solve
IMAGE_ENCODE=true                # Encode images as base64
VIDEO_FETCH=true                 # Download videos
```

## Testing

Run individual platform crawlers:
```bash
node crawler.js --platform=amazon --keyword="cotton nighty"
node crawler.js --platform=myntra --max=10
```

## Performance Notes

- Average time per platform: 3-5 minutes (10-50 products)
- Full crawl (10 platforms × 5 keywords): 1-2 hours
- Bottlenecks: Network requests, image downloads, CAPTCHA solving
