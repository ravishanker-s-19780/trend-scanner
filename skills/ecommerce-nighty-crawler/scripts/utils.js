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
