import { enc, abs, isHomepage } from '../utils.js';
import { buildRecord }          from '../inference.js';
import { MAX_ITEMS }            from '../config.js';

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

}
