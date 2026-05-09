import { productId, parsePrice, parseRating, parseCount } from './utils.js';

export function buildRecord(domain, keyword, { title, url, priceText, ratingText, reviewText, badgeText, imageUrls }) {
  const rec = {
    product_id:    productId(domain, url),
    platform:      domain,
    keyword,
    product_title: title,
    product_url:   url,
    price:         parsePrice(priceText),
    rating:        parseRating(ratingText),
    review_count:  parseCount(reviewText),
    images:        imageUrls || [],
  };
  if (badgeText !== undefined) {
    rec.recent_purchase_count = parseCount(badgeText);
  }
  return rec;
}
