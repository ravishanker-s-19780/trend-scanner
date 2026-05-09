import { enc, abs, isHomepage } from '../utils.js';
import { buildRecord }          from '../inference.js';
import { MAX_ITEMS }            from '../config.js';

// Cards: SSR inside <ul id="id_all_list">
// waitForSelector instead of networkidle — analytics pings keep network busy indefinitely
const SEL = {
  card:    '#id_all_list li[id^="id_main_li_"]',
  link:    'div.pdImg a',
  image:   'img.firstimage',
  price:   '[class*="price"], [class*="Price"]',
  rating:  '[class*="rating"], [class*="Rating"]',
};

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
        reviewText: '', badgeText: '', imageUrls: r.images,
      }));
    }
    pageNum++;
    await page.waitForTimeout(600);
  }
}
