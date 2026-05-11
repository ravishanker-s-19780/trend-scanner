import { enc, abs, isHomepage } from '../utils.js';
import { buildRecord }          from '../inference.js';
import { MAX_ITEMS }            from '../config.js';

const FABRIC_KEYWORDS = [
  'cotton', 'satin', 'silk', 'crepe', 'viscose', 'rayon',
  'polyester', 'blend', 'georgette', 'chiffon', 'fleece',
  'flannel', 'modal', 'lycra', 'spandex', 'nylon'
];

const FEEDING_ZIP_KEYWORDS = [
  'feeding zip', 'front zip', 'zip front', 'zipper front', 'zipper', 'zip model',
  'zip at bust', 'bust zip', 'side zip', 'zip opening', 'zip near bust'
];

const NURSING_KEYWORDS = [
  'nursing', 'breastfeeding', 'breast feeding', 'lactation',
  'feeding nighty', 'feeding gown', 'feeding maxi', 'maternity nighty',
  'feeding/maternity', 'maternity wear'
];

const SEL = {
  card:    'div.s-result-item[data-asin]:not([data-asin=""])',
  image:   'img.s-image',
  link:    'a.a-link-normal',
  price:   '.a-price .a-offscreen',
  rating:  'span.a-icon-alt',                  // "3.8 out of 5 stars"
  review:  'a[href*="customerReviews"] span',  // "(1,234)" — parseCount strips parens
  badge:   'span.a-size-base',
  captcha: 'form[action*="validateCaptcha"]',
};

function extractFabricFromTitle(title) {
  const t = title.toLowerCase();
  for (const kw of FABRIC_KEYWORDS) {
    if (t.includes(kw)) return kw.charAt(0).toUpperCase() + kw.slice(1);
  }
  return null;
}


