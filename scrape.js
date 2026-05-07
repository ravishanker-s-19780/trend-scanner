import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- CLI args ----------
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
const SKIP_IMAGES = argv.images === 'false';

const keywordsPath = path.join(__dirname, 'keywords.json');
const defaultKeywords = JSON.parse(await fs.readFile(keywordsPath, 'utf8'));
const keywords = argv.keywords
  ? String(argv.keywords).split(',').map(k => k.trim()).filter(Boolean)
  : defaultKeywords;

const evidenceDir = path.join(__dirname, 'evidence');
await fs.mkdir(evidenceDir, { recursive: true });

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36';

const PLATFORM_MAP = {
  amazon: 'amazon.in',
  myntra: 'myntra.com',
  meesho: 'meesho.com',
  indiamart: 'indiamart.com',
};

// ---------- URL helpers ----------
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    const remove = ['ref', 'tag', 'utm_source', 'utm_medium', 'utm_campaign',
      'dib', 'dib_tag', 'qid', 'sr', 'keywords', 'rawQuery', 'smid', 'pf_rd_p',
      'pf_rd_r', 'sprefix', 'crid'];
    remove.forEach(p => u.searchParams.delete(p));
    return u.origin.toLowerCase() + u.pathname;
  } catch { return url; }
}

function productId(platform, url) {
  return createHash('sha256').update(platform + normalizeUrl(url)).digest('hex').slice(0, 12);
}

function isHomepage(url) {
  try { const u = new URL(url); return u.pathname === '/' || u.pathname === ''; }
  catch { return true; }
}

function abs(url, base) {
  if (!url) return '';
  try { return new URL(url, base).toString(); } catch { return ''; }
}

