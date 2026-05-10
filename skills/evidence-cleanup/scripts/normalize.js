#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

const EVIDENCE_DIR = path.join(PROJECT_ROOT, 'evidence');
const IMAGE_FEATURES_DIR = path.join(EVIDENCE_DIR, 'image_features');
const ORIGINAL_DIR = path.join(EVIDENCE_DIR, 'original');
const CLEAN_DIR = path.join(EVIDENCE_DIR, 'clean');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sourceFilter = args.find(arg => arg.startsWith('--source='))?.split('=')[1];
const verbose = args.includes('--verbose');

const log = (msg) => console.log(msg);
const vlog = (msg) => verbose && console.log(`[verbose] ${msg}`);

// Normalization functions
function cleanPrice(price) {
  // Handle numeric prices (from batch extraction)
  if (typeof price === 'number') {
    return { numeric: price, confidence: 'exact' };
  }

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
  // Handle numeric ratings
  if (typeof rating === 'number') {
    return rating;
  }

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
  // Handle numeric counts
  if (typeof count === 'number') {
    return count;
  }

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
  if (!url) return url;
  if (typeof url !== 'string') return url;
  if (url.trim() === '') return url;

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

// Platform name normalizer: "amazon.in" → "amazon"
function normalizePlatformName(platform) {
  return platform.replace(/\.(in|com|co\.in)$/, '').replace(/\s+/g, '-');
}

// Infer garment design features from product title text.
// Used for records from evidence/original/ that haven't been through garment-features LLM.
function inferFeaturesFromTitle(title) {
  if (!title) return {};
  const t = title.toLowerCase();

  let design_pattern = null;
  if (/floral|flower/.test(t)) design_pattern = 'floral';
  else if (/stripe|striped/.test(t)) design_pattern = 'striped';
  else if (/check|checked|checkered|plaid/.test(t)) design_pattern = 'checkered';
  else if (/print|printed/.test(t)) design_pattern = 'printed';
  else if (/embroid/.test(t)) design_pattern = 'embroidered';
  else if (/plain|solid/.test(t)) design_pattern = 'plain';

  let neck_type = null;
  if (/round neck|round-neck/.test(t)) neck_type = 'round';
  else if (/v.neck|v neck/.test(t)) neck_type = 'v-neck';
  else if (/boat neck/.test(t)) neck_type = 'boat';
  else if (/square neck/.test(t)) neck_type = 'square';
  else if (/collar/.test(t)) neck_type = 'collar';

  let sleeve_length = null;
  if (/sleeveless|no sleeve/.test(t)) sleeve_length = 'sleeveless';
  else if (/full sleeve|full-sleeve|long sleeve/.test(t)) sleeve_length = 'full';
  else if (/3\/4 sleeve|3\/4sleeve|three.quarter/.test(t)) sleeve_length = '3/4';
  else if (/half sleeve|half-sleeve|short sleeve/.test(t)) sleeve_length = 'half';

  let front_top_treatment = null;
  if (/front zip|front-zip|zip model|zipper/.test(t)) front_top_treatment = 'zip';
  else if (/front open|button|placket/.test(t)) front_top_treatment = 'button';

  let cloth_texture = null;
  if (/cotton/.test(t)) cloth_texture = 'cotton';
  else if (/satin/.test(t)) cloth_texture = 'satin';
  else if (/silk/.test(t)) cloth_texture = 'silk';
  else if (/polyester/.test(t)) cloth_texture = 'polyester';
  else if (/rayon/.test(t)) cloth_texture = 'rayon';
  else if (/modal/.test(t)) cloth_texture = 'modal';

  return { design_pattern, neck_type, sleeve_length, front_top_treatment, cloth_texture };
}

// Process evidence/original/<platform>.json files (new crawler format).
// Merges into the same clean/<source>/ directory, keyed by keyword slug.
function processOriginalPlatforms(enrichedProductIds) {
  if (!fs.existsSync(ORIGINAL_DIR)) {
    vlog(`evidence/original/ not found, skipping`);
    return { totalRecords: 0, totalSkipped: 0, sources: [] };
  }

  const files = fs.readdirSync(ORIGINAL_DIR).filter(f => f.endsWith('.json'));
  let totalRecords = 0;
  let totalSkipped = 0;
  const processedSources = [];

  for (const file of files) {
    const platform = path.basename(file, '.json');
    if (sourceFilter && normalizePlatformName(platform) !== sourceFilter) continue;

    const inputPath = path.join(ORIGINAL_DIR, file);
    let records;
    try {
      records = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
    } catch (err) {
      console.error(`Error reading ${file}: ${err.message}`);
      continue;
    }

    if (!Array.isArray(records) || records.length === 0) {
      vlog(`${file}: empty, skipping`);
      continue;
    }

    // Group by keyword so we can write per-keyword files matching image_features layout
    const byKeyword = new Map();
    for (const r of records) {
      const kw = r.keyword || 'unknown';
      if (!byKeyword.has(kw)) byKeyword.set(kw, []);
      byKeyword.get(kw).push(r);
    }

    const cleanSourceDir = path.join(CLEAN_DIR, platform);
    if (!dryRun) fs.mkdirSync(cleanSourceDir, { recursive: true });

    let fileRecords = 0;
    let fileSkipped = 0;

    for (const [keyword, kwRecords] of byKeyword) {
      const slug = keyword.replace(/\s+/g, '-').replace(/[^a-z0-9-]/gi, '').toLowerCase();
      const normalized = [];

      for (const r of kwRecords) {
        // Skip if this product was already enriched via image_features
        if (enrichedProductIds.has(r.product_id)) {
          fileSkipped++;
          continue;
        }

        const cleanedUrl = cleanURL(r.product_url || '');
        const productId = r.product_id || generateProductId(platform, cleanedUrl);

        if (!productId) { fileSkipped++; continue; }

        const inferred = inferFeaturesFromTitle(r.product_title);
        const confidence = (inferred.design_pattern || inferred.neck_type) ? 'inferred' : 'low';
        const featuresReliable = confidence !== 'low';

        normalized.push({
          product_id: productId,
          source: platform,
          keyword,
          keyword_matches: [keyword],
          title: r.product_title || null,
          title_truncated: r.product_title ? (r.product_title.endsWith('...') || r.product_title.endsWith('…')) : false,
          url: cleanedUrl,
          price: r.price !== null && r.price !== undefined ? `₹${r.price}` : '',
          price_numeric: typeof r.price === 'number' ? r.price : null,
          price_confidence: r.price !== null ? 'exact' : null,
          rating: r.rating !== null && r.rating !== undefined ? String(r.rating) : '',
          rating_numeric: typeof r.rating === 'number' ? r.rating : null,
          review_count: r.review_count !== null && r.review_count !== undefined ? String(r.review_count) : '',
          review_count_numeric: typeof r.review_count === 'number' ? r.review_count : null,
          image: Array.isArray(r.images) ? (r.images[0] || null) : null,
          neck_type: inferred.neck_type,
          design_pattern: inferred.design_pattern,
          front_top_treatment: inferred.front_top_treatment,
          front_bottom_style: null,
          primary_color: null,
          secondary_color: null,
          sleeve_length: inferred.sleeve_length,
          cloth_texture: inferred.cloth_texture || null,
          texture_resolved: !!inferred.cloth_texture,
          confidence,
          features_reliable: featuresReliable,
          notes: null,
        });
      }

      fileRecords += normalized.length;
      if (normalized.length > 0 && !dryRun) {
        const outputPath = path.join(cleanSourceDir, `${slug}.json`);
        // Merge with existing file if present (from a previous run)
        let existing = [];
        if (fs.existsSync(outputPath)) {
          try { existing = JSON.parse(fs.readFileSync(outputPath, 'utf-8')); } catch (_) {}
        }
        const existingIds = new Set(existing.map(e => e.product_id));
        const merged = [...existing, ...normalized.filter(n => !existingIds.has(n.product_id))];
        fs.writeFileSync(outputPath, JSON.stringify(merged, null, 2));
        vlog(`Wrote ${merged.length} records to ${outputPath}`);
      }
    }

    log(`original/${file}: ${fileRecords} records (${fileSkipped} skipped — already enriched)`);
    totalRecords += fileRecords;
    totalSkipped += fileSkipped;
    processedSources.push(platform);
  }

  return { totalRecords, totalSkipped, sources: processedSources };
}

async function main() {
  if (!dryRun) {
    fs.mkdirSync(CLEAN_DIR, { recursive: true });
  }

  // Track product IDs already covered by garment-features enrichment
  const enrichedProductIds = new Set();

  // Step 1: process image_features/ (enriched data — preferred)
  const enrichedSources = [];
  if (fs.existsSync(IMAGE_FEATURES_DIR)) {
    log(`${dryRun ? '[DRY RUN] ' : ''}Processing evidence/image_features/`);

    let sources = fs.readdirSync(IMAGE_FEATURES_DIR)
      .filter(f => fs.statSync(path.join(IMAGE_FEATURES_DIR, f)).isDirectory());

    if (sourceFilter) {
      sources = sources.filter(s => s === sourceFilter);
    }

    for (const source of sources) {
      const result = await processSource(source);
      enrichedSources.push(source);
      log(`image_features/${source}: ${result.files} files, ${result.records} records (${result.skipped} skipped)`);

      // Collect enriched product IDs to avoid duplicating from original/
      const sourceDir = path.join(CLEAN_DIR, source);
      if (fs.existsSync(sourceDir)) {
        for (const f of fs.readdirSync(sourceDir).filter(x => x.endsWith('.json'))) {
          try {
            const recs = JSON.parse(fs.readFileSync(path.join(sourceDir, f), 'utf-8'));
            for (const r of recs) if (r.product_id) enrichedProductIds.add(r.product_id);
          } catch (_) {}
        }
      }
    }
  } else {
    log(`evidence/image_features/ not found — skipping enriched step`);
  }

  // Step 2: process evidence/original/ (raw crawler data with title-inferred features)
  log(`${dryRun ? '[DRY RUN] ' : ''}Processing evidence/original/`);
  const origResult = processOriginalPlatforms(enrichedProductIds);

  // Step 3: merge and dedup all clean/<source>/ dirs
  const allSources = new Set([
    ...enrichedSources,
    ...origResult.sources,
  ]);

  if (allSources.size > 0) {
    // Re-read all clean source dirs for merge
    const cleanDirs = fs.readdirSync(CLEAN_DIR)
      .filter(f => fs.statSync(path.join(CLEAN_DIR, f)).isDirectory());
    const mergeResult = mergeAndDedup(cleanDirs);
    log(`Merge: ${mergeResult.merged} unique products, ${mergeResult.deduped} duplicates removed`);
  }

  const totalRecords = origResult.totalRecords;
  log(`\nTotal new records from original/: ${totalRecords} (${origResult.totalSkipped} skipped)`);
  if (!dryRun) {
    log(`Output written to ${CLEAN_DIR}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
