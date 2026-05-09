import { enc, abs, isHomepage } from '../utils.js';
import { buildRecord }          from '../inference.js';
import { MAX_ITEMS }            from '../config.js';

const SEL = {
  card:    'div.item.rilrtl-products-list__item',
  link:    'a',
  name:    'div.nameCls, div[class*="name"]',
  price:   'span.price strong, div.price, span[class*="price"]',
  rating:  'span.review, div[class*="rating"]',
  blocked: 'text=Access Denied, text=Forbidden',
};

export async function scrapeAjio(page, keyword, collected) {
  await page.goto(`https://www.ajio.com/search/?text=${enc(keyword)}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector(SEL.card, { timeout: 10000 }).catch(() => {});
  if (await page.locator(SEL.blocked).count()) return 'blocked';

  while (collected.length < MAX_ITEMS) {
    const rows = await page.evaluate((s) =>
      [...document.querySelectorAll(s.card)].map(c => {
        const a = c.querySelector(s.link);
        const images = [...new Set([...c.querySelectorAll('img')].map(i => i.src || i.getAttribute('data-src')).filter(Boolean))];
        return {
          href:   a?.href || '',
          title:  c.querySelector(s.name)?.textContent?.trim() || '',
          price:  c.querySelector(s.price)?.textContent?.trim() || '',
          rating: c.querySelector(s.rating)?.textContent?.trim() || '',
          images,
        };
      }), SEL
    );

    const seen = new Set(collected.map(p => p.product_url));
    for (const r of rows) {
      if (collected.length >= MAX_ITEMS) break;
      const url = abs(r.href, 'https://www.ajio.com');
      if (!url || isHomepage(url) || seen.has(url) || !r.title) continue;
      seen.add(url);
      collected.push(buildRecord('ajio.com', keyword, {
        title: r.title, url, priceText: r.price, ratingText: r.rating,
        reviewText: '', badgeText: '', imageUrls: r.images,
      }));
    }
    if (collected.length >= MAX_ITEMS) break;

    const prevCount = rows.length;
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(2000);
    const newCount = await page.locator(SEL.card).count();
    if (newCount <= prevCount) break;
  }
}
