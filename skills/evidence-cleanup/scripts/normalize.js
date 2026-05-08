#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

const EVIDENCE_DIR = path.join(PROJECT_ROOT, 'evidence');
const IMAGE_FEATURES_DIR = path.join(EVIDENCE_DIR, 'image_features');
const CLEAN_DIR = path.join(EVIDENCE_DIR, 'clean');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sourceFilter = args.find(arg => arg.startsWith('--source='))?.split('=')[1];
const verbose = args.includes('--verbose');

const log = (msg) => console.log(msg);
const vlog = (msg) => verbose && console.log(`[verbose] ${msg}`);

// Normalization functions
function cleanPrice(price) {
  if (!price || price.trim() === '') {
    return { numeric: null, confidence: null };
  }

  const hasApprox = price.includes('(approx');
  const confidence = hasApprox ? 'approx' : 'exact';

  // Remove (approx, from listing meta)
  let cleaned = price.replace(/\s*\(approx,.*?\)/, '');

  // Remove rupee symbol and commas
  cleaned = cleaned.replace(/₹|,/g, '').trim();

  const numeric = parseInt(cleaned, 10);
  if (isNaN(numeric)) {
    return { numeric: null, confidence: null };
  }

  return { numeric, confidence };
}

function cleanRating(rating) {
  if (!rating || rating.trim() === '') {
    return null;
  }

  const match = rating.match(/([\d.]+)/);
  if (!match) {
    return null;
  }

  const numeric = parseFloat(match[1]);
  return isNaN(numeric) ? null : numeric;
}

function cleanReviewCount(count) {
  if (!count || count.trim() === '') {
    return null;
  }

  const cleaned = count.replace(/\D/g, '');
  if (!cleaned) {
    return null;
  }

  const numeric = parseInt(cleaned, 10);
  return isNaN(numeric) ? null : numeric;
}

function cleanURL(url) {
  if (!url || url.trim() === '') {
    return url;
  }

  url = url.trim();

  // Amazon sspa/click URLs
  if (url.includes('sspa/click') || url.includes('/gp/slredirect/')) {
    const asimMatch = url.match(/\/dp\/([A-Z0-9]+)/);
    if (asimMatch) {
      const asin = asimMatch[1];
      return `https://www.amazon.in/dp/${asin}`;
    }
  }

  // IndiaMART URLs - strip query params
  if (url.includes('indiamart.com/proddetail/')) {
    const slugMatch = url.match(/\/proddetail\/([^?]+)/);
    if (slugMatch) {
      const slug = slugMatch[1];
      return `https://www.indiamart.com/proddetail/${slug}`;
    }
  }

  return url;
}

function generateProductId(source, url) {
  if (!url || url.trim() === '') {
    return null;
  }

  const key = `${source}|${url}`;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return hash.substring(0, 12);
}

function normalizeRecord(record, keyword) {
  // Clean product fields
  const cleanedUrl = cleanURL(record.url);
  const productId = generateProductId(record.source, cleanedUrl);

  if (!productId) {
    vlog(`Skipping record: no valid URL for product ID generation`);
    return null;
  }

  const { numeric: priceNumeric, confidence: priceConfidence } = cleanPrice(record.price);
  const ratingNumeric = cleanRating(record.rating);
  const reviewCountNumeric = cleanReviewCount(record.review_count);

  const titleTruncated = (record.title && (record.title.endsWith('...') || record.title.endsWith('…')));
  let cleanedTitle = record.title;
  if (cleanedTitle && cleanedTitle.startsWith('Sponsored Ad - ')) {
    cleanedTitle = cleanedTitle.substring('Sponsored Ad - '.length);
  }

  const textureResolved = record.cloth_texture !== 'unsure';
  const featuresReliable = record.confidence !== 'low';

  let secondaryColor = record.secondary_color;
  if (secondaryColor === 'unknown') {
    secondaryColor = null;
  }

  return {
    product_id: productId,
    source: record.source,
    keyword: keyword,
    keyword_matches: [keyword],
    title: cleanedTitle,
    title_truncated: titleTruncated,
    url: cleanedUrl,
    price: record.price,
    price_numeric: priceNumeric,
    price_confidence: priceConfidence,
    rating: record.rating,
    rating_numeric: ratingNumeric,
    review_count: record.review_count,
    review_count_numeric: reviewCountNumeric,
    image: record.image,
    neck_type: record.neck_type,
    design_pattern: record.design_pattern,
    front_top_treatment: record.front_top_treatment,
    front_bottom_style: record.front_bottom_style,
    primary_color: record.primary_color,
    secondary_color: secondaryColor,
    sleeve_length: record.sleeve_length,
    cloth_texture: record.cloth_texture,
    texture_resolved: textureResolved,
    confidence: record.confidence,
    features_reliable: featuresReliable,
    notes: record.notes
  };
}

