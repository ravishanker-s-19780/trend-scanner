import { enc, abs, isHomepage } from '../utils.js';
import { buildRecord }          from '../inference.js';
import { MAX_ITEMS }            from '../config.js';

const FABRIC_KEYWORDS = [
  'cotton', 'satin', 'silk', 'crepe', 'viscose', 'rayon',
  'polyester', 'blend', 'georgette', 'chiffon', 'fleece',
  'flannel', 'modal', 'lycra', 'spandex', 'nylon'
];

const FEEDING_ZIP_KEYWORDS = [
  'feeding zip', 'front zip', 'zip front', 'zipper', 'zip model',
  'zip at bust', 'side zip', 'zip opening'
];

const NURSING_KEYWORDS = [
  'nursing', 'breastfeeding', 'breast feeding', 'lactation',
  'feeding nighty', 'feeding gown', 'maternity nighty', 'maternity wear',
  'maternity night', 'maternity & nursing', 'nursing dress'
];

// Confirmed selectors via HTML inspection 2026-05
const SEL = {
  card:    'a.ProductModule__base[href*="/p-"]',
  brand:   'h3.ProductDescription__boldText',
  name:    'h2.ProductDescription__description',
  price:   'div.ProductDescription__discount h3, div.ProductDescription__priceHolder h3',
  // Listing card: "5" in starRatingHigh, "(1)" in totalNoOfReviews
  rating:  'div.StarRating__starRatingHigh',
  review:  'div.ProductInfo__totalNoOfReviews',
};

function extractFabricFromTitle(title) {
  const t = title.toLowerCase();
  for (const kw of FABRIC_KEYWORDS) {
    if (t.includes(kw)) return kw.charAt(0).toUpperCase() + kw.slice(1);
  }
  return null;
}

function extractNursingFromTitle(title) {
  const t = title.toLowerCase();
  if (FEEDING_ZIP_KEYWORDS.some(kw => t.includes(kw))) return 'Feeding Zip';
  if (NURSING_KEYWORDS.some(kw => t.includes(kw))) return 'Nursing-Friendly';
  return null;
}

async function enrichTatacliqDetails(page, records) {
  for (const rec of records) {
    try {
      await page.goto(rec.product_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(500);

      // Wait for React SPA to hydrate product content (up to 8s)
      await page.waitForSelector(
        '.ProductDescriptionPage__headerDetailsPDP, .ProductGalleryDesktopUpdated__productAttributeObject',
        { timeout: 8000 }
      ).catch(() => {}); // silently skip if page has no product content (delisted/unavailable)

      const details = await page.evaluate(() => {
        // --- Fabric Type ---
        // Primary: headerDetailsPDP label/value pairs
        const pdpLabels = [...document.querySelectorAll('.ProductDescriptionPage__headerDetailsPDP')];
        const fabricPair = pdpLabels.find(el => el.textContent.trim().toLowerCase() === 'fabric');
        let fabricType = fabricPair?.nextElementSibling?.textContent?.trim() || null;

        // Fallback: productAttributeObject in Finer Details block
        if (!fabricType) {
          const attrObjects = [...document.querySelectorAll('.ProductGalleryDesktopUpdated__productAttributeObject')];
          const fabricAttr = attrObjects.find(el =>
            (el.querySelector('.ProductGalleryDesktopUpdated__productAttributeKey')?.textContent?.trim() || '')
              .replace(/:$/, '').toLowerCase() === 'fabric'
          );
          fabricType = fabricAttr
            ?.querySelector('.ProductGalleryDesktopUpdated__productAttributeValue')
            ?.textContent?.trim() || null;
        }

        // --- Size Chart (available sizes only — no CM measurements on TataCliq) ---
        const sizeButtons = [...document.querySelectorAll('[id^="pdpSize-"]')]
          .map(el => el.textContent.trim())
          .filter(Boolean);
        const sizeChart = sizeButtons.length > 0 ? { available_sizes: sizeButtons } : null;

        // --- Nursing signals ---
        const titleText = (document.querySelector('h1')?.innerText || '').toLowerCase();
        const descText  = (document.querySelector('.Accordion__base')?.innerText || '').toLowerCase();

        return { fabricType, sizeChart, titleText, descText };
      });

      // Apply fabric (detail page value overrides title-extracted fallback)
      if (details.fabricType) rec.fabric_type = details.fabricType;

      // Apply size chart
      if (details.sizeChart) rec.size_chart = details.sizeChart;

      // Apply nursing label (feeding zip > nursing-friendly)
      const combinedText = details.titleText + '\n' + details.descText;
      if (FEEDING_ZIP_KEYWORDS.some(kw => combinedText.includes(kw))) {
        rec.nursing_label = 'Feeding Zip';
      } else if (NURSING_KEYWORDS.some(kw => combinedText.includes(kw))) {
        rec.nursing_label = 'Nursing-Friendly';
      }

    } catch (_) {
      // Silently skip failed records
    }
    await page.waitForTimeout(800 + Math.random() * 400);
  }
}

export async function scrapeTatacliq(page, keyword, collected) {
  let pageNum = 1;
  while (collected.length < MAX_ITEMS) {
    await page.goto(`https://www.tatacliq.com/search/?searchCategory=all&text=${enc(keyword)}&page=${pageNum}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector(SEL.card, { timeout: 10000 }).catch(() => {});

    const rows = await page.evaluate((s) =>
      [...document.querySelectorAll(s.card)].map(c => {
        const images = [...new Set([...c.querySelectorAll('img')].map(i => i.src || i.getAttribute('data-src')).filter(Boolean))];
        return {
          href:   c.href,
          brand:  c.querySelector(s.brand)?.textContent?.trim() || '',
          name:   c.querySelector(s.name)?.textContent?.trim() || '',
          price:  c.querySelector(s.price)?.textContent?.trim() || '',
          rating: c.querySelector(s.rating)?.textContent?.trim() || '',
          review: c.querySelector(s.review)?.textContent?.trim() || '',
          images,
        };
      }), SEL
    );
    if (!rows.length) break;

    for (const r of rows) {
      if (collected.length >= MAX_ITEMS) break;
      const url   = abs(r.href, 'https://www.tatacliq.com');
      const title = [r.brand, r.name].filter(Boolean).join(' ');
      if (!title || !url || isHomepage(url)) continue;
      collected.push(buildRecord('tatacliq.com', keyword, {
        title, url, priceText: r.price, ratingText: r.rating,
        reviewText: r.review, imageUrls: r.images,
      }));
    }
    pageNum++;
    await page.waitForTimeout(800);
  }

  // Pre-fill fabric + nursing from titles; initialize detail fields
  for (const rec of collected) {
    rec.fabric_type   = extractFabricFromTitle(rec.product_title);
    rec.size_chart    = null;
    rec.nursing_label = extractNursingFromTitle(rec.product_title);
  }

  // Enrich from detail pages
  await enrichTatacliqDetails(page, collected);
}
