// Local Playwright scraper for ladies-nighty B2B evidence.
// Sources: Amazon.in, Myntra, Meesho, IndiaMART.
// Writes evidence/<source>/<slug(keyword)>.json. No homepage URLs. No fabricated fields.

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- args ----------
const argv = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

const ALL_SOURCES = ['amazon', 'myntra', 'meesho', 'indiamart'];
const sources = (argv.sources ? String(argv.sources).split(',') : ALL_SOURCES)
  .map(s => s.trim().toLowerCase())
  .filter(s => ALL_SOURCES.includes(s));

const MAX_PER_KEYWORD = Number(argv.max ?? 10);
const HEADFUL = Boolean(argv.headful);

const keywordsPath = path.join(__dirname, 'keywords.json');
const defaultKeywords = JSON.parse(await fs.readFile(keywordsPath, 'utf8'));
const keywords = argv.keywords
  ? String(argv.keywords).split(',').map(k => k.trim()).filter(Boolean)
  : defaultKeywords;

const evidenceDir = path.join(__dirname, 'evidence');
await fs.mkdir(evidenceDir, { recursive: true });

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- helpers ----------
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36';

async function makeContext(source) {
  const userDataDir = path.join(__dirname, 'user-data', source);
  await fs.mkdir(userDataDir, { recursive: true });
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: !HEADFUL,
    userAgent: UA,
    viewport: { width: 1366, height: 900 },
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  return ctx;
}

async function safeText(loc) {
  try { return (await loc.first().innerText({ timeout: 1500 })).trim(); }
  catch { return ''; }
}
async function safeAttr(loc, attr) {
  try { return (await loc.first().getAttribute(attr, { timeout: 1500 })) || ''; }
  catch { return ''; }
}

function abs(url, base) {
  if (!url) return '';
  try { return new URL(url, base).toString(); } catch { return ''; }
}

function isHomepage(url) {
  try {
    const u = new URL(url);
    return u.pathname === '/' || u.pathname === '';
  } catch { return true; }
}

// ---------- per-source scrapers ----------

async function scrapeAmazon(page, keyword) {
  const url = `https://www.amazon.in/s?k=${encodeURIComponent(keyword)}&i=apparel`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);
  // detect captcha
  if ((await page.title()).toLowerCase().includes('robot') ||
      (await page.locator('form[action*="validateCaptcha"]').count())) {
    return { blocked: true, items: [] };
  }
  const cards = page.locator('div.s-result-item[data-asin]:not([data-asin=""])');
  const n = Math.min(await cards.count(), MAX_PER_KEYWORD);
  const items = [];
  for (let i = 0; i < n; i++) {
    const c = cards.nth(i);
    // Title: image alt is the most reliable (h2 holds brand only on new layout)
    let title = await safeAttr(c.locator('img.s-image'), 'alt');
    if (!title) title = await safeText(c.locator('h2.a-size-base-plus span'));
    if (!title) title = await safeText(c.locator('h2 span'));
    const href = await safeAttr(c.locator('a.a-link-normal').first(), 'href');
    const productUrl = abs(href, 'https://www.amazon.in');
    if (!title || !productUrl || isHomepage(productUrl)) continue;
    const price = await safeText(c.locator('.a-price .a-offscreen'));
    const rating = await safeText(c.locator('span.a-icon-alt'));
    const reviews = await safeText(c.locator('span[aria-label$="ratings"], a span.a-size-base.s-underline-text'));
    const image = await safeAttr(c.locator('img.s-image'), 'src');
    items.push({
      source: 'amazon',
      keyword,
      title,
      url: productUrl,
      price,
      rating,
      review_count: reviews,
      image,
    });
  }
  return { blocked: false, items };
}

