/**
 * E-Commerce Nighty Crawler — one-shot, 8 platforms, 100 items each.
 *
 * CLI:
 *   node skills/ecommerce-nighty-crawler/scripts/crawler.js
 *   node skills/ecommerce-nighty-crawler/scripts/crawler.js --platforms=amazon,myntra
 *   node skills/ecommerce-nighty-crawler/scripts/crawler.js --max=50
 *   node skills/ecommerce-nighty-crawler/scripts/crawler.js --concurrency=3
 *   node skills/ecommerce-nighty-crawler/scripts/crawler.js --headful
 *   node skills/ecommerce-nighty-crawler/scripts/crawler.js --keywords="ladies nighty"
 *
 * Output: evidence/original/<platform>.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { platforms, keywords, MAX_ITEMS, CONCURRENCY, ROOT, OUT_DIR, USER_DATA } from './config.js';
import { makeContext, STEALTH_SCRIPT } from './browser.js';
import { SCRAPERS } from './scrapers/index.js';

await fs.mkdir(OUT_DIR,   { recursive: true });
await fs.mkdir(USER_DATA, { recursive: true });

// ─── Per-platform runner ──────────────────────────────────────────────────────
const summaryRows = [];

async function runPlatform(platform) {
  console.log(`\n=== ${platform.toUpperCase()} (target: ${MAX_ITEMS}) ===`);
  const ctx = await makeContext(platform);
  await ctx.addInitScript(STEALTH_SCRIPT);
  await ctx.setExtraHTTPHeaders({
    'accept-language':    'en-IN,en;q=0.9',
    'sec-ch-ua':          '"Chromium";v="127", "Not)A;Brand";v="99"',
    'sec-ch-ua-mobile':   '?0',
    'sec-ch-ua-platform': '"macOS"',
  });

  const page      = await ctx.newPage();
  const collected = [];
  let   blocked   = false;

  for (const keyword of keywords) {
    if (collected.length >= MAX_ITEMS) break;
    const tag = `[${platform}] "${keyword}"`;
    try {
      const result = await SCRAPERS[platform](page, keyword, collected);
      if (result === 'blocked') {
        console.log(`${tag} BLOCKED — run once with --headful to save session, then retry headless.`);
        blocked = true;
        break;
      }
      console.log(`${tag} → ${collected.length} items so far`);
    } catch (e) {
      console.log(`${tag} ERROR: ${e.message}`);
    }
    await page.waitForTimeout(800 + Math.random() * 600);
  }

  await ctx.close();

  const output = collected.slice(0, MAX_ITEMS);
  await fs.writeFile(path.join(OUT_DIR, `${platform}.json`), JSON.stringify(output, null, 2));
  console.log(`[${platform}] ${output.length} items → evidence/original/${platform}.json${blocked ? ' (blocked — partial)' : ''}`);
  summaryRows.push({ platform, count: output.length, blocked });
}

// ─── Main: run platforms with concurrency limit ───────────────────────────────
const summary = { startedAt: new Date().toISOString(), platforms: summaryRows };

for (let i = 0; i < platforms.length; i += CONCURRENCY) {
  await Promise.all(platforms.slice(i, i + CONCURRENCY).map(runPlatform));
}

summary.finishedAt = new Date().toISOString();
summary.total      = summaryRows.reduce((s, p) => s + p.count, 0);
await fs.writeFile(path.join(ROOT, 'evidence', '_summary.json'), JSON.stringify(summary, null, 2));
console.log(`\nDone. Total: ${summary.total} items across ${platforms.length} platforms.`);
console.log('Summary: evidence/_summary.json');
