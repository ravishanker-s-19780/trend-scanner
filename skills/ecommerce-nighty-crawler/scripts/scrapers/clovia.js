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

function extractFabricFromTitle(title) {
  const t = title.toLowerCase();
  for (const kw of FABRIC_KEYWORDS) {
    if (t.includes(kw)) return kw.charAt(0).toUpperCase() + kw.slice(1);
  }
  return null;
}

// Cards: SSR inside <ul id="id_all_list">
// waitForSelector instead of networkidle — analytics pings keep network busy indefinitely
const SEL = {
  card:    '#id_all_list li[id^="id_main_li_"]',
  link:    'div.pdImg a',
  image:   'img.firstimage',
  price:   '[class*="price"], [class*="Price"]',
  rating:  'ul.ratings strong',   // "4.7" — available on listing
};

async function enrichCloviaDetails(page, records) {
  for (const rec of records) {
    try {
      await page.goto(rec.product_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(500);

      const details = await page.evaluate(() => {
        // --- Fabric Type ---
        // Fabric info is in product description text, e.g., "100% soft & premium cotton fabric"
        const descDiv = document.querySelector('.new-description');
        const descText = descDiv?.innerText || '';

        let fabricType = null;
        // Try to extract from description (e.g., "100% cotton" or "cotton fabric")
        for (const kw of ['cotton', 'satin', 'silk', 'crepe', 'viscose', 'rayon', 'polyester', 'blend', 'georgette', 'chiffon', 'fleece', 'flannel', 'modal', 'lycra', 'spandex', 'nylon']) {
          if (descText.toLowerCase().includes(kw)) {
            fabricType = kw.charAt(0).toUpperCase() + kw.slice(1);
            break;
          }
        }

        // --- Size Chart ---
        // Clovia shows available sizes (S, M, L, XL, etc) in .sizesAvail container
        let sizeChart = null;
        const sizesDiv = document.querySelector('.sizesAvail');
        if (sizesDiv) {
          const availableSizes = [];
          const sizeElements = [...sizesDiv.querySelectorAll('*')];
          sizeElements.forEach(el => {
            const text = (el.textContent?.trim() || '').toUpperCase();
            // Match single letter (S, M, L) or multi-letter (XL, XXL, 3XL, Free)
            if (text && text.length <= 5 && text.match(/^[A-Z0-9]+$/) && !availableSizes.includes(text)) {
              availableSizes.push(text);
            }
          });

          // If we found some, deduplicate and sort them in a logical order
          if (availableSizes.length > 0) {
            const sizeOrder = { 'S': 1, 'M': 2, 'L': 3, 'XL': 4, 'XXL': 5, '3XL': 6, 'FREE': 7 };
            const sorted = availableSizes.sort((a, b) => (sizeOrder[a] || 99) - (sizeOrder[b] || 99));
            sizeChart = { available_sizes: sorted };
          }
        }

        // --- Nursing signals ---
        const titleText = (document.querySelector('h1')?.innerText || '').toLowerCase();
        const fullDescText = (document.body.innerText || '').toLowerCase();

        return { fabricType, sizeChart, titleText, fullDescText };
      });

      if (details.fabricType) rec.fabric_type = details.fabricType;
      if (details.sizeChart) rec.size_chart = details.sizeChart;

      const combinedText = details.titleText + '\n' + details.fullDescText;
      if (FEEDING_ZIP_KEYWORDS.some(kw => combinedText.includes(kw))) {
        rec.nursing_label = 'Feeding Zip';
      } else if (NURSING_KEYWORDS.some(kw => combinedText.includes(kw))) {
        rec.nursing_label = 'Nursing-Friendly';
      }

    } catch (_) {}
    await page.waitForTimeout(800 + Math.random() * 400);
  }
}

export async function scrapeClovia(page, keyword, collected) {
  let pageNum = 1;
  while (collected.length < MAX_ITEMS) {
    await page.goto(`https://www.clovia.com/search/?q=${enc(keyword)}&page=${pageNum}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector(SEL.card, { timeout: 10000 }).catch(() => {});

    const rows = await page.evaluate((s) =>
      [...document.querySelectorAll(s.card)].map(li => {
        const a      = li.querySelector(s.link);
        const img    = li.querySelector(s.image);
        const images = [...new Set([...li.querySelectorAll('img')].map(i => i.src || i.getAttribute('data-src')).filter(Boolean))];
        return {
          href:   a?.getAttribute('href') || '',
          title:  (img?.getAttribute('alt') || a?.getAttribute('title') || '').replace(/^(front|back)\s+listing image for\s+/i, '').trim(),
          price:  [...li.querySelectorAll(s.price)].map(p => p.textContent.trim()).join(' '),
          rating: li.querySelector(s.rating)?.textContent?.trim() || '',
          images,
        };
      }), SEL
    );
    if (!rows.length) break;

    const seen = new Set(collected.map(p => p.product_url));
    for (const r of rows) {
      if (collected.length >= MAX_ITEMS) break;
      const url = abs(r.href, 'https://www.clovia.com');
      if (!url || isHomepage(url) || seen.has(url) || !r.title) continue;
      seen.add(url);
      collected.push(buildRecord('clovia.com', keyword, {
        title: r.title, url, priceText: r.price, ratingText: r.rating,
        reviewText: '', imageUrls: r.images,
      }));
    }
    pageNum++;
    await page.waitForTimeout(600);
  }

  // Pre-fill fabric from titles; initialize detail fields
  for (const rec of collected) {
    rec.fabric_type   = extractFabricFromTitle(rec.product_title);
    rec.size_chart    = null;
    rec.nursing_label = null;
  }

  // Enrich from detail pages
  await enrichCloviaDetails(page, collected);
}
