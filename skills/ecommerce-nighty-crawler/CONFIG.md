# Configuration for E-Commerce Nighty Crawler

This file defines platform-specific configurations and extraction rules for the crawler.

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