// ---------- Field parsers ----------
function parsePrice(text) {
  if (!text) return null;
  const m = text.replace(/,/g, '').match(/[\d]+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function parseRating(text) {
  if (!text) return null;
  const m = text.match(/[\d]+(?:\.\d+)?/);
  const v = m ? parseFloat(m[0]) : null;
  return v && v <= 5 ? v : null;
}

function parseCount(text) {
  if (!text) return null;
  const cleaned = text.replace(/,/g, '').replace(/[()]/g, '').trim();
  const m = cleaned.match(/\d+/);
  return m ? parseInt(m[0]) : null;
}

// ---------- Inference ----------
const CLOTH_SYNONYMS = {
  '100% cotton': 'Cotton', 'pure cotton': 'Cotton', 'cotton': 'Cotton',
  'silk': 'Silk', 'silky': 'Silk',
  'linen': 'Linen',
  'polyester': 'Polyester',
  'rayon': 'Rayon', 'viscose': 'Rayon',
  'satin': 'Satin',
  'bamboo': 'Bamboo',
  'blend': 'Blend', 'poly-cotton': 'Blend', 'polycotton': 'Blend',
};

function inferClothType(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  // Longest-match first (prevents 'cotton' matching before 'poly-cotton')
  const sorted = Object.entries(CLOTH_SYNONYMS).sort((a, b) => b[0].length - a[0].length);
  for (const [kw, type] of sorted) {
    if (lower.includes(kw)) return type;
  }
  return null;
}

const DESIGN_KEYWORDS = [
  ['floral print', 'Floral Print'], ['floral', 'Floral Print'], ['flower', 'Floral Print'],
  ['botanical', 'Floral Print'], ['rose', 'Floral Print'], ['leaf', 'Floral Print'],
  ['embroidered', 'Embroidered'], ['embroidery', 'Embroidered'],
  ['striped', 'Striped'], ['stripe', 'Striped'],
  ['checked', 'Checked'], ['checks', 'Checked'], ['plaid', 'Checked'],
  ['geometric', 'Geometric'],
  ['lace', 'Lace'],
  ['solid', 'Solid'],
  ['plain', 'Plain'],
];

function inferDesignName(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [kw, design] of DESIGN_KEYWORDS) {
    if (lower.includes(kw)) return design;
  }
  // Generic "printed" without specifying type — leave as null (unknown print type)
  return null;
}

const WEDDING_KWS = ['wedding', 'bridal', 'bride', 'marriage', 'honeymoon', 'engagement', 'bridal-shower'];
const PURPOSE_KWS = [
  ['wedding', 'wedding'], ['bridal', 'wedding'], ['bride', 'wedding'],
  ['marriage', 'wedding'], ['honeymoon', 'wedding'], ['engagement', 'wedding'],
  ['maternity', 'maternity'], ['nursing', 'maternity'], ['postpartum', 'maternity'],
  ['feeding', 'maternity'], ['pregnancy', 'maternity'],
  ['gift', 'gift'],
];

function inferPurchaseContext(text) {
  const lower = (text || '').toLowerCase();
  const purposes = new Set();
  const weddingRel = WEDDING_KWS.some(kw => lower.includes(kw));
  const tags = WEDDING_KWS.filter(kw => lower.includes(kw));
  for (const [kw, purpose] of PURPOSE_KWS) {
    if (lower.includes(kw)) purposes.add(purpose);
  }
  if (purposes.size === 0) purposes.add('casual');
  return {
    purpose_of_purchase: [...purposes],
    wedding_relevant: weddingRel,
    occasion_tags: [...new Set(tags)],
  };
}

// ---------- Image base64 ----------
async function fetchBase64(imageUrl, page) {
  if (!imageUrl || SKIP_IMAGES) return null;
  try {
    return await page.evaluate(async (url) => {
      try {
        const resp = await fetch(url, { mode: 'cors' });
        if (!resp.ok) return null;
        const buf = await resp.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        const ct = resp.headers.get('content-type') || 'image/jpeg';
        return `data:${ct};base64,${btoa(bin)}`;
      } catch { return null; }
    }, imageUrl);
  } catch { return null; }
}

// ---------- Browser context ----------
async function makeContext(source) {
  const userDataDir = path.join(__dirname, 'user-data', source);
  await fs.mkdir(userDataDir, { recursive: true });
  return chromium.launchPersistentContext(userDataDir, {
    headless: !HEADFUL,
    userAgent: UA,
    viewport: { width: 1366, height: 900 },
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    args: ['--disable-blink-features=AutomationControlled'],
  });
}

async function safeText(loc) {
  try { return (await loc.first().innerText({ timeout: 1500 })).trim(); } catch { return ''; }
}
async function safeAttr(loc, attr) {
  try { return (await loc.first().getAttribute(attr, { timeout: 1500 })) || ''; } catch { return ''; }
}

// ---------- Build compliant product record ----------
async function buildProduct(source, raw, page) {
  const { title, url, priceText, ratingText, reviewCountText, imageUrl, imageAlt, purchaseBadge, keyword } = raw;
  const platform = PLATFORM_MAP[source];
  const now = new Date().toISOString();
  const price = parsePrice(priceText);
  const avgRating = parseRating(ratingText);
  const reviewCount = parseCount(reviewCountText);
  const clothType = inferClothType(title);
  const designName = inferDesignName(title);
  const purchaseContext = inferPurchaseContext(title + ' ' + keyword);

  // Parse purchase badge: "500+ bought in past month" / "1K+ bought"
  let recentCount = null;
  let recentLabel = null;
  let maxPurchased = null;
  if (purchaseBadge) {
    recentLabel = purchaseBadge.trim();
    const m = purchaseBadge.replace(/[Kk]/, '000').match(/([\d,]+)\+?\s*(?:bought|sold)/i);
    if (m) {
      recentCount = parseInt(m[1].replace(/,/g, ''));
      maxPurchased = recentCount;
    }
  }

  const base64 = await fetchBase64(imageUrl, page);

  return {
    product_id: productId(platform, url),
    platform,
    keyword,
    product_title: title,
    product_url: url,
    price,
    cloth_type: clothType,
    design_name: designName,
    reviews: {
      count: reviewCount,
      average_rating: avgRating,
      details: [],
    },
    purchase_metrics: {
      max_purchased: maxPurchased,
      recent_purchase_count: recentCount,
      recent_purchase_label: recentLabel,
      total_sold: null,
    },
    purchaser_profile: {
      purchaser_name: null,
      primary_location: null,
      age_range: null,
      repeat_purchase_rate: null,
      purchase_frequency: null,
    },
    purchase_context: purchaseContext,
    media: {
      images: imageUrl ? [{
        url: imageUrl,
        base64,
        alt_text: imageAlt || title,
        width: null,
        height: null,
      }] : [],
      videos: [],
    },
    crawl_metadata: {
      crawl_sequence: 1,
      times_seen: 1,
      is_new_in_this_run: true,
      first_seen: now,
      last_updated: now,
      price_changed: false,
      previous_price: null,
      review_count_changed: false,
      previous_review_count: null,
      timestamp: now,
    },
  };
}

// ---------- Per-source scrapers ----------

async function scrapeAmazon(page, keyword) {
  const url = `https://www.amazon.in/s?k=${encodeURIComponent(keyword)}&i=apparel`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);
  if ((await page.title()).toLowerCase().includes('robot') ||
      await page.locator('form[action*="validateCaptcha"]').count()) {
    return { blocked: true, items: [] };
  }
  const cards = page.locator('div.s-result-item[data-asin]:not([data-asin=""])');
  const n = Math.min(await cards.count(), MAX_PER_KEYWORD);
  const items = [];
  for (let i = 0; i < n; i++) {
    const c = cards.nth(i);
    let title = await safeAttr(c.locator('img.s-image'), 'alt');
    if (!title) title = await safeText(c.locator('h2 span'));
    const href = await safeAttr(c.locator('a.a-link-normal').first(), 'href');
    const productUrl = abs(href, 'https://www.amazon.in');
    if (!title || !productUrl || isHomepage(productUrl)) continue;

    const priceText = await safeText(c.locator('.a-price .a-offscreen'));
    const ratingText = await safeText(c.locator('span.a-icon-alt'));
    const reviewCountText = await safeText(c.locator('span[aria-label$="ratings"], a span.a-size-base.s-underline-text'));
    const imageUrl = await safeAttr(c.locator('img.s-image'), 'src');
    const imageAlt = await safeAttr(c.locator('img.s-image'), 'alt') || title;
    // Purchase badge: "500+ bought in past month"
    const purchaseBadge = await safeText(
      c.locator('.a-row:has-text("bought in past month") span.a-color-secondary, .a-row:has-text("bought in past month") span.a-size-base, span[aria-label*="bought in past month"]').first()
    ) || await safeText(c.locator('[data-component-type="s-best-seller-badge"] .a-badge-text'));

    const product = await buildProduct('amazon', {
      title, url: productUrl, priceText, ratingText, reviewCountText,
      imageUrl, imageAlt, purchaseBadge, keyword,
    }, page);
    items.push(product);
  }
  return { blocked: false, items };
}

