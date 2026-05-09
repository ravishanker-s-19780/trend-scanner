import { enc, abs, isHomepage } from '../utils.js';
import { buildRecord }          from '../inference.js';
import { MAX_ITEMS }            from '../config.js';

const SEL = {
  card:    'a[href*="/p/"]',
  title:   'p',
  price:   'h5, span[class*="price"]',
  rating:  'span[class*="Rating"]',
  blocked: 'text=Access Denied',
};

export async function scrapeMeesho(page, keyword, collected) {
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
          review: c.querySelector('span')?.textContent?.match(/\d+\s*(Reviews|ratings)/i)?.[0] || '',
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
        reviewText: r.review, badgeText: '', imageUrls: r.images,
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
}
