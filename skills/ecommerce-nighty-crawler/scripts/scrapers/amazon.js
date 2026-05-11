import { enc, abs, isHomepage } from '../utils.js';
import { buildRecord }          from '../inference.js';
import { MAX_ITEMS }            from '../config.js';

const FABRIC_KEYWORDS = [
  'cotton', 'satin', 'silk', 'crepe', 'viscose', 'rayon',
  'polyester', 'blend', 'georgette', 'chiffon', 'fleece',
  'flannel', 'modal', 'lycra', 'spandex', 'nylon'
];

const FEEDING_ZIP_KEYWORDS = [
  'feeding zip', 'front zip', 'zip front', 'zipper front', 'zipper', 'zip model'
];

const NURSING_KEYWORDS = [
  'nursing', 'breastfeeding', 'breast feeding', 'lactation', 'feeding nighty'
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

function extractNursingLabel(text) {
  const t = text.toLowerCase();
  for (const kw of FEEDING_ZIP_KEYWORDS) {
    if (t.includes(kw)) return 'Feeding Zip';
  }
  for (const kw of NURSING_KEYWORDS) {
    if (t.includes(kw)) return 'Nursing-Friendly';
  }
  return null;
}

async function enrichAmazonDetails(page, records) {
  for (const rec of records) {
    try {
      await page.goto(rec.product_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(500);

      // Try to find and click the "Size Chart" link
      let sizeChartFound = false;
      try {
        const sizeChartLink = page.locator('a:has-text("Size Chart"), button:has-text("Size Chart")');
        const count = await sizeChartLink.count();
        if (count > 0) {
          sizeChartFound = true;
          try {
            await sizeChartLink.first().click();
            // Wait for the modal table to appear
            try {
              await page.locator('[id^="a-popover-"] table').first().waitFor({ timeout: 3000 });
            } catch (waitErr) {
              // Table didn't appear, but button click was registered
            }
            await page.waitForTimeout(800);
          } catch (e) {
            // Click might fail but link exists
          }
        }
      } catch (e) {
        // Selector issue
      }

      const details = await page.evaluate((hasChartBtn) => {
        const fabricType = (() => {
          // Try material table first
          const tables = document.querySelectorAll('#productDetails_techSpec_section_1 tr');
          for (const row of tables) {
            const th = row.querySelector('th');
            const td = row.querySelector('td');
            if (th?.textContent.toLowerCase().includes('material') && td) {
              return td.textContent.trim();
            }
          }
          // Try feature bullets
          const bullets = document.querySelectorAll('#feature-bullets li span.a-list-item');
          for (const bullet of bullets) {
            const text = bullet.textContent.trim();
            if (text.toLowerCase().includes('material:') || text.toLowerCase().includes('fabric:')) {
              return text.replace(/^(material|fabric):\s*/i, '').trim();
            }
          }
          return null;
        })();

        const sizeChart = (() => {
          // Look for Amazon's dynamically-generated popover modals (a-popover-N)
          let modal = null;

          // Strategy 1: Find visible popovers with table/size info
          const popovers = [...document.querySelectorAll('[id^="a-popover-"]')];
          for (const popover of popovers) {
            const style = window.getComputedStyle(popover);
            // Check if visible
            if (style.display === 'none' || style.visibility === 'hidden' || popover.offsetHeight === 0) continue;

            // Check if it has a table (most reliable indicator)
            if (popover.querySelector('table')) {
              modal = popover;
              break;
            }

            // Otherwise check for size-related text
            const text = popover.textContent.toLowerCase();
            if (text.includes('size') && text.includes('chart')) {
              modal = popover;
              break;
            }
          }

          if (!modal) return null;

          // Extract measurement table from the modal
          const table = modal.querySelector('table');
          if (!table) return null;

          const rows = [];
          const headerRow = [...table.querySelectorAll('tr')][0];
          const headerCells = headerRow ? [...headerRow.querySelectorAll('th, td')].map(c => c.textContent.trim()) : [];

          // Parse data rows
          const dataRows = [...table.querySelectorAll('tr')].slice(1);
          for (const tr of dataRows) {
            const cells = [...tr.querySelectorAll('td, th')];
            if (cells.length < 2) continue;

            const row = {};

            // First column is usually the size
            row.size = cells[0]?.textContent.trim();

            // Parse remaining columns based on headers
            for (let i = 1; i < cells.length; i++) {
              const header = (headerCells[i] || '').toLowerCase();
              const value = cells[i]?.textContent.trim();

              if (!value) continue;

              if (header.includes('chest') || header.includes('bust')) {
                if (header.includes('(in)') || header.includes('in')) row.chest_in = value;
                else if (header.includes('(cm)') || header.includes('cm')) row.chest_cm = value;
              } else if (header.includes('waist')) {
                if (header.includes('(in)')) row.waist_in = value;
                else if (header.includes('(cm)')) row.waist_cm = value;
              } else if (header.includes('length')) {
                if (header.includes('(in)')) row.length_in = value;
                else if (header.includes('(cm)')) row.length_cm = value;
              } else if (header.includes('hip')) {
                if (header.includes('(in)')) row.hip_in = value;
                else if (header.includes('(cm)')) row.hip_cm = value;
              }
            }

            if (Object.keys(row).length > 1) rows.push(row);
          }

          // Try to find image in modal
          const img = modal.querySelector('img');
          const imageUrl = img?.src || null;

          return rows.length > 0 ? { image_url: imageUrl, rows } : null;
        })();

        const bulletText = [...document.querySelectorAll('#feature-bullets li span.a-list-item')].map(b => b.textContent).join('\n');
        const descText = document.querySelector('#productDescription')?.textContent || '';
        const fullText = bulletText + '\n' + descText;

        return { fabricType, sizeChart, hasChartButton: hasChartBtn, nursingText: fullText };
      }, sizeChartFound);

      if (!rec.fabric_type && details.fabricType) {
        rec.fabric_type = details.fabricType;
      }

      // Size chart: prefer extracted data, fallback to button presence indicator
      if (details.sizeChart && details.sizeChart.image_url) {
        rec.size_chart = details.sizeChart;
      } else if (details.hasChartButton) {
        // Button exists but we couldn't extract the image - still indicate availability
        rec.size_chart = { image_url: null, rows: [], available: true };
      }

      rec.nursing_label = extractNursingLabel(rec.product_title + '\n' + details.nursingText);

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