async function scrapeMyntra(page, keyword) {
  const url = `https://www.myntra.com/${encodeURIComponent(keyword.replace(/\s+/g, '-'))}?rawQuery=${encodeURIComponent(keyword)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3500);
  if (await page.locator('text=Access Denied').count()) return { blocked: true, items: [] };

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

    const priceText = await safeText(c.locator('.product-price'));
    const ratingText = await safeText(c.locator('.product-ratingsContainer span').first());
    const reviewCountText = await safeText(c.locator('.product-ratingsCount'));
    const imageUrl = await safeAttr(c.locator('img.img-responsive, picture img'), 'src');

    const product = await buildProduct('myntra', {
      title, url: productUrl, priceText, ratingText, reviewCountText,
      imageUrl, imageAlt: title, purchaseBadge: null, keyword,
    }, page);
    items.push(product);
  }
  return { blocked: false, items };
}

async function scrapeMeesho(page, keyword) {
  const url = `https://www.meesho.com/search?q=${encodeURIComponent(keyword)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3500);
  await page.mouse.wheel(0, 2500);
  await page.waitForTimeout(1500);

  const cards = page.locator('a[href*="/p/"]');
  const seen = new Set();
  const items = [];
  for (let i = 0; i < await cards.count() && items.length < MAX_PER_KEYWORD; i++) {
    const c = cards.nth(i);
    const href = await safeAttr(c, 'href');
    const productUrl = abs(href, 'https://www.meesho.com');
    if (!productUrl || isHomepage(productUrl) || seen.has(productUrl)) continue;
    seen.add(productUrl);
    const title = await safeText(c.locator('p').first());
    const priceText = await safeText(c.locator('h5'));
    const ratingText = await safeText(c.locator('span:has-text(".")').first());
    const reviewCountText = await safeText(c.locator('span:has-text("Reviews"), span:has-text("ratings")'));
    const imageUrl = await safeAttr(c.locator('img'), 'src');
    if (!title) continue;

    const product = await buildProduct('meesho', {
      title, url: productUrl, priceText, ratingText, reviewCountText,
      imageUrl, imageAlt: title, purchaseBadge: null, keyword,
    }, page);
    items.push(product);
  }
  return { blocked: false, items };
}

