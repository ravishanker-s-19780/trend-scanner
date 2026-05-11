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

      // Try to detect and click size chart button
      let sizeChartFound = false;
      const sizeChartSelectors = [
        '#size-chart-button',
        '[data-a-modal*="size"]',
        'button[aria-label*="size" i]',
        'a[href*="sizeguide"]'
      ];

      for (const selector of sizeChartSelectors) {
        try {
          const btns = page.locator(selector);
          const count = await btns.count();
          if (count > 0) {
            sizeChartFound = true;
            try {
              await btns.first().click();
              await page.waitForTimeout(1000);
            } catch (e) {
              // Click failed, but button exists
            }
            break;
          }
        } catch (e) {
          // Selector doesn't exist
        }
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
          // Look for any visible modal/dialog
          let modal = null;
          const allDialogs = [...document.querySelectorAll('[role="dialog"], [class*="popover"], [class*="modal"]')];

          // Find the one that's actually visible and might contain size chart
          for (const dialog of allDialogs) {
            const style = window.getComputedStyle(dialog);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
              const text = dialog.textContent.toLowerCase();
              if (text.includes('size') || text.includes('measurement')) {
                modal = dialog;
                break;
              }
            }
          }

          // If no modal found, try specific selectors
          if (!modal) {
            modal = document.querySelector('#a-popover-content-1') ||
                   document.querySelector('[id*="size"][role="dialog"]') ||
                   document.querySelector('#sizeChartDiv') ||
                   document.querySelector('[class*="size-chart"]');
          }

          if (!modal) return null;

          // Try to find image in modal
          const allImages = [...modal.querySelectorAll('img')];
          let modalImage = allImages.find(img => {
            const src = img.src.toLowerCase();
            const alt = img.alt.toLowerCase();
            return src.includes('size') || src.includes('chart') || alt.includes('size') || alt.includes('chart');
          }) || allImages[0];

          if (!modalImage || !modalImage.src) return null;

          const imageUrl = modalImage.src;
          const rows = [];

          // Try to extract table data from the modal
          const table = modal.querySelector('table');
          if (table) {
            const headerRow = table.querySelector('tr');
            const headerCells = headerRow ? [...headerRow.querySelectorAll('th, td')].map(c => c.textContent.trim().toLowerCase()) : [];
            const dataRows = [...table.querySelectorAll('tr')].slice(1);

            for (const tr of dataRows) {
              const cells = [...tr.querySelectorAll('td, th')];
              if (cells.length >= 2) {
                const row = { size: cells[0]?.textContent.trim() };
                for (let i = 1; i < cells.length; i++) {
                  const header = headerCells[i] || '';
                  const value = cells[i]?.textContent.trim();
                  if (header.includes('bust') || header.includes('chest')) {
                    if (header.includes('in')) row.chest_in = value;
                    else if (header.includes('cm')) row.chest_cm = value;
                  } else if (header.includes('length')) {
                    if (header.includes('in')) row.length_in = value;
                    else if (header.includes('cm')) row.length_cm = value;
                  }
                }
                if (Object.keys(row).length > 1) rows.push(row);
              }
            }
          }

          return imageUrl ? { image_url: imageUrl, rows } : null;
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
