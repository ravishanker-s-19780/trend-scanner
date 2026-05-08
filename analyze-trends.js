#!/usr/bin/env node
/**
 * Trend analysis script for ladies nighty design data.
 * Reads evidence/clean/_merged.json, clusters by design archetype,
 * scores each cluster on the 25-point B2B framework, and outputs ranked trends.
 *
 * Usage:
 *   node analyze-trends.js              # top 5 trends
 *   node analyze-trends.js --top=10
 *   node analyze-trends.js --source=amazon
 *   node analyze-trends.js --min-count=2
 *   node analyze-trends.js --json       # suppress console cards, just write file
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);
const TOP_N      = parseInt(args.top || '5', 10);
const SOURCE     = args.source || null;
const MIN_COUNT  = parseInt(args['min-count'] || '1', 10);
const JSON_ONLY  = !!args.json;

// ── Load data ─────────────────────────────────────────────────────────────────
const MERGED = path.join(__dirname, 'evidence', 'clean', '_merged.json');
if (!fs.existsSync(MERGED)) {
  console.error('evidence/clean/_merged.json not found. Run normalize.js first.');
  process.exit(1);
}

let products = JSON.parse(fs.readFileSync(MERGED, 'utf8'));

// Filter
products = products.filter(p => p.features_reliable === true);
if (SOURCE) products = products.filter(p => p.source === SOURCE);

if (products.length === 0) {
  console.error('No reliable products found after filtering.');
  process.exit(1);
}

// ── Cluster ───────────────────────────────────────────────────────────────────
const clusters = new Map();

for (const p of products) {
  const key = [p.design_pattern, p.neck_type, p.sleeve_length, p.front_top_treatment].join('|');
  if (!clusters.has(key)) {
    clusters.set(key, {
      cluster_key: key,
      design_pattern: p.design_pattern,
      neck_type: p.neck_type,
      sleeve_length: p.sleeve_length,
      front_top_treatment: p.front_top_treatment,
      products: [],
    });
  }
  clusters.get(key).products.push(p);
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

function scoreEvidenceStrength(cluster) {
  const sources  = new Set(cluster.products.map(p => p.source));
  const rated    = cluster.products.filter(p => p.rating_numeric !== null);
  const avgRating = rated.length
    ? rated.reduce((s, p) => s + p.rating_numeric, 0) / rated.length
    : 0;

  if (sources.size >= 2 && avgRating >= 3.8) return 5;
  if (sources.size >= 2 || (sources.size === 1 && cluster.products.length >= 3 && rated.length >= 2)) return 3;
  return 1;
}

function scoreTrendSignal(cluster) {
  const rated    = cluster.products.filter(p => p.rating_numeric !== null);
  const avgRating = rated.length
    ? rated.reduce((s, p) => s + p.rating_numeric, 0) / rated.length
    : 0;
  const keywords = new Set(cluster.products.map(p => p.keyword));

  if (avgRating >= 4.0 && keywords.size >= 3) return 5;
  if (avgRating >= 3.9 && keywords.size >= 2) return 3;
  if (avgRating >= 3.7) return 1;
  return 0;
}

function scoreTNB2BFit(cluster) {
  let score = 5;
  const priced = cluster.products.filter(p => p.price_numeric !== null);
  const avgPrice = priced.length
    ? priced.reduce((s, p) => s + p.price_numeric, 0) / priced.length
    : null;

  // Price band: retail ≤ 600 → wholesale ~300 ≤ TN ceiling 320
  if (avgPrice !== null && avgPrice > 600) score -= 2;
  else if (avgPrice === null) score -= 1;

  // Fabric: cotton preferred
  const nonCotton = cluster.products.filter(p => p.cloth_texture !== 'cotton').length;
  if (nonCotton > 0) score -= 2;

  // Channel fit: embroidery is hard to scale for district wholesaler
  if (cluster.front_top_treatment === 'embroidery' || cluster.front_top_treatment === 'lace') {
    score -= 1;
  }

  return Math.max(0, score);
}

function scoreProductionSimplicity(cluster) {
  const treatmentScore = {
    plain: 5,
    print: 3,
    lace: 2,
    embroidery: 1,
    other: 2,
  }[cluster.front_top_treatment] ?? 2;

  const sleeveScore = {
    half: 5,
    sleeveless: 4,
    'three-quarter': 3,
    full: 2,
    other: 3,
  }[cluster.sleeve_length] ?? 3;

  return Math.round((treatmentScore + sleeveScore) / 2);
}

function scoreMarginPossibility(cluster) {
  const priced = cluster.products.filter(p => p.price_numeric !== null);
  if (!priced.length) return 1;
  const avgPrice = priced.reduce((s, p) => s + p.price_numeric, 0) / priced.length;
  if (avgPrice <= 450) return 5;
  if (avgPrice <= 600) return 3;
  if (avgPrice <= 750) return 1;
  return 1;
}

function decision(total) {
  if (total >= 20) return 'Send Now';
  if (total >= 15) return 'Send as Backup';
  if (total >= 10) return 'Needs More Evidence';
  return 'Do Not Send';
}

// ── Score each cluster ────────────────────────────────────────────────────────

function scoreCluster(cluster) {
  const priced  = cluster.products.filter(p => p.price_numeric !== null);
  const rated   = cluster.products.filter(p => p.rating_numeric !== null);
  const keywords = [...new Set(cluster.products.map(p => p.keyword))];
  const sources  = cluster.products.reduce((acc, p) => {
    acc[p.source] = (acc[p.source] || 0) + 1;
    return acc;
  }, {});

  const colors = cluster.products.map(p => ({
    primary: p.primary_color,
    secondary: p.secondary_color,
  }));

  const avgPrice  = priced.length ? Math.round(priced.reduce((s, p) => s + p.price_numeric, 0) / priced.length) : null;
  const avgRating = rated.length  ? Math.round(rated.reduce((s, p) => s + p.rating_numeric, 0) / rated.length * 100) / 100 : null;
  const minPrice  = priced.length ? Math.min(...priced.map(p => p.price_numeric)) : null;
  const maxPrice  = priced.length ? Math.max(...priced.map(p => p.price_numeric)) : null;

  const A = scoreEvidenceStrength(cluster);
  const B = scoreTrendSignal(cluster);
  const C = scoreTNB2BFit(cluster);
  const D = scoreProductionSimplicity(cluster);
  const E = scoreMarginPossibility(cluster);

  let total = A + B + C + D + E;
  const capped = A < 3;
  if (capped && total > 14) total = 14;

  return {
    cluster_key: cluster.cluster_key,
    design_pattern: cluster.design_pattern,
    neck_type: cluster.neck_type,
    sleeve_length: cluster.sleeve_length,
    front_top_treatment: cluster.front_top_treatment,
    product_count: cluster.products.length,
    keyword_count: keywords.length,
    keywords,
    sources,
    avg_rating: avgRating,
    avg_price: avgPrice,
    min_price: minPrice,
    max_price: maxPrice,
    colors,
    score: {
      total,
      evidence_strength: A,
      trend_signal: B,
      tn_b2b_fit: C,
      production_simplicity: D,
      margin_possibility: E,
      capped,
    },
    decision: decision(total),
    sample_product_ids: cluster.products.slice(0, 3).map(p => p.product_id),
  };
}

// ── Build ranked list ─────────────────────────────────────────────────────────

let results = [...clusters.values()]
  .filter(c => c.products.length >= MIN_COUNT)
  .map(scoreCluster)
  .sort((a, b) => b.score.total - a.score.total)
  .map((r, i) => ({ rank: i + 1, ...r }));

// ── Write output ──────────────────────────────────────────────────────────────

const OUTPUT_DIR = path.join(__dirname, 'evidence', 'output');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'trends.json');
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

// ── Console cards ─────────────────────────────────────────────────────────────

if (!JSON_ONLY) {
  const top = results.slice(0, TOP_N);
  const line = '═'.repeat(50);
  const dash = '─'.repeat(50);

  console.log(`\nTrend analysis — ${products.length} products, ${results.length} design clusters\n`);

  for (const r of top) {
    const label = [
      r.design_pattern.charAt(0).toUpperCase() + r.design_pattern.slice(1),
      r.front_top_treatment,
      r.neck_type,
      r.sleeve_length + ' sleeve',
    ].join(', ');

    // Deduplicate color pairs for display
    const colorMap = new Map();
    for (const c of r.colors) {
      const k = `${c.primary}+${c.secondary}`;
      colorMap.set(k, (colorMap.get(k) || 0) + 1);
    }
    const topColors = [...colorMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k]) => k)
      .join(', ');

    const sourceLine = Object.entries(r.sources).map(([s, n]) => `${s} (${n})`).join(', ');
    const priceLine = r.min_price !== null
      ? `₹${r.min_price}–₹${r.max_price} (avg ₹${r.avg_price})`
      : 'price unknown';

    console.log(line);
    console.log(`TREND #${r.rank} — ${label}`);
    console.log(`Score: ${r.score.total}/25 | Decision: ${r.decision}${r.score.capped ? ' [score capped — evidence too weak]' : ''}`);
    console.log(line);
    console.log(`Design Attributes:`);
    console.log(`  Pattern:    ${r.design_pattern.padEnd(14)} Treatment: ${r.front_top_treatment}`);
    console.log(`  Neck:       ${r.neck_type.padEnd(14)} Sleeve:    ${r.sleeve_length}`);
    console.log(`  Texture:    cotton`);
    console.log(`\nMarket Signal:`);
    console.log(`  Products:   ${r.product_count} items across ${r.keyword_count} keyword(s)`);
    console.log(`  Sources:    ${sourceLine}`);
    console.log(`  Avg Rating: ${r.avg_rating !== null ? r.avg_rating + ' ★' : 'n/a'}`);
    console.log(`  Price:      ${priceLine}`);
    console.log(`  Colors:     ${topColors}`);
    console.log(`\nScore Breakdown:`);
    console.log(`  A. Evidence Strength    : ${r.score.evidence_strength}/5`);
    console.log(`  B. Trend Signal         : ${r.score.trend_signal}/5`);
    console.log(`  C. TN B2B Fit           : ${r.score.tn_b2b_fit}/5`);
    console.log(`  D. Production Simplicity: ${r.score.production_simplicity}/5`);
    console.log(`  E. Margin Possibility   : ${r.score.margin_possibility}/5`);
    console.log(dash + '\n');
  }

  console.log(`Full ranked list → ${OUTPUT_FILE}`);
  console.log(`Total clusters scored: ${results.length} | Shown: top ${Math.min(TOP_N, results.length)}\n`);
}
