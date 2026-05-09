import { enc, abs, isHomepage } from '../utils.js';
import { buildRecord }          from '../inference.js';
import { MAX_ITEMS }            from '../config.js';

const SEL = {
  card:    'div.s-result-item[data-asin]:not([data-asin=""])',
  image:   'img.s-image',
  link:    'a.a-link-normal',
  price:   '.a-price .a-offscreen',
  rating:  'span.a-icon-alt',
  review:  'a[href*="customerReviews"] span',   // returns "(1,234)" — parseCount strips parens
  badge:   'span.a-size-base',                  // filter by "bought" text in evaluate
  captcha: 'form[action*="validateCaptcha"]',
};

export async function scrapeAmazon(page, keyword, collected) {
  let pageNum = 1;
  while (collected.length < MAX_ITEMS) {
    await page.goto(`https://www.amazon.in/s?k=${enc(keyword)}&i=apparel&page=${pageNum}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1000);
    if ((await page.title()).toLowerCase().includes('robot') ||
        await page.locator(SEL.captcha).count()) return 'blocked';

    const rows = await page.evaluate((s) =>
      [...document.querySelectorAll(s.card)].map(c => {
        const img   = c.querySelector(s.image);
        const a     = c.querySelector(s.link);
        const badge = [...c.querySelectorAll(s.badge)].find(el => el.textContent.includes('bought'));
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
}
