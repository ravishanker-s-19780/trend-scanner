import { enc, abs, isHomepage } from '../utils.js';
import { buildRecord }          from '../inference.js';
import { MAX_ITEMS }            from '../config.js';

const SEL = {
  card:    'div.product-item, li[class*="product"]',
  title:   'a[class*="name"], p[class*="name"], h3',
  price:   'span[class*="price"]',
  // "4.8  <span>(349)</span>" — rating and review in one widget
  ratingWidget: 'div.custom-rating-result',
};

export async function scrapeShyaway(page, keyword, collected) {
  let pageNum = 1;
  while (collected.length < MAX_ITEMS) {
    await page.goto(`https://www.shyaway.com/search/?q=${enc(keyword)}&page=${pageNum}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector(SEL.card, { timeout: 8000 }).catch(() => {});

    const rows = await page.evaluate((s) =>
      [...document.querySelectorAll(s.card)].map(c => {
        const a      = c.querySelector('a');
        const widget = c.querySelector(s.ratingWidget);
        // rating: first text node before the span, e.g. "4.8"
        const rating = widget
          ? [...widget.childNodes].find(n => n.nodeType === 3)?.textContent?.trim() || ''
          : '';
        // review: span text inside the widget, e.g. "(349)"
        const review = widget?.querySelector('span')?.textContent?.trim() || '';
        const images = [...new Set(
          [...c.querySelectorAll('img')].map(i => i.src || i.getAttribute('data-src')).filter(Boolean)
        )];
        return {
          href:   a?.href || '',
          title:  c.querySelector(s.title)?.textContent?.trim() || '',
          price:  c.querySelector(s.price)?.textContent?.trim() || '',
          rating,
          review,
          images,
        };
      }), SEL
    );
    if (!rows.length) break;

    for (const r of rows) {
      if (collected.length >= MAX_ITEMS) break;
      const url = abs(r.href, 'https://www.shyaway.com');
      if (!url || isHomepage(url) || !r.title) continue;
      collected.push(buildRecord('shyaway.com', keyword, {
        title: r.title, url, priceText: r.price, ratingText: r.rating,
        reviewText: r.review, badgeText: '', imageUrls: r.images,
      }));
    }
    pageNum++;
    await page.waitForTimeout(700);
  }
}
