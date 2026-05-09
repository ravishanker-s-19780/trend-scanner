import { enc, abs, isHomepage, enrichDetails } from '../utils.js';
import { buildRecord }                          from '../inference.js';
import { MAX_ITEMS }                            from '../config.js';

// Confirmed selectors via HTML inspection 2026-05
const SEL = {
  card:    'a.ProductModule__base[href*="/p-"]',
  brand:   'h3.ProductDescription__boldText',
  name:    'h2.ProductDescription__description',
  price:   'div.ProductDescription__discount h3, div.ProductDescription__priceHolder h3',
  rating:  'div[class*="rating"], span[class*="rating"]',
  review:  'span[class*="review"], span[class*="count"]',
  image:   'img.Image__actual',
  // Detail page — confirmed selectors
  detail: {
    rating: 'div.ProductDetailsMainCard__reviewElectronics',  // "5"
    review: 'span.ProductDetailsMainCard__srOnly',            // "5 Rating & 0 Review"
  },
};

export async function scrapeTatacliq(page, keyword, collected) {
  let pageNum = 1;
  while (collected.length < MAX_ITEMS) {
    await page.goto(`https://www.tatacliq.com/search/?searchCategory=all&text=${enc(keyword)}&page=${pageNum}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector(SEL.card, { timeout: 10000 }).catch(() => {});

    const rows = await page.evaluate((s) =>
      [...document.querySelectorAll(s.card)].map(c => {
        const images = [...new Set([...c.querySelectorAll('img')].map(i => i.src || i.getAttribute('data-src')).filter(Boolean))];
        return {
          href:   c.href,
          brand:  c.querySelector(s.brand)?.textContent?.trim() || '',
          name:   c.querySelector(s.name)?.textContent?.trim() || '',
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
      const url   = abs(r.href, 'https://www.tatacliq.com');
      const title = [r.brand, r.name].filter(Boolean).join(' ');
      if (!title || !url || isHomepage(url)) continue;
      collected.push(buildRecord('tatacliq.com', keyword, {
        title, url, priceText: r.price, ratingText: r.rating,
        reviewText: r.review, badgeText: '', imageUrls: r.images,
      }));
    }
    pageNum++;
    await page.waitForTimeout(800);
  }

  await enrichDetails(page, collected, SEL.detail);
}
