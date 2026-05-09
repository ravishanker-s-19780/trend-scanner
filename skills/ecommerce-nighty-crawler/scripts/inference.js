import { productId, parsePrice, parseRating, parseCount } from './utils.js';

const CLOTH_MAP = [
  ['poly-cotton','Blend'],['polycotton','Blend'],['100% cotton','Cotton'],
  ['pure cotton','Cotton'],['cotton','Cotton'],['silk','Silk'],['silky','Silk'],
  ['satin','Satin'],['linen','Linen'],['rayon','Rayon'],['viscose','Rayon'],
  ['polyester','Polyester'],['bamboo','Bamboo'],['blend','Blend'],
];
export function inferClothType(text) {
  const lower = (text || '').toLowerCase();
  for (const [kw, type] of CLOTH_MAP) if (lower.includes(kw)) return type;
  return null;
}

const DESIGN_MAP = [
  ['floral print','Floral Print'],['floral','Floral Print'],['flower','Floral Print'],
  ['rose print','Floral Print'],['botanical','Floral Print'],
  ['embroidered','Embroidered'],['embroidery','Embroidered'],
  ['striped','Striped'],['stripe','Striped'],
  ['checked','Checked'],['checks','Checked'],['plaid','Checked'],
  ['geometric','Geometric'],['lace','Lace'],['solid','Solid'],['plain','Plain'],
];
export function inferDesignName(text) {
  const lower = (text || '').toLowerCase();
  for (const [kw, d] of DESIGN_MAP) if (lower.includes(kw)) return d;
  return null;
}

const WEDDING_KWS = ['wedding','bridal','bride','marriage','honeymoon','engagement'];
const PURPOSE_KWS = [
  ['feeding','maternity'],['nursing','maternity'],['maternity','maternity'],['pregnancy','maternity'],
  ['wedding','wedding'],['bridal','wedding'],['bride','wedding'],['marriage','wedding'],
  ['honeymoon','wedding'],['engagement','wedding'],['gift','gift'],
];
export function inferContext(title, keyword) {
  const lower = (title + ' ' + keyword).toLowerCase();
  const purposes = new Set();
  for (const [kw, p] of PURPOSE_KWS) if (lower.includes(kw)) purposes.add(p);
  if (!purposes.size) purposes.add('casual');
  return {
    wedding_relevant:    WEDDING_KWS.some(kw => lower.includes(kw)),
    purpose_of_purchase: [...purposes],
  };
}

// imageUrls: string[] — all image URLs visible on the listing card
export function buildRecord(domain, keyword, { title, url, priceText, ratingText, reviewText, badgeText, imageUrls }) {
  const ctx = inferContext(title, keyword);
  return {
    product_id:            productId(domain, url),
    platform:              domain,
    keyword,
    product_title:         title,
    product_url:           url,
    price:                 parsePrice(priceText),
    rating:                parseRating(ratingText),
    review_count:          parseCount(reviewText),
    recent_purchase_label: badgeText || null,
    recent_purchase_count: parseCount(badgeText),
    cloth_type:            inferClothType(title),
    design_name:           inferDesignName(title),
    images:                imageUrls || [],
    wedding_relevant:      ctx.wedding_relevant,
    purpose_of_purchase:   ctx.purpose_of_purchase,
  };
}
