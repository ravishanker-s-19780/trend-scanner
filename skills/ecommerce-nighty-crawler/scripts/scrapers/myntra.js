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
  card:    'li.product-base',
  link:    'a',
  brand:   'h3.product-brand',
  name:    'h4.product-product',
  price:   '.product-price',
  rating:  '.product-ratingsContainer span',  // "4.1"
  review:  '.product-ratingsCount',           // "(1.2K)"
  blocked: 'text=Access Denied',
};

function extractFabricFromTitle(title) {
  const t = title.toLowerCase();
  for (const kw of FABRIC_KEYWORDS) {
    if (t.includes(kw)) return kw.charAt(0).toUpperCase() + kw.slice(1);
  }
  return null;
}

async function enrichMyntraDetails(page, records) {
  for (const rec of records) {
    try {
      await page.goto(rec.product_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1000);

      // Size chart: click button then cm toggle (must do before evaluate)
      const sizeBtn = page.locator('button.size-buttons-show-size-chart');
      if (await sizeBtn.count()) {
        await sizeBtn.click();
        await page.waitForTimeout(800);
        const cmBtn = page.locator('#cm');
        if (await cmBtn.count()) { await cmBtn.click(); await page.waitForTimeout(500); }
      }

      const details = await page.evaluate(() => {
        // --- Fabric Type ---
        const specRows = [...document.querySelectorAll('.index-tableContainer .index-row')];
        const fabricRow = specRows.find(r =>
          r.querySelector('.index-rowKey')?.textContent.trim().toLowerCase() === 'fabrics'
        );
        const fabricType = fabricRow?.querySelector('.index-rowValue')?.textContent.trim() || null;

        // --- Size chart ---
        const sizeChart = (() => {
          const table = document.querySelector('.sizeChartWeb-tableNew');
          if (!table) return null;
          const allRows = [...table.querySelectorAll('.sizeChartWeb-newRow')];
          if (allRows.length < 2) return null;
          const headerCells = [...allRows[0].querySelectorAll('.sizeChartWeb-newCell')]
            .map(c => c.textContent.trim()).filter(Boolean);
          const rows = allRows.slice(1).map(row => {
            const cells = [...row.querySelectorAll('.sizeChartWeb-newCell')]
              .map(c => c.textContent.trim()).filter(Boolean);
            const entry = { size: cells[0] };
            headerCells.slice(1).forEach((h, i) => {
              const hLow = h.toLowerCase();
              const val = cells[i + 1];
              if (!val) return;
              if (hLow.includes('bust') || hLow.includes('chest')) {
                if (hLow.includes('cm')) entry.chest_cm = val; else entry.chest_in = val;
              } else if (hLow.includes('waist')) {
                if (hLow.includes('cm')) entry.waist_cm = val; else entry.waist_in = val;
              } else if (hLow.includes('hip')) {
                if (hLow.includes('cm')) entry.hip_cm = val; else entry.hip_in = val;
              } else if (hLow.includes('length')) {
                if (hLow.includes('cm')) entry.length_cm = val; else entry.length_in = val;
              } else {
                entry[h.replace(/\s+/g, '_').toLowerCase()] = val;
              }
            });
            return Object.keys(entry).length > 1 ? entry : null;
          }).filter(Boolean);
          return rows.length > 0 ? { rows } : null;
        })();

        // --- Nursing signals ---
        const titleText = (document.querySelector('.pdp-name')?.innerText || '').toLowerCase();
        const descText  = (document.querySelector('.pdp-productDescriptors')?.innerText || '').toLowerCase();

        return { fabricType, sizeChart, titleText, descText };
      });

      // Fabric: structured value overrides title fallback
      if (details.fabricType) rec.fabric_type = details.fabricType;

      // Fallback: scan desc text for fabric keyword
      if (!rec.fabric_type) {
        const descLow = details.descText;
        for (const kw of FABRIC_KEYWORDS) {
          if (descLow.includes(kw)) { rec.fabric_type = kw.charAt(0).toUpperCase() + kw.slice(1); break; }
        }
      }

      // Size chart
      if (details.sizeChart) rec.size_chart = details.sizeChart;

      // Nursing label
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

export async function scrapeMyntra(page, keyword, collected) {
  let pageNum = 1;
  while (collected.length < MAX_ITEMS) {
    await page.goto(`https://www.myntra.com/${enc(keyword.replace(/\s+/g,'-'))}?rawQuery=${enc(keyword)}&p=${pageNum}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    if (await page.locator(SEL.blocked).count()) return 'blocked';

    const rows = await page.evaluate((s) =>
      [...document.querySelectorAll(s.card)].map(c => {
        const a = c.querySelector(s.link);
        const images = [...new Set([...c.querySelectorAll('img')].map(i => i.src || i.getAttribute('data-src')).filter(Boolean))];
        return {
          brand:  c.querySelector(s.brand)?.textContent?.trim() || '',
          name:   c.querySelector(s.name)?.textContent?.trim() || '',
          href:   a?.href || '',
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
      const url   = abs(r.href, 'https://www.myntra.com');
      const title = [r.brand, r.name].filter(Boolean).join(' - ');
      if (!title || !url || isHomepage(url)) continue;
      collected.push(buildRecord('myntra.com', keyword, {
        title, url, priceText: r.price, ratingText: r.rating,
        reviewText: r.review, imageUrls: r.images,
      }));
    }
    pageNum++;
    await page.waitForTimeout(1000);
  }

  // Pre-fill fabric from titles; initialize detail fields
  for (const rec of collected) {
    rec.fabric_type   = extractFabricFromTitle(rec.product_title);
    rec.size_chart    = null;
    rec.nursing_label = null;
  }

  // Enrich from detail pages
  await enrichMyntraDetails(page, collected);
}