async function processSource(source) {
  const sourceDir = path.join(IMAGE_FEATURES_DIR, source);

  if (!fs.existsSync(sourceDir)) {
    vlog(`Source directory not found: ${sourceDir}`);
    return { source, files: 0, records: 0, skipped: 0 };
  }

  const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.json'));
  let totalRecords = 0;
  let totalSkipped = 0;

  const cleanSourceDir = path.join(CLEAN_DIR, source);
  if (!dryRun) {
    fs.mkdirSync(cleanSourceDir, { recursive: true });
  }

  for (const file of files) {
    const inputPath = path.join(sourceDir, file);
    const keyword = path.basename(file, '.json');

    try {
      const content = fs.readFileSync(inputPath, 'utf-8');
      const records = JSON.parse(content);

      if (!Array.isArray(records)) {
        console.warn(`Warning: ${file} is not an array, skipping`);
        continue;
      }

      const normalized = records
        .map(r => normalizeRecord(r, keyword))
        .filter(r => r !== null);

      totalRecords += normalized.length;
      totalSkipped += records.length - normalized.length;

      if (normalized.length > 0 && !dryRun) {
        const outputPath = path.join(cleanSourceDir, file);
        fs.writeFileSync(outputPath, JSON.stringify(normalized, null, 2));
        vlog(`Wrote ${normalized.length} records to ${outputPath}`);
      }
    } catch (err) {
      console.error(`Error processing ${file}: ${err.message}`);
    }
  }

  return { source, files: files.length, records: totalRecords, skipped: totalSkipped };
}

function mergeAndDedup(sources) {
  const mergedPath = path.join(CLEAN_DIR, '_merged.json');

  const deduped = new Map();
  let totalProcessed = 0;
  let totalDeduped = 0;

  for (const source of sources) {
    const sourceDir = path.join(CLEAN_DIR, source);
    if (!fs.existsSync(sourceDir)) continue;

    const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const filepath = path.join(sourceDir, file);
      const content = fs.readFileSync(filepath, 'utf-8');
      const records = JSON.parse(content);

      for (const record of records) {
        totalProcessed++;

        if (deduped.has(record.product_id)) {
          // Merge keyword_matches
          const existing = deduped.get(record.product_id);
          const merged = record.keyword_matches[0];
          if (!existing.keyword_matches.includes(merged)) {
            existing.keyword_matches.push(merged);
          }
          totalDeduped++;
        } else {
          deduped.set(record.product_id, record);
        }
      }
    }
  }

  const merged = Array.from(deduped.values());

  if (!dryRun) {
    fs.writeFileSync(mergedPath, JSON.stringify(merged, null, 2));
    log(`Merged and deduplicated ${merged.length} unique products (${totalDeduped} duplicates removed)`);
  }

  return { merged: merged.length, deduped: totalDeduped };
}

async function main() {
  if (!fs.existsSync(IMAGE_FEATURES_DIR)) {
    console.error(`Error: ${IMAGE_FEATURES_DIR} does not exist. Have you run the garment-features skill?`);
    process.exit(1);
  }

  if (!dryRun) {
    fs.mkdirSync(CLEAN_DIR, { recursive: true });
  }

  log(`${dryRun ? '[DRY RUN] ' : ''}Processing evidence/image_features/`);

  let sources = fs.readdirSync(IMAGE_FEATURES_DIR)
    .filter(f => fs.statSync(path.join(IMAGE_FEATURES_DIR, f)).isDirectory());

  if (sourceFilter) {
    sources = sources.filter(s => s === sourceFilter);
    if (sources.length === 0) {
      console.error(`Error: source ${sourceFilter} not found`);
      process.exit(1);
    }
  }

  const results = [];
  for (const source of sources) {
    const result = await processSource(source);
    results.push(result);
    log(`${source}: ${result.files} files, ${result.records} records (${result.skipped} skipped)`);
  }

  if (sources.length > 0) {
    const mergeResult = mergeAndDedup(sources);
    log(`Merge: ${mergeResult.merged} unique products, ${mergeResult.deduped} duplicates removed`);
  }

  const totalRecords = results.reduce((sum, r) => sum + r.records, 0);
  const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);

  log(`\nTotal: ${totalRecords} records processed, ${totalSkipped} skipped`);
  if (!dryRun) {
    log(`Output written to ${CLEAN_DIR}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