async function scrapeMyntra(page, keyword) {
  const url = `https://www.myntra.com/${encodeURIComponent(keyword.replace(/\s+/g, '-'))}?rawQuery=${encodeURIComponent(keyword)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3500);
  if (await page.locator('text=Access Denied').count()) {
    return { blocked: true, items: [] };
  }
  const cards = page.locator('li.product-base');
  const n = Math.min(await cards.count(), MAX_PER_KEYWORD);
  const items = [];
  for (let i = 0; i < n; i++) {
    const c = cards.nth(i);
    const brand = await safeText(c.locator('h3.product-brand'));
    const name = await safeText(c.locator('h4.product-product'));
    const title = [brand, name].filter(Boolean).join(' - ');
    const href = await safeAttr(c.locator('a'), 'href');
    const productUrl = abs(href, 'https://www.myntra.com');
    if (!title || !productUrl || isHomepage(productUrl)) continue;
    const price = await safeText(c.locator('.product-price'));
    const rating = await safeText(c.locator('.product-ratingsContainer span').first());
    const reviews = await safeText(c.locator('.product-ratingsCount'));
    const image = await safeAttr(c.locator('img.img-responsive, picture img'), 'src');
    items.push({
      source: 'myntra',
      keyword,
      title,
      url: productUrl,
      price,
      rating,
      review_count: reviews,
      image,
    });
  }
  return { blocked: false, items };
}

async function scrapeMeesho(page, keyword) {
  const url = `https://www.meesho.com/search?q=${encodeURIComponent(keyword)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3500);
  // Meesho lazy-loads; scroll a bit
  await page.mouse.wheel(0, 2500);
  await page.waitForTimeout(1500);
  const cards = page.locator('a[href*="/p/"]');
  const n = Math.min(await cards.count(), MAX_PER_KEYWORD);
  const items = [];
  const seen = new Set();
  for (let i = 0; i < await cards.count() && items.length < n; i++) {
    const c = cards.nth(i);
    const href = await safeAttr(c, 'href');
    const productUrl = abs(href, 'https://www.meesho.com');
    if (!productUrl || isHomepage(productUrl) || seen.has(productUrl)) continue;
    seen.add(productUrl);
    const title = await safeText(c.locator('p').first());
    const price = await safeText(c.locator('h5'));
    const rating = await safeText(c.locator('span:has-text(".")').first());
    const reviews = await safeText(c.locator('span:has-text("Reviews"), span:has-text("ratings")'));
    const image = await safeAttr(c.locator('img'), 'src');
    if (!title) continue;
    items.push({
      source: 'meesho',
      keyword,
      title,
      url: productUrl,
      price,
      rating,
      review_count: reviews,
      image,
    });
  }
  return { blocked: false, items };
}

async function scrapeIndiamart(page, keyword) {
  const url = `https://dir.indiamart.com/search.mp?ss=${encodeURIComponent(keyword)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);
  // Close login modal if present
  try { await page.locator('button:has-text("X"), .close, [aria-label="Close"]').first().click({ timeout: 1500 }); } catch {}
  const cards = page.locator('.card, .lst, .prd, [class*="cardlinks"]');
  const items = [];
  const seen = new Set();
  // Fallback: collect via product anchor pattern
  const anchors = page.locator('a[href*="indiamart.com/proddetail"], a[href*="/proddetail/"]');
  const an = await anchors.count();
  for (let i = 0; i < an && items.length < MAX_PER_KEYWORD; i++) {
    const a = anchors.nth(i);
    const href = await safeAttr(a, 'href');
    const productUrl = abs(href, 'https://www.indiamart.com');
    if (!productUrl || isHomepage(productUrl) || seen.has(productUrl)) continue;
    seen.add(productUrl);
    const title = (await safeText(a)) || (await safeAttr(a, 'title'));
    if (!title) continue;
    // climb to parent card to fetch price
    const parent = a.locator('xpath=ancestor::*[self::div or self::li][1]');
    let price = await safeText(parent.locator('p:has-text("₹"), .price, [class*="price"]'));
    // IndiaMART encodes the price in the URL as prv:NNN — use it as fallback
    if (!price) {
      const m = productUrl.match(/prv:(\d+)/);
      if (m) price = `₹${m[1]} (approx, from listing meta)`;
    }
    const image = await safeAttr(parent.locator('img'), 'src');
    items.push({
      source: 'indiamart',
      keyword,
      title: title.replace(/\s+/g, ' ').trim(),
      url: productUrl,
      price,
      rating: '',
      review_count: '',
      image,
    });
  }
  return { blocked: false, items };
}

const SCRAPERS = {
  amazon: scrapeAmazon,
  myntra: scrapeMyntra,
  meesho: scrapeMeesho,
  indiamart: scrapeIndiamart,
};

// ---------- main ----------
const summary = { startedAt: new Date().toISOString(), runs: [] };

for (const source of sources) {
  console.log(`\n=== ${source.toUpperCase()} ===`);
  const ctx = await makeContext(source);
  const page = await ctx.newPage();
  const outDir = path.join(evidenceDir, source);
  await fs.mkdir(outDir, { recursive: true });

  for (const keyword of keywords) {
    const tag = `[${source}] "${keyword}"`;
    try {
      const { blocked, items } = await SCRAPERS[source](page, keyword);
      if (blocked) {
        console.log(`${tag} BLOCKED (CAPTCHA / access denied). Re-run with --headful to solve once.`);
        summary.runs.push({ source, keyword, blocked: true, count: 0 });
      } else {
        const file = path.join(outDir, `${slug(keyword)}.json`);
        await fs.writeFile(file, JSON.stringify(items, null, 2));
        console.log(`${tag} ${items.length} items -> ${path.relative(__dirname, file)}`);
        summary.runs.push({ source, keyword, blocked: false, count: items.length });
      }
    } catch (e) {
      console.log(`${tag} ERROR: ${e.message}`);
      summary.runs.push({ source, keyword, error: e.message, count: 0 });
    }
    await page.waitForTimeout(1200 + Math.random() * 1500);
  }

  await ctx.close();
}

summary.finishedAt = new Date().toISOString();
await fs.writeFile(path.join(evidenceDir, '_summary.json'), JSON.stringify(summary, null, 2));
console.log(`\nDone. Summary: ${path.relative(__dirname, path.join(evidenceDir, '_summary.json'))}`);