async function scrapeIndiamart(page, keyword) {
  const url = `https://dir.indiamart.com/search.mp?ss=${encodeURIComponent(keyword)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);
  try { await page.locator('button:has-text("X"), .close, [aria-label="Close"]').first().click({ timeout: 1500 }); } catch {}

  const anchors = page.locator('a[href*="indiamart.com/proddetail"], a[href*="/proddetail/"]');
  const seen = new Set();
  const items = [];
  for (let i = 0; i < await anchors.count() && items.length < MAX_PER_KEYWORD; i++) {
    const a = anchors.nth(i);
    const href = await safeAttr(a, 'href');
    const productUrl = abs(href, 'https://www.indiamart.com');
    if (!productUrl || isHomepage(productUrl) || seen.has(productUrl)) continue;
    seen.add(productUrl);
    const title = (await safeText(a)) || (await safeAttr(a, 'title'));
    if (!title) continue;
    const parent = a.locator('xpath=ancestor::*[self::div or self::li][1]');
    let priceText = await safeText(parent.locator('p:has-text("₹"), .price, [class*="price"]'));
    if (!priceText) {
      const m = productUrl.match(/prv:(\d+)/);
      if (m) priceText = `₹${m[1]}`;
    }
    const imageUrl = await safeAttr(parent.locator('img'), 'src');

    const product = await buildProduct('indiamart', {
      title: title.replace(/\s+/g, ' ').trim(), url: productUrl, priceText,
      ratingText: '', reviewCountText: '', imageUrl, imageAlt: title,
      purchaseBadge: null, keyword,
    }, page);
    items.push(product);
  }
  return { blocked: false, items };
}

const SCRAPERS = { amazon: scrapeAmazon, myntra: scrapeMyntra, meesho: scrapeMeesho, indiamart: scrapeIndiamart };

// ---------- Dedup index + crawl log ----------
const dedupIndexPath = path.join(evidenceDir, '_dedup_index.json');
const crawlLogPath = path.join(evidenceDir, '_crawl_log.json');

let dedupIndex = {};
try { dedupIndex = JSON.parse(await fs.readFile(dedupIndexPath, 'utf8')); } catch {}
let crawlLog = { runs: [] };
try { crawlLog = JSON.parse(await fs.readFile(crawlLogPath, 'utf8')); } catch {}

// ---------- Main ----------
const runStart = new Date().toISOString();
const summary = { startedAt: runStart, runs: [] };
const crawlRun = { startedAt: runStart, sources, keywords, results: [] };

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
        console.log(`${tag} BLOCKED. Re-run with --headful to solve once.`);
        summary.runs.push({ source, keyword, blocked: true, count: 0 });
        continue;
      }

      const jsonlPath = path.join(outDir, `${slug(keyword)}.jsonl`);

      // Load existing records for dedup comparison
      let existingById = {};
      try {
        const lines = (await fs.readFile(jsonlPath, 'utf8')).trim().split('\n').filter(Boolean);
        for (const line of lines) {
          try { const r = JSON.parse(line); existingById[r.product_id] = r; } catch {}
        }
      } catch {}

      const toAppend = [];
      let newCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      for (const item of items) {
        const existing = existingById[item.product_id];
        if (existing) {
          const priceChanged = existing.price !== null && item.price !== null && existing.price !== item.price;
          const reviewChanged = existing.reviews?.count !== null && item.reviews?.count !== null &&
            existing.reviews.count !== item.reviews.count;
          if (!priceChanged && !reviewChanged) { skippedCount++; continue; }
          item.crawl_metadata.is_new_in_this_run = false;
          item.crawl_metadata.price_changed = priceChanged;
          item.crawl_metadata.previous_price = priceChanged ? existing.price : null;
          item.crawl_metadata.review_count_changed = reviewChanged;
          item.crawl_metadata.previous_review_count = reviewChanged ? existing.reviews?.count : null;
          item.crawl_metadata.times_seen = (existing.crawl_metadata?.times_seen ?? 1) + 1;
          item.crawl_metadata.first_seen = existing.crawl_metadata?.first_seen ?? item.crawl_metadata.first_seen;
          updatedCount++;
        } else {
          newCount++;
        }
        dedupIndex[item.product_id] = {
          platform: item.platform,
          location: `${source}/${slug(keyword)}`,
          price: item.price,
          review_count: item.reviews.count,
          crawl_metadata: item.crawl_metadata,
        };
        toAppend.push(JSON.stringify(item));
      }

      if (toAppend.length > 0) {
        await fs.appendFile(jsonlPath, toAppend.join('\n') + '\n');
      }

      const totalUnique = Object.keys(existingById).length + newCount;
      await fs.writeFile(
        path.join(outDir, `${slug(keyword)}.meta.json`),
        JSON.stringify({ keyword, platform: PLATFORM_MAP[source], totalUnique, lastCrawled: new Date().toISOString(), newThisRun: newCount, updatedThisRun: updatedCount, skippedThisRun: skippedCount }, null, 2)
      );

      console.log(`${tag} ${items.length} scraped → ${newCount} new, ${updatedCount} updated, ${skippedCount} unchanged -> ${path.relative(__dirname, jsonlPath)}`);
      summary.runs.push({ source, keyword, blocked: false, count: items.length, new: newCount, updated: updatedCount });
    } catch (e) {
      console.log(`${tag} ERROR: ${e.message}`);
      summary.runs.push({ source, keyword, error: e.message, count: 0 });
    }
    await page.waitForTimeout(1200 + Math.random() * 1500);
  }

  await ctx.close();
}

crawlRun.finishedAt = new Date().toISOString();
crawlLog.runs.push(crawlRun);

await fs.writeFile(dedupIndexPath, JSON.stringify(dedupIndex, null, 2));
await fs.writeFile(crawlLogPath, JSON.stringify(crawlLog, null, 2));

summary.finishedAt = new Date().toISOString();
await fs.writeFile(path.join(evidenceDir, '_summary.json'), JSON.stringify(summary, null, 2));
console.log(`\nDone. Summary: evidence/_summary.json`);
