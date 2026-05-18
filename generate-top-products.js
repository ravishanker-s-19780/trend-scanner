#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = Object.fromEntries(
  process.argv.slice(2).map(arg => {
    const [k, v] = arg.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);

const TOP_N = Number.parseInt(args.top || '50', 10);
const INPUT_FILE = path.join(__dirname, 'evidence', 'clean', '_merged.json');
const OUTPUT_DIR = path.join(__dirname, 'evidence', 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, `top-${TOP_N}-products-by-reviews.json`);
const BLOCKLIST_FILE = path.join(OUTPUT_DIR, 'top-products-blocklist.json');

function parseBlockedRanks(csv) {
  if (!csv || typeof csv !== 'string') return new Set();
  return new Set(
    csv
      .split(',')
      .map(part => Number.parseInt(part.trim(), 10))
      .filter(n => Number.isInteger(n) && n > 0)
  );
}

function loadBlockedRanks() {
  const fromArgs = parseBlockedRanks(args['block-ranks']);
  if (fromArgs.size > 0) return fromArgs;

  if (!fs.existsSync(BLOCKLIST_FILE)) return new Set();

  try {
    const blocklist = JSON.parse(fs.readFileSync(BLOCKLIST_FILE, 'utf8'));
    if (Array.isArray(blocklist.blocked_ranks)) {
      return new Set(
        blocklist.blocked_ranks
          .map(n => Number.parseInt(String(n), 10))
          .filter(n => Number.isInteger(n) && n > 0)
      );
    }
  } catch (error) {
    console.warn('Could not read blocklist file:', error.message);
  }

  return new Set();
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toReviewNumber(product) {
  if (typeof product.review_count_numeric === 'number') return product.review_count_numeric;
  if (typeof product.review_count === 'number') return product.review_count;

  const raw = String(product.review_count || '').replace(/[^0-9]/g, '');
  return raw ? Number.parseInt(raw, 10) : 0;
}

function normalizeRecord(product, rank) {
  return {
    rank,
    source: product.source || '',
    title: product.title || '',
    url: product.url || '',
    image: product.image || '',
    price: product.price || '',
    price_numeric: typeof product.price_numeric === 'number' ? product.price_numeric : null,
    rating: product.rating || '',
    rating_numeric: typeof product.rating_numeric === 'number' ? product.rating_numeric : null,
    review_count: product.review_count || '',
    review_numeric: toReviewNumber(product),
    keyword: product.keyword || ''
  };
}

function dedupeKey(product) {
  if (product.image) return `img:${product.image}`;

  const source = product.source || '';
  const title = normalizeText(product.title);
  const price = typeof product.price_numeric === 'number' ? product.price_numeric : 'na';
  return `sig:${source}|${title}|${price}`;
}

function isBetterCandidate(current, next) {
  if (!current) return true;

  if (next.review_numeric !== current.review_numeric) {
    return next.review_numeric > current.review_numeric;
  }

  const currentRating = typeof current.rating_numeric === 'number' ? current.rating_numeric : -1;
  const nextRating = typeof next.rating_numeric === 'number' ? next.rating_numeric : -1;
  if (nextRating !== currentRating) {
    return nextRating > currentRating;
  }

  const currentPrice = typeof current.price_numeric === 'number' ? current.price_numeric : Number.MAX_SAFE_INTEGER;
  const nextPrice = typeof next.price_numeric === 'number' ? next.price_numeric : Number.MAX_SAFE_INTEGER;
  return nextPrice < currentPrice;
}

if (!fs.existsSync(INPUT_FILE)) {
  console.error('Input file not found:', INPUT_FILE);
  process.exit(1);
}

const products = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));

const withReviews = products
  .map(product => ({ ...product, review_numeric: toReviewNumber(product) }))
  .filter(product => product.review_numeric > 0);

const blockedRanks = loadBlockedRanks();

const uniqueByKey = new Map();
for (const product of withReviews) {
  const key = dedupeKey(product);
  const existing = uniqueByKey.get(key);
  if (isBetterCandidate(existing, product)) {
    uniqueByKey.set(key, product);
  }
}

const sortedUnique = [...uniqueByKey.values()]
  .sort((a, b) => b.review_numeric - a.review_numeric)
  .filter((_, idx) => !blockedRanks.has(idx + 1));

const ranked = sortedUnique
  .slice(0, TOP_N)
  .map((product, idx) => normalizeRecord(product, idx + 1));

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(ranked, null, 2));

console.log(`Wrote ${ranked.length} products to ${OUTPUT_FILE}`);
console.log(`Input with reviews: ${withReviews.length} | Unique after dedupe: ${uniqueByKey.size}`);
console.log(`Blocked rank positions: ${blockedRanks.size > 0 ? [...blockedRanks].sort((a, b) => a - b).join(', ') : 'none'}`);
console.log('Selection: dedupe first, then review count descending.');
