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

const SEL = {
  card:    'div[data-id]',
  link:    'a.CIaYa1',                 // confirmed live 2026-05 — also matches a.atJtCj
  title:   'a.atJtCj',                 // product name text node
  brand:   'div.Fo1I0b',               // brand name
  price:   'div.hZ3P6w',               // confirmed live 2026-05 (was div.Nx9bqj)
  rating:  'div.XQDdHH',               // may be absent on low-review products
  review:  'span.Wphh3N',              // may be absent on low-review products
  modal:   'button._2KpZ6l._2doB4z, button[class*="close"]',
};

async function enrichFlipkartDetails(page, records) {
  for (const rec of records) {
    try {
      await page.goto(rec.product_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(500);

      const details = await page.evaluate(() => {
        // --- Fabric Type ---
        const grids = [...document.querySelectorAll('.grid-formation-dynamic')];
        const fabricGrid = grids.find(g => {
          const firstLine = g.innerText?.split('\n')[0]?.toLowerCase() || '';
          return firstLine.includes('fabric');
        });
        const fabricType = fabricGrid?.innerText?.split('\n')[1]?.trim() || null;

        // --- Nursing signals ---
        const titleText = (document.querySelector('h1')?.innerText || '').toLowerCase();
        const descText  = (document.body.innerText || '').toLowerCase();

        return { fabricType, titleText, descText };
      });

      if (details.fabricType) rec.fabric_type = details.fabricType;

      // --- Size chart: navigate to dedicated size chart URL ---
      const pid = rec.product_url.match(/pid=([A-Z0-9]+)/)?.[1];
      if (pid) {
        try {
          await page.goto(`https://www.flipkart.com/rv/sizechart?pid=${pid}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(500);

          const sizeChart = await page.evaluate(() => {
            const table = document.querySelector('table');
            if (!table) return null;

            const headerCells = [...table.querySelectorAll('tr')[0]?.querySelectorAll('th, td') || []].map(th =>
              th.innerText?.trim().toLowerCase() || ''
            );
            if (headerCells.length === 0) return null;

            const rows = [...table.querySelectorAll('tr')].slice(1);
            const sizeRows = rows.map(row => {
              const cells = [...row.querySelectorAll('td')].map(c => c.innerText?.trim());
              if (!cells.length || !cells[0]) return null;

              const entry = { size: cells[0] };

              // Map columns to standard keys
              headerCells.forEach((header, idx) => {
                const val = cells[idx];
                if (!val) return;

                if (header.includes('bust') || header.includes('chest')) {
                  entry.chest_in = val;
                } else if (header.includes('waist')) {
                  entry.waist_in = val;
                } else if (header.includes('hip')) {
                  entry.hip_in = val;
                } else if (header.includes('length')) {
                  entry.length_in = val;
                } else if (header.includes('shoulder')) {
                  entry.shoulder_in = val;
                }
              });

              return Object.keys(entry).length > 1 ? entry : null;
            }).filter(Boolean);

            return sizeRows.length > 0 ? { rows: sizeRows } : null;
          });

          if (sizeChart) rec.size_chart = sizeChart;
        } catch (_) {}
      }

      const combinedText = details.titleText + '\n' + details.descText;
      if (FEEDING_ZIP_KEYWORDS.some(kw => combinedText.includes(kw))) {
        rec.nursing_label = 'Feeding Zip';
      } else if (NURSING_KEYWORDS.some(kw => combinedText.includes(kw))) {
        rec.nursing_label = 'Nursing-Friendly';
      }

    } catch (_) {}
    await page.waitForTimeout(800 + Math.random() * 400);
  }
}

export async function scrapeFlipkart(page, keyword, collected) {
  let pageNum = 1;
  while (collected.length < MAX_ITEMS) {
    await page.goto(`https://www.flipkart.com/search?q=${enc(keyword)}&page=${pageNum}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1000);
    try { await page.locator(SEL.modal).first().click({ timeout: 500 }); } catch {}
    if (await page.locator('text=Access Denied').count()) return 'blocked';
    if (!await page.locator(SEL.card).count()) break;

    const rows = await page.evaluate((s) =>
      [...document.querySelectorAll(s.card)].map(c => {
        const link   = c.querySelector(s.link);
        const brand  = c.querySelector(s.brand)?.textContent?.trim() || '';
        const name   = c.querySelector(s.title)?.textContent?.trim() || '';
        const title  = [brand, name].filter(Boolean).join(' ') || link?.getAttribute('aria-label') || '';
        const images = [...new Set([...c.querySelectorAll('img')].map(i => i.src).filter(Boolean))];
        return {
          title,
          href:   link?.getAttribute('href') || '',
          price:  c.querySelector(s.price)?.textContent?.trim() || '',
          rating: c.querySelector(s.rating)?.textContent?.trim() || '',
          review: c.querySelector(s.review)?.textContent?.trim() || '',
          images,
        };
      }), SEL
    );

    for (const r of rows) {
      if (collected.length >= MAX_ITEMS) break;
      const url = abs(r.href, 'https://www.flipkart.com');
      if (!url || isHomepage(url) || !r.title) continue;
      collected.push(buildRecord('flipkart.com', keyword, {
        title: r.title, url, priceText: r.price, ratingText: r.rating,
        reviewText: r.review, imageUrls: r.images,
      }));
    }
    pageNum++;
    await page.waitForTimeout(500);
  }

  // Pre-fill fabric from titles; initialize detail fields
  for (const rec of collected) {
    rec.fabric_type   = extractFabricFromTitle(rec.product_title);
    rec.size_chart    = null;
    rec.nursing_label = null;
  }

  // Enrich from detail pages
  await enrichFlipkartDetails(page, collected);
}
