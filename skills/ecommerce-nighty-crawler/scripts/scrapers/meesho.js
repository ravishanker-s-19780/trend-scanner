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
  'maternity night', 'maternity & nursing', 'nursing dress', 'maternity'
];

const SEL = {
  card:    'a[href*="/p/"]',
  title:   'p',
  price:   'h5, span[class*="price"]',
  rating:  'span[class*="Rating"]:not([class*="RatingCount"])',   // rating value e.g. "4.0"
  review:  'span[class*="RatingCount"]',                          // "1857 Reviews" — confirmed live
  blocked: 'text=Access Denied',
  // Detail page — Access Denied; skip enrichment
};

function extractFabricFromTitle(title) {
  const t = title.toLowerCase();
  for (const kw of FABRIC_KEYWORDS) {
    if (t.includes(kw)) return kw.charAt(0).toUpperCase() + kw.slice(1);
  }
  return null;
}

export async function scrapeMeesho(page, keyword, collected) {
  const catalogMap = new Map(); // product_id → catalog object
  page.on('response', async (response) => {
    if (!response.url().includes('/api/v1/products/search')) return;
    try {
      const data = JSON.parse(await response.text());
      for (const cat of (data.catalogs || [])) {
        if (cat.product_id) catalogMap.set(cat.product_id, cat);
      }
    } catch (_) {}
  });

  await page.goto(`https://www.meesho.com/search?q=${enc(keyword)}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector(SEL.card, { timeout: 10000 }).catch(() => {});
  if (await page.locator(SEL.blocked).count()) return 'blocked';

  while (collected.length < MAX_ITEMS) {
    const rows = await page.evaluate((s) =>
      [...document.querySelectorAll(s.card)].map(c => {
        const images = [...new Set([...c.querySelectorAll('img')].map(i => i.src || i.getAttribute('data-src')).filter(Boolean))];
        return {
          href:   c.href,
          title:  c.querySelector(s.title)?.textContent?.trim() || '',
          price:  c.querySelector(s.price)?.textContent?.trim() || '',
          rating: c.querySelector(s.rating)?.textContent?.trim() || '',
          review: c.querySelector(s.review)?.textContent?.trim() || '',  // "1857 Reviews"
          images,
        };
      }), SEL
    );

    const seen = new Set(collected.map(p => p.product_url));
    for (const r of rows) {
      if (collected.length >= MAX_ITEMS) break;
      const url = abs(r.href, 'https://www.meesho.com');
      if (!url || isHomepage(url) || seen.has(url) || !r.title) continue;
      seen.add(url);
      collected.push(buildRecord('meesho.com', keyword, {
        title: r.title, url, priceText: r.price, ratingText: r.rating,
        reviewText: r.review, imageUrls: r.images,
      }));
    }
    if (collected.length >= MAX_ITEMS) break;

    const atBottom = await page.evaluate(() =>
      (window.innerHeight + window.scrollY) >= document.body.scrollHeight - 300
    );
    if (atBottom) break;
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(1500);
  }

  // Pre-fill fabric from titles; initialize detail fields
  for (const rec of collected) {
    rec.fabric_type   = extractFabricFromTitle(rec.product_title);
    rec.size_chart    = null;
    rec.nursing_label = null;
  }

  // Enrich from API data (no detail page visits needed — Meesho blocks headless access)
  for (const rec of collected) {
    const pid = rec.product_url.match(/\/p\/([^/]+)$/)?.[1];
    if (!pid) continue;
    const cat = catalogMap.get(pid);
    if (!cat) continue;

    // Fabric: try product_attributes first, fall back to full_details
    const fabricAttr = (cat.product_attributes || []).find(a => /^fabric:/i.test(a));
    const fabricType = fabricAttr
      ? fabricAttr.split(':').slice(1).join(':').trim()
      : (cat.full_details || '').split('\n').find(l => /^fabric:/i.test(l.trim()))?.split(':').slice(1).join(':').trim() || null;
    if (fabricType) rec.fabric_type = fabricType;

    // Size chart: parse from full_details "Sizes:" section
    const fullDetails = cat.full_details || '';
    const sizesIdx = fullDetails.indexOf('\nSizes:');
    if (sizesIdx >= 0) {
      const sizesSection = fullDetails.slice(sizesIdx + 7);
      const sizeLines = sizesSection.split('\n').filter(l => l.match(/\(.*Size:/));
      const rows = sizeLines.map(line => {
        const sizeMatch = line.match(/^\s*([A-Za-z0-9\s]+?)\s*\(/);
        const size = sizeMatch?.[1]?.trim();
        if (!size) return null;
        const entry = { size };
        for (const [field, key] of [['Bust', 'chest_cm'], ['Waist', 'waist_cm'], ['Hip', 'hip_cm'], ['Length', 'length_cm']]) {
          const m = line.match(new RegExp(`${field} Size: ([\\d.]+) in`));
          if (m) entry[key] = String(Math.round(parseFloat(m[1]) * 2.54 * 10) / 10);
        }
        return Object.keys(entry).length > 1 ? entry : null;
      }).filter(Boolean);
      if (rows.length) rec.size_chart = { rows };
    }

    // Nursing label: scan slug + name + full_details for keywords
    const textToScan = [cat.slug || '', cat.name || '', fullDetails].join(' ').toLowerCase();
    if (FEEDING_ZIP_KEYWORDS.some(kw => textToScan.includes(kw))) {
      rec.nursing_label = 'Feeding Zip';
    } else if (NURSING_KEYWORDS.some(kw => textToScan.includes(kw))) {
      rec.nursing_label = 'Nursing-Friendly';
    }
  }
}
