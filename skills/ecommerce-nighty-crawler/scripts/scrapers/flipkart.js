import { enc, abs, isHomepage } from '../utils.js';
import { buildRecord }          from '../inference.js';
import { MAX_ITEMS }            from '../config.js';

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
        reviewText: r.review, badgeText: '', imageUrls: r.images,
      }));
    }
    pageNum++;
    await page.waitForTimeout(500);
  }
}
