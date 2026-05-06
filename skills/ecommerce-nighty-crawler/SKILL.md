# E-Commerce Nighty Crawler Skill

Extract comprehensive product and customer insights from 10 major Indian e-commerce platforms for women's nighty and top products.

## Overview

This skill crawls major Indian e-commerce platforms to collect detailed product information, customer reviews, and purchaser demographics for women's nightwear and tops. It extracts structured data including product specifications, review analytics, purchase patterns, and media assets.

## Supported E-Commerce Platforms

1. **Amazon.in** - https://www.amazon.in
2. **Myntra** - https://www.myntra.com
3. **Flipkart** - https://www.flipkart.com
4. **Ajio** - https://www.ajio.com
5. **Meesho** - https://www.meesho.com
6. **Nykaa Fashion** - https://www.nykaafashion.com
7. **Clovia** - https://www.clovia.com
8. **Zivame** - https://www.zivame.com
9. **Tata CLiQ** - https://www.tatacliq.com
10. **Shyaway** - https://www.shyaway.com

## Data Extraction Fields

### Product Information
- **cloth_type**: Fabric composition (cotton, silk, linen, blend, etc.)
- **design_name**: Design pattern/style identifier
- **product_url**: Direct product link
- **product_title**: Official product name

### Review & Rating Data
- **review_count**: Total number of reviews
- **average_rating**: Overall product rating (out of 5)
- **review_details**: Array of individual reviews containing:
  - `reviewer_name`: Customer name (anonymized if needed)
  - `rating`: Individual review rating
  - `review_text`: Review content
  - `review_date`: Review submission timestamp (ISO format)
  - `helpful_count`: Number of users who found review helpful

### Purchase & Popularity Metrics
- **max_purchased**: Peak monthly/yearly purchase count
- **recent_purchase_count**: Recent purchase activity (last 30 days)
- **total_sold**: Lifetime sales count

### Purchaser Demographics
- **purchaser_location**: Geographic location (state/city level)
- **purchaser_age_range**: Estimated age bracket (18-25, 26-35, 36-50, etc.)
- **repeat_purchase_rate**: % of repeat customers

### Purchase Context
- **purpose_of_purchase**: [casual, gift, wedding, medical, other]
- **wedding_season_relevance**: Boolean flag indicating wedding-season popularity
- **occasion_tags**: [honeymoon, engagement, wedding-gift, bridal-shower, etc.]

### Media Assets
- **product_images**: Array of:
  - `url`: Image URL
  - `base64`: Base64 encoded image data
  - `alt_text`: Image description
- **product_videos**: Array of:
  - `url`: Video URL
  - `duration`: Video length in seconds
  - `thumbnail_base64`: Base64 encoded thumbnail

## Usage

### Basic Command
```
Analyze nighty products from [platform names or "all"]
```

### Examples
- "Extract all nighty details from Amazon and Myntra"
- "Crawl Meesho for budget nighty products with review data"
- "Get detailed review analysis for wedding nighty from all platforms"
- "Fetch high-resolution product images and videos for cotton nighties"

## Output Format

Returns structured JSON with:
```json
{
  "platform": "Amazon.in",
  "products": [
    {
      "product_id": "unique-id",
      "product_title": "Product Name",
      "product_url": "https://...",
      "cloth_type": "100% Cotton",
      "design_name": "Floral Print Nighty",
      "reviews": {
        "count": 245,
        "average_rating": 4.2,
        "details": [...]
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
        "images": [...],
        "videos": [...]
      },
      "timestamp": "2026-05-07T14:30:00Z"
    }
  ],
  "metadata": {
    "crawl_date": "2026-05-07",
    "total_products": 50,
    "data_quality": "high"
  }
}
```

## Installation

1. Download [`ecommerce-nighty-crawler.skill`](ecommerce-nighty-crawler.skill) and double-click to install in Claude Code, or
2. Create from local folder → point to `skills/ecommerce-nighty-crawler/`

## Features

- **Multi-source crawling**: Automatically detects and scrapes 10+ e-commerce platforms
- **Review sentiment analysis**: Analyzes review content for purchase decision insights
- **Demographics inference**: Estimates purchaser age/location from review patterns
- **Media extraction**: Downloads and encodes product images and videos
- **Wedding relevance detection**: Identifies wedding-season relevant products
- **Rate limiting**: Respects platform rate limits to avoid blocking
- **Session persistence**: Maintains login sessions to access member-only reviews
- **Data deduplication**: Identifies same product across platforms

## Limitations

- Platform-specific terms of service must be respected
- Some platforms may require authentication for detailed review data
- Video content requires high bandwidth
- Image base64 encoding increases payload size
- Review analytics may have lag time (24-48 hours)

## Dependencies

- Playwright (for headless browser automation)
- Sharp or similar library (for image processing/encoding)
- FFmpeg (optional, for video thumbnail extraction)

## Technical Notes

- Each platform has custom CSS selectors due to varying HTML structures
- Implement exponential backoff for rate-limit handling
- Store session cookies in `user-data/<platform>/` directories
- Cache images/videos to avoid re-fetching
- Validate base64 encoding quality for media assets

## Related Skills

- [garment-features](../garment-features/) - Extract design attributes from individual product images
- [trend-catalog](../trend-catalog/) - Aggregate findings into trend reports

## Support

For issues or feature requests, open an issue in the repository with the tag `skill/ecommerce-crawler`.
