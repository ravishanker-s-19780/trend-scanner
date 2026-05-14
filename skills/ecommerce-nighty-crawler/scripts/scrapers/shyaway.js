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
  card:    'div.product-item, li[class*="product"]',
  title:   'a[class*="name"], p[class*="name"], h3',
  price:   'span[class*="price"]',
  // "4.8  <span>(349)</span>" — rating and review in one widget
  ratingWidget: 'div.custom-rating-result',
};

function extractFabricFromTitle(title) {
  const t = title.toLowerCase();
  for (const kw of FABRIC_KEYWORDS) {
    if (t.includes(kw)) return kw.charAt(0).toUpperCase() + kw.slice(1);
  }
  return null;
}

async function enrichShywayDetails(page, records) {
  for (const rec of records) {
    try {
      await page.goto(rec.product_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(500);

      const details = await page.evaluate(() => {
        // Fabric
        const attrItems = [...document.querySelectorAll('.shy-attribute-item')];
        const fabricItem = attrItems.find(item =>
          item.querySelector('.label')?.textContent.trim().toLowerCase() === 'fabric'
        );
        const fabricType = fabricItem?.querySelector('.values span')?.textContent.trim() || null;

        // Size chart (data-cm in DOM, no clicking needed)
        const sizeChart = (() => {
          const sizeRows = [...document.querySelectorAll('#popup-sizechart .item-list.inch-items')];
          if (!sizeRows.length) return null;
          const rows = sizeRows.map(row => {
            const size = row.querySelector('.size-custom-list:first-child span')?.textContent.trim();
            if (!size) return null;
            const entry = { size };
            for (const div of row.querySelectorAll('.size-custom-list')) {
              const key = [...div.classList].find(c => c !== 'size-custom-list');
              const span = div.querySelector('span[data-cm]');
              if (key && span) entry[`${key}_cm`] = span.getAttribute('data-cm');
            }
            return Object.keys(entry).length > 1 ? entry : null;
          }).filter(Boolean);
          return rows.length > 0 ? { rows } : null;
        })();

        // Nursing signals — use innerText to avoid embedded CSS in textContent
        const featureLabels = [...document.querySelectorAll('.feature-label')]
          .map(el => el.textContent.trim().toLowerCase());
        const titleText = (document.querySelector('h1')?.innerText || '').toLowerCase();
        const descText  = (document.querySelector('.product-description')?.innerText || '').toLowerCase();

        return { fabricType, sizeChart, featureLabels, titleText, descText };
      });

      // Apply fabric (detail page value overrides title-extracted fallback)
      if (details.fabricType) rec.fabric_type = details.fabricType;

      // Apply size chart
      if (details.sizeChart) rec.size_chart = details.sizeChart;

      // Apply nursing label (feeding zip > nursing-friendly)
      const combinedText = details.titleText + '\n' + details.descText;
      if (FEEDING_ZIP_KEYWORDS.some(kw => combinedText.includes(kw))) {
        rec.nursing_label = 'Feeding Zip';
      } else if (details.featureLabels.some(l => l.includes('maternity'))) {
        rec.nursing_label = 'Nursing-Friendly';
      } else if (NURSING_KEYWORDS.some(kw => combinedText.includes(kw))) {
        rec.nursing_label = 'Nursing-Friendly';
      }

    } catch (_) {
      // Silently skip failed records
    }
    await page.waitForTimeout(800 + Math.random() * 400);
  }
}

export async function scrapeShyaway(page, keyword, collected) {
  let pageNum = 1;
  while (collected.length < MAX_ITEMS) {
    await page.goto(`https://www.shyaway.com/nightwear-online/?q=${enc(keyword)}&page=${pageNum}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector(SEL.card, { timeout: 8000 }).catch(() => {});

    const rows = await page.evaluate((s) =>
      [...document.querySelectorAll(s.card)].map(c => {
        const a      = c.querySelector('a');
        const widget = c.querySelector(s.ratingWidget);
        // rating: first text node before the span, e.g. "4.8"
        const rating = widget
          ? [...widget.childNodes].find(n => n.nodeType === 3)?.textContent?.trim() || ''
          : '';
        // review: span text inside the widget, e.g. "(349)"
        const review = widget?.querySelector('span')?.textContent?.trim() || '';
        const images = [...new Set(
          [...c.querySelectorAll('img')].map(i => i.src || i.getAttribute('data-src')).filter(Boolean)
        )];
        return {
          href:   a?.href || '',
          title:  c.querySelector(s.title)?.textContent?.trim() || '',
          price:  c.querySelector(s.price)?.textContent?.trim() || '',
          rating,
          review,
          images,
        };
      }), SEL
    );
    if (!rows.length) break;

    for (const r of rows) {
      if (collected.length >= MAX_ITEMS) break;
      const url = abs(r.href, 'https://www.shyaway.com');
      if (!url || isHomepage(url) || !r.title) continue;
      collected.push(buildRecord('shyaway.com', keyword, {
        title: r.title, url, priceText: r.price, ratingText: r.rating,
        reviewText: r.review, imageUrls: r.images,
      }));
    }
    pageNum++;
    await page.waitForTimeout(700);
  }

  // Pre-fill fabric from titles; initialize detail fields
  for (const rec of collected) {
    rec.fabric_type   = extractFabricFromTitle(rec.product_title);
    rec.size_chart    = null;
    rec.nursing_label = null;
  }

  // Enrich from detail pages
  await enrichShywayDetails(page, collected);
}
