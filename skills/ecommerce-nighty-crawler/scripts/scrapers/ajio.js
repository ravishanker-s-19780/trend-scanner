import { enc, abs, isHomepage } from '../utils.js';
import { buildRecord }          from '../inference.js';
import { MAX_ITEMS }            from '../config.js';

const FEEDING_ZIP_KEYWORDS = [
  'feeding zip', 'front zip', 'zip front', 'zipper front', 'zipper', 'zip model',
  'zip at bust', 'bust zip', 'side zip', 'zip opening', 'zip near bust'
];

const NURSING_KEYWORDS = [
  'nursing', 'breastfeeding', 'breast feeding', 'lactation',
  'feeding nighty', 'feeding gown', 'feeding maxi', 'maternity nighty',
  'feeding/maternity', 'maternity wear', 'maternity'
];

const FABRIC_KEYWORDS = ['silk', 'satin', 'rayon', 'modal', 'polyester', 'cotton'];

function extractFabricFromTitle(title) {
  const t = (title || '').toLowerCase();
  for (const kw of FABRIC_KEYWORDS) {
    if (t.includes(kw)) return kw.charAt(0).toUpperCase() + kw.slice(1);
  }
  return null;
}

const SEL = {
  card:    'div.item.rilrtl-products-list__item',
  link:    'a',
  name:    'div.nameCls, div[class*="name"]',
  price:   'span.price strong, div.price, span[class*="price"]',
  // aria-label="4.2 star rating and 15 reviews" — both values in one attribute
  ratingWidget: 'div[aria-label*="star rating"]',
  blocked: 'text=Access Denied, text=Forbidden',
  // Detail page — Access Denied headlessly; skip enrichment
};

async function enrichAjioDetails(page, records) {
  for (const rec of records) {
    try {
      // Note: Ajio blocks detail page access to automated browsers (returns Access Denied)
      // So we extract nursing label from product title only and skip fabric/size enrichment

      const titleLower = rec.product_title.toLowerCase();

      // Nursing label: check title for keywords
      if (FEEDING_ZIP_KEYWORDS.some(kw => titleLower.includes(kw))) {
        rec.nursing_label = 'Feeding Zip';
      } else if (NURSING_KEYWORDS.some(kw => titleLower.includes(kw))) {
        rec.nursing_label = 'Nursing-Friendly';
      }

      // Size chart: Ajio doesn't provide detailed measurements, mark as free-size
      rec.size_chart = { free_size: true, rows: [] };

    } catch (err) {
      // Silently skip failed records
    }
  }
}

export async function scrapeAjio(page, keyword, collected) {
  await page.goto(`https://www.ajio.com/search/?text=${enc(keyword)}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector(SEL.card, { timeout: 10000 }).catch(() => {});
  if (await page.locator(SEL.blocked).count()) return 'blocked';

  while (collected.length < MAX_ITEMS) {
    const rows = await page.evaluate((s) =>
      [...document.querySelectorAll(s.card)].map(c => {
        const a      = c.querySelector(s.link);
        const widget = c.querySelector(s.ratingWidget);
        // aria-label format: "4.2 star rating and 15 reviews"
        const label  = widget?.getAttribute('aria-label') || '';
        const ratingMatch = label.match(/^([\d.]+)\s+star/);
        const reviewMatch = label.match(/(\d+)\s+review/);
        const images = [...new Set(
          [...c.querySelectorAll('img')].map(i => i.src || i.getAttribute('data-src')).filter(Boolean)
        )];
        return {
          href:   a?.href || '',
          title:  c.querySelector(s.name)?.textContent?.trim() || '',
          price:  c.querySelector(s.price)?.textContent?.trim() || '',
          rating: ratingMatch ? ratingMatch[1] : '',
          review: reviewMatch ? reviewMatch[1] : '',
          images,
        };
      }), SEL
    );

    const seen = new Set(collected.map(p => p.product_url));
    for (const r of rows) {
      if (collected.length >= MAX_ITEMS) break;
      const url = abs(r.href, 'https://www.ajio.com');
      if (!url || isHomepage(url) || seen.has(url) || !r.title) continue;
      seen.add(url);
      collected.push(buildRecord('ajio.com', keyword, {
        title: r.title, url, priceText: r.price, ratingText: r.rating,
        reviewText: r.review, imageUrls: r.images,
      }));
    }
    if (collected.length >= MAX_ITEMS) break;

    const prevCount = rows.length;
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(2000);
    const newCount = await page.locator(SEL.card).count();
    if (newCount <= prevCount) break;
  }

  // Pre-fill fabric type, size chart, and nursing label fields
  for (const rec of collected) {
    rec.fabric_type = extractFabricFromTitle(rec.product_title);
    rec.size_chart = null;
    rec.nursing_label = null;
  }

  // Enrich from detail pages
  await enrichAjioDetails(page, collected);
}