async function enrichAmazonDetails(page, records) {
  for (const rec of records) {
    try {
      await page.goto(rec.product_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(500);

      const details = await page.evaluate(() => {
        // Helper: scan all prodDetTable rows for a specific header
        const prodDetVal = (header) => {
          for (const tr of document.querySelectorAll('table.prodDetTable tr')) {
            const th = tr.querySelector('th');
            const td = tr.querySelector('td');
            if (th && td && th.textContent.trim().toLowerCase() === header.toLowerCase()) {
              return td.textContent.trim();
            }
          }
          return null;
        };

        // Helper: get .product-facts-detail value by label
        const factVal = (label) => {
          for (const row of document.querySelectorAll('.product-facts-detail')) {
            const cols = row.querySelectorAll('.a-fixed-left-grid-col');
            if (cols[0]?.textContent.trim().toLowerCase() === label.toLowerCase()) {
              return cols[1]?.textContent.trim() || null;
            }
          }
          return null;
        };

        // 1. FABRIC TYPE — priority: Fabric Type field > Material composition > Material type
        const fabricType =
          prodDetVal('Fabric Type') ||
          factVal('Material composition') ||
          prodDetVal('Material type') ||
          factVal('Material type') ||
          null;

        // 2. CLOSURE TYPE — for feeding zip detection
        const closureType =
          prodDetVal('Closure Type') ||
          factVal('Closure type') ||
          '';

        // 3. SPECIFIC USES — for nursing detection
        const specificUses = prodDetVal('Specific Uses For Product') || '';
        const lifestyle = prodDetVal('Lifestyle') || '';

        // 4. ABOUT THIS ITEM bullets — for zip/nursing keyword scan
        const bulletText = document.querySelector('#productFactsDesktopExpander')
          ? [...document.querySelectorAll('#productFactsDesktopExpander .a-list-item')]
              .map(el => el.textContent.trim()).join('\n')
          : '';

        // 5. Description text — last resort
        const descText = document.querySelector('#productDescription')?.textContent || '';

        // 6. SIZE CHART — no clicking needed; table lives in DOM even when popover is hidden
        const sizeChart = (() => {
          const table = document.querySelector('table[id^="fit-sizechartv2"]');
          if (!table) {
            // Capture free-size info from prodDetTable
            for (const tr of document.querySelectorAll('table.prodDetTable tr')) {
              const th = tr.querySelector('th');
              const td = tr.querySelector('td');
              if (th?.textContent.trim().toLowerCase() === 'size' && td) {
                const sizeVal = td.textContent.trim();
                if (sizeVal.toLowerCase().includes('free')) return { free_size: true, rows: [] };
                return null;
              }
            }
            return null;
          }
          // Parse header row
          const headerCells = [...table.querySelectorAll('tr:first-child th, tr:first-child td')]
            .map(c => c.textContent.trim());
          // Parse data rows
          const rows = [...table.querySelectorAll('tr')].slice(1).map(tr => {
            const cells = [...tr.querySelectorAll('td, th')].map(c => c.textContent.trim());
            const row = { size: cells[0] };
            headerCells.slice(1).forEach((h, i) => {
              const hLow = h.toLowerCase();
              const val = cells[i + 1];
              if (!val) return;
              if (hLow.includes('bust') || hLow.includes('chest')) {
                if (hLow.includes('cm')) row.chest_cm = val; else row.chest_in = val;
              } else if (hLow.includes('waist')) {
                if (hLow.includes('cm')) row.waist_cm = val; else row.waist_in = val;
              } else if (hLow.includes('hip')) {
                if (hLow.includes('cm')) row.hip_cm = val; else row.hip_in = val;
              } else if (hLow.includes('length')) {
                if (hLow.includes('cm')) row.length_cm = val; else row.length_in = val;
              } else {
                row[h.replace(/\s+/g, '_').toLowerCase()] = val;
              }
            });
            return row;
          }).filter(r => Object.keys(r).length > 1);
          return rows.length > 0 ? { rows } : null;
        })();

        return { fabricType, closureType, specificUses, lifestyle, bulletText, descText, sizeChart };
      });

      // Fabric type: use structured value if richer than title-extracted
      if (details.fabricType) rec.fabric_type = details.fabricType;

      // Nursing label: structured fields first, then text scan
      const closureLower = details.closureType.toLowerCase();
      const usesLower = details.specificUses.toLowerCase();
      const lifestyleLower = details.lifestyle.toLowerCase();
      const allText = (rec.product_title + '\n' + details.bulletText + '\n' + details.descText).toLowerCase();

      if (closureLower.includes('zipper') || closureLower.includes('zip')) {
        rec.nursing_label = 'Feeding Zip';
      } else if (FEEDING_ZIP_KEYWORDS.some(kw => allText.includes(kw))) {
        rec.nursing_label = 'Feeding Zip';
      } else if (usesLower.includes('nursing') || lifestyleLower.includes('nursing')) {
        rec.nursing_label = 'Nursing-Friendly';
      } else if (NURSING_KEYWORDS.some(kw => allText.includes(kw))) {
        rec.nursing_label = 'Nursing-Friendly';
      }

      // Size chart
      if (details.sizeChart) rec.size_chart = details.sizeChart;

    } catch (err) {
      // Silently skip failed records
    }
    await page.waitForTimeout(800 + Math.random() * 400);
  }
}

export async function scrapeAmazon(page, keyword, collected) {
  let pageNum = 1;
  while (collected.length < MAX_ITEMS) {
    await page.goto(`https://www.amazon.in/s?k=${enc(keyword)}&i=apparel&page=${pageNum}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1000);
    if ((await page.title()).toLowerCase().includes('robot') ||
        await page.locator(SEL.captcha).count()) return 'blocked';

    const rows = await page.evaluate((s) =>
      [...document.querySelectorAll(s.card)].map(c => {
        const img    = c.querySelector(s.image);
        const a      = c.querySelector(s.link);
        const badge  = [...c.querySelectorAll(s.badge)].find(el => el.textContent.includes('bought'));
        const images = [...new Set([...c.querySelectorAll('img')].map(i => i.src).filter(Boolean))];
        return {
          title:  img?.alt || c.querySelector('h2 span')?.textContent?.trim() || '',
          href:   a?.href || '',
          price:  c.querySelector(s.price)?.textContent?.trim() || '',
          rating: c.querySelector(s.rating)?.textContent?.trim() || '',
          review: c.querySelector(s.review)?.textContent?.trim() || '',
          badge:  badge?.textContent?.trim() || '',
          images,
        };
      }), SEL
    );
    if (!rows.length) break;

    for (const r of rows) {
      if (collected.length >= MAX_ITEMS) break;
      const url = abs(r.href, 'https://www.amazon.in');
      if (!url || isHomepage(url) || !r.title) continue;
      collected.push(buildRecord('amazon.in', keyword, {
        title: r.title, url, priceText: r.price, ratingText: r.rating,
        reviewText: r.review, badgeText: r.badge, imageUrls: r.images,
      }));
    }
    pageNum++;
    await page.waitForTimeout(600 + Math.random() * 400);
  }

  // Pre-fill fabric type from titles and initialize detail fields
  for (const rec of collected) {
    rec.fabric_type = extractFabricFromTitle(rec.product_title);
    rec.size_chart = null;
    rec.nursing_label = null;
  }

  // Enrich from detail pages
  await enrichAmazonDetails(page, collected);
}
