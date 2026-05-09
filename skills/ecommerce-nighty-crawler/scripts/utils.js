import { createHash } from 'node:crypto';

export const enc = s => encodeURIComponent(s);

export function productId(domain, url) {
  try   { const u = new URL(url); return createHash('sha256').update(domain + u.origin + u.pathname).digest('hex').slice(0, 12); }
  catch { return createHash('sha256').update(domain + url).digest('hex').slice(0, 12); }
}

export function isHomepage(url) {
  try { const u = new URL(url); return u.pathname === '/' || u.pathname === ''; } catch { return true; }
}

export function abs(href, base) {
  if (!href) return '';
  try { return new URL(href, base).toString(); } catch { return ''; }
}

export function parsePrice(t) {
  const m = (t || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

export function parseRating(t) {
  const m = (t || '').match(/\d+(?:\.\d+)?/);
  const v = m ? parseFloat(m[0]) : null;
  return v && v <= 5 ? v : null;
}

export function parseCount(t) {
  if (!t) return null;
  const k = (t || '').match(/([\d.]+)\s*[Kk]\+?/);
  if (k) return Math.round(parseFloat(k[1]) * 1000);
  const m = t.replace(/,/g, '').match(/\d+/);
  return m ? parseInt(m[0]) : null;
}

// detailSel: { rating: string|null, review: string|null }
//   Pass confirmed CSS selectors, or null to use generic leaf-text scan.
//   Generic rating scan: any leaf element whose full text is X.X (decimal, 1–5).
//   Generic review scan: any leaf element matching "\d+ (rating|review)".
export async function enrichDetails(page, records, detailSel) {
  const needs = records.filter(r => r.rating === null || r.review_count === null);
  if (!needs.length) return;

  for (const record of needs) {
    try {
      await page.goto(record.product_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1500);

      const extracted = await page.evaluate((s) => {
        const get = sel => sel ? document.querySelector(sel)?.textContent?.trim() || '' : '';

        // Generic scan: walk all leaf text nodes
        const leaves = [...document.querySelectorAll('*')]
          .filter(e => e.childElementCount === 0 && e.textContent.trim())
          .map(e => e.textContent.trim());

        const ratingText = get(s.rating) ||
          leaves.find(t => /^[1-5]\.[0-9]$/.test(t)) || '';   // must have decimal to avoid false positives

        const reviewText = get(s.review) ||
          leaves.find(t => /\d[\d,]*\s*(global )?(rating|review)/i.test(t)) ||
          leaves.find(t => /^\|\s*\d+$/.test(t)) ||   // Flipkart detail: "| 12"
          '';

        return { ratingText, reviewText };
      }, detailSel);

      if (record.rating === null)       record.rating       = parseRating(extracted.ratingText);
      if (record.review_count === null) record.review_count = parseCount(extracted.reviewText);
    } catch {
      // keep nulls — don't crash the crawl
    }
    await page.waitForTimeout(400);
  }
}
