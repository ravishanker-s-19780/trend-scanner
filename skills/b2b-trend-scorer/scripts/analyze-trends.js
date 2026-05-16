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
// Look for _merged.json in the project root's evidence/clean directory
const projectRoot = process.cwd();
const MERGED = path.join(projectRoot, 'evidence', 'clean', '_merged.json');

if (!fs.existsSync(MERGED)) {
  console.error(`evidence/clean/_merged.json not found at ${MERGED}. Run normalize.js first.`);
  process.exit(1);
}

let products = JSON.parse(fs.readFileSync(MERGED, 'utf8'));

// Filter: include all products (even without design features they have market signals)
// Only filter by source if specified
if (SOURCE) products = products.filter(p => p.source === SOURCE);

// Exclude bundle/set products (multi-piece combos, not single nighty styles)
const BUNDLE_RE = /combo|piece set|\d+ piece|nightwear set|lingerie set|bundle/i;
products = products.filter(p => !BUNDLE_RE.test(p.title || ''));

if (products.length === 0) {
  console.error('No products found after filtering.');
  process.exit(1);
}

// ── Cluster ───────────────────────────────────────────────────────────────────
// Primary cluster key: design_pattern + sleeve_length (the most visually distinctive features)
// Neck type and treatment become cluster attributes for reporting
const clusters = new Map();

for (const p of products) {
  if (!p.design_pattern && !p.sleeve_length) continue;
  const key = [p.design_pattern, p.sleeve_length].join('|');
  if (!clusters.has(key)) {
    clusters.set(key, {
      cluster_key: key,
      design_pattern: p.design_pattern,
      sleeve_length: p.sleeve_length,
      neck_types: {},
      treatments: {},
      products: [],
    });
  }
  const cluster = clusters.get(key);
  cluster.products.push(p);

  // Track neck type and treatment distributions
  if (p.neck_type) {
    cluster.neck_types[p.neck_type] = (cluster.neck_types[p.neck_type] || 0) + 1;
  }
  if (p.front_top_treatment) {
    cluster.treatments[p.front_top_treatment] = (cluster.treatments[p.front_top_treatment] || 0) + 1;
  }
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

function scoreEvidenceStrength(cluster) {
  const sources  = new Set(cluster.products.map(p => p.source));
  const productCount = cluster.products.length;

  // New: weight by product count alongside platform presence
  if (sources.size >= 3 && productCount >= 15) return 5;
  if (sources.size >= 3 || (sources.size >= 2 && productCount >= 10)) return 4;
  if (sources.size >= 2 && productCount >= 5) return 3;
  if (sources.size >= 2 || productCount >= 8) return 2;
  return 1;
}

function scoreDemandVolume(cluster) {
  // New: measure demand by review count (real buyer signal), not rating
  // Review count is the most reliable proxy for actual purchase volume
  const withReviews = cluster.products.filter(p => p.review_count_numeric > 0);
  const totalReviews = withReviews.reduce((s, p) => s + (p.review_count_numeric || 0), 0);

  if (totalReviews > 15000) return 5;
  if (totalReviews > 5000) return 4;
  if (totalReviews > 1500) return 3;
  if (totalReviews > 300) return 2;
  if (withReviews.length > 0) return 1;
  return 0;
}

function scoreCustomerAppeal(cluster) {
  let score = 5;
  const priced = cluster.products.filter(p => p.price_numeric !== null);
  const avgPrice = priced.length
    ? priced.reduce((s, p) => s + p.price_numeric, 0) / priced.length
    : null;

  // D2C sweet spot: customers are comfortable up to ₹1000 for nightwear
  if (avgPrice !== null && avgPrice > 1000) score -= 2;
  else if (avgPrice === null) score -= 1;

  return Math.max(0, score);
}

function scoreProductionSimplicity(cluster) {
  // Sleeve is still part of cluster key
  const sleeveScore = {
    half: 5,
    sleeveless: 4,
    'three-quarter': 3,
    full: 2,
    other: 3,
  }[cluster.sleeve_length] ?? 3;

  // Treatment is now distributed; use dominant treatment for simplicity score
  const dominantTreatment = Object.entries(cluster.treatments)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'plain';

  const treatmentScore = {
    plain: 5,
    print: 3,
    lace: 2,
    embroidery: 1,
    other: 2,
  }[dominantTreatment] ?? 2;

  return Math.round((treatmentScore + sleeveScore) / 2);
}

function scoreValueScore(cluster) {
  // D2C value perception: best value under ₹500, good under ₹800, acceptable under ₹1200
  const priced = cluster.products.filter(p => p.price_numeric !== null);
  if (!priced.length) return 1;
  const avgPrice = priced.reduce((s, p) => s + p.price_numeric, 0) / priced.length;
  if (avgPrice <= 500) return 5;
  if (avgPrice <= 800) return 3;
  if (avgPrice <= 1200) return 1;
  return 0;
}

function decision(total) {
  if (total >= 20) return 'Trending Now';
  if (total >= 15) return 'Worth Watching';
  if (total >= 10) return 'Emerging';
  return 'Niche';
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
  const B = scoreDemandVolume(cluster);
  const C = scoreCustomerAppeal(cluster);
  const D = scoreProductionSimplicity(cluster);
  const E = scoreValueScore(cluster);

  let total = A + B + C + D + E;
  const capped = A < 3;
  if (capped && total > 14) total = 14;

  const reliableCount = cluster.products.filter(p => p.features_reliable).length;
  const featuresReliablePct = Math.round((reliableCount / cluster.products.length) * 100);

  // New: compute total reviews and breakdowns for customer-facing output
  const totalReviews = cluster.products.reduce((s, p) => s + (p.review_count_numeric || 0), 0);
  const demandLabel = totalReviews > 15000 ? 'Blockbuster' : totalReviews > 5000 ? 'High' : totalReviews > 1500 ? 'Solid' : totalReviews > 300 ? 'Emerging' : totalReviews > 0 ? 'Unproven' : 'No Data';

  // Compute percentage breakdowns for neck types and treatments
  const neckBreakdown = {};
  Object.entries(cluster.neck_types).forEach(([type, count]) => {
    neckBreakdown[type] = Math.round((count / cluster.products.length) * 100) + '%';
  });
  const treatmentBreakdown = {};
  Object.entries(cluster.treatments).forEach(([type, count]) => {
    treatmentBreakdown[type] = Math.round((count / cluster.products.length) * 100) + '%';
  });

  // Enrichment signals from crawler
  const nursingCount = cluster.products.filter(p => p.nursing_label).length;
  const fabricCounts = cluster.products.reduce((acc, p) => {
    const f = (p.fabric_type || '').toLowerCase().trim();
    if (f) acc[f] = (acc[f] || 0) + 1;
    return acc;
  }, {});
  const topFabrics = Object.entries(fabricCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f, n]) => `${f} (${n})`);
  const hasPlusSizes = cluster.products.some(p => {
    if (!p.size_chart) return false;
    const rows = p.size_chart.rows || p.size_chart.available_sizes || [];
    return Array.isArray(rows) && rows.some(r => {
      const s = (r.size || r || '').toString().toUpperCase();
      return s.includes('2X') || s.includes('3X') || s.includes('4X') || s === 'XXL' || s === 'XXXL';
    });
  });

  // Derive B2B decision fields
  const recommendedAction = total >= 20 && !capped ? 'Buy / Produce Now'
    : total >= 15 && !capped ? 'Test Small Batch'
    : total >= 10 || capped ? 'Watch — Needs Evidence'
    : 'Do Not Send';

  const testQuantity = total >= 20 && !capped ? '50–100 pcs'
    : total >= 15 && !capped ? '25–50 pcs'
    : total >= 10 || capped ? '10–25 pcs'
    : 'Do not order';

  const confidenceTier = featuresReliablePct >= 85 && !capped ? 'High'
    : featuresReliablePct >= 60 && !capped ? 'Medium'
    : featuresReliablePct >= 40 ? 'Low'
    : 'Needs Manual Check';

  // Build risk flags
  const riskFlags = [];
  if (cluster.products.length < 10) riskFlags.push('Low product count');
  if (capped) riskFlags.push('Score capped (weak platform spread)');
  if (Object.keys(sources).length < 3) riskFlags.push('Single or few platforms');
  if (avgRating !== null && avgRating < 3.5) riskFlags.push('Below average rating');
  if (featuresReliablePct < 60) riskFlags.push('Low feature reliability');

  // Build buyer segment array
  const buyerSegment = [];
  if (hasPlusSizes) buyerSegment.push('Plus size buyers');
  if (nursingCount > 0) buyerSegment.push('Maternity / nursing');
  if (avgPrice !== null && avgPrice <= 500) buyerSegment.push('Budget buyers');
  if (avgPrice !== null && avgPrice > 800) buyerSegment.push('Mid-premium buyers');
  buyerSegment.push(cluster.design_pattern === 'plain' && cluster.sleeve_length === 'half' ? 'Daily wear' : 'General buyers');

  // Margin tier based on price
  const marginTier = avgPrice !== null && avgPrice >= 800 ? 'Good margin (>40%)'
    : avgPrice !== null && avgPrice >= 500 ? 'Moderate (25–40%)'
    : 'Tight (<25%)';

  // Season fit based on sleeve
  const seasonFit = cluster.sleeve_length === 'full' ? 'Winter / Year-round'
    : cluster.sleeve_length === 'sleeveless' ? 'Summer / Festival'
    : 'Year-round';

  return {
    cluster_key: cluster.cluster_key,
    design_pattern: cluster.design_pattern,
    sleeve_length: cluster.sleeve_length,
    neck_breakdown: neckBreakdown,
    treatment_breakdown: treatmentBreakdown,
    product_count: cluster.products.length,
    total_reviews: totalReviews,
    demand_label: demandLabel,
    features_reliable_pct: featuresReliablePct,
    nursing_count: nursingCount,
    top_fabrics: topFabrics,
    has_plus_sizes: hasPlusSizes,
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
      demand_volume: B,
      customer_appeal: C,
      production_simplicity: D,
      value_score: E,
      capped,
    },
    decision: decision(total),
    recommended_action: recommendedAction,
    test_quantity: testQuantity,
    confidence_tier: confidenceTier,
    confidence_pct: featuresReliablePct,
    risk_flags: riskFlags,
    buyer_segment: buyerSegment,
    margin_tier: marginTier,
    season_fit: seasonFit,
    sample_product_ids: cluster.products.slice(0, 3).map(p => p.product_id),
    sample_images: cluster.products
      .map(p => ({ url: p.image, title: p.title, source: p.source, product_url: p.url }))
      .filter(p => p.url && !p.url.endsWith('.svg') && !/\/static\//i.test(p.url))
      .slice(0, 6),
  };
}

// ── Build ranked list ─────────────────────────────────────────────────────────

let results = [...clusters.values()]
  .filter(c => c.products.length >= MIN_COUNT)
  .map(scoreCluster)
  .sort((a, b) => b.score.total - a.score.total)
  .map((r, i) => ({ rank: i + 1, ...r }));

// ── Generate HTML report ─────────────────────────────────────────────────────

function generateHTML(results, top) {
  const topResults = results.slice(0, top);
  const decisionColor = {
    'Trending Now': '#10b981',
    'Worth Watching': '#f59e0b',
    'Emerging': '#6366f1',
    'Niche': '#ef4444',
  };

  const trendCards = topResults.map(r => {
    const colors = new Map();
    for (const c of r.colors) {
      const k = `${c.primary}+${c.secondary}`;
      colors.set(k, (colors.get(k) || 0) + 1);
    }
    const topColors = [...colors.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    const validColors = topColors.filter(([pair]) => !pair.startsWith('null'));
    const colorSwatches = validColors
      .map(([pair]) => {
        const [primary, secondary] = pair.split('+');
        return `<div style="display: flex; gap: 4px; margin: 4px 0; align-items: center;">
          <div style="width: 20px; height: 20px; border-radius: 4px; background: ${primary}; border: 1px solid #ddd;" title="${primary}"></div>
          ${secondary && secondary !== 'null' && secondary !== 'none' ? `<div style="width: 20px; height: 20px; border-radius: 4px; background: ${secondary}; border: 1px solid #ddd;" title="${secondary}"></div>` : ''}
          <span style="font-size: 11px; color: #888;">${primary}${secondary && secondary !== 'null' && secondary !== 'none' ? ' + ' + secondary : ''}</span>
        </div>`;
      })
      .join('');

    const sourceLine = Object.entries(r.sources).map(([s, n]) => `${s}`).join(', ');
    const priceLine = r.min_price !== null
      ? `₹${r.min_price}–₹${r.max_price}`
      : 'price unknown';

    const scorePercent = (r.score.total / 25) * 100;

    return `
    <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 16px;">
        <div>
          <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 600;">
            #${r.rank} — ${[
              r.design_pattern ? r.design_pattern.charAt(0).toUpperCase() + r.design_pattern.slice(1) : 'Unknown',
              r.sleeve_length === 'sleeveless' ? 'Sleeveless' : r.sleeve_length ? r.sleeve_length.charAt(0).toUpperCase() + r.sleeve_length.slice(1) + ' sleeve' : null,
            ].filter(Boolean).join(' · ')}
          </h3>
          <p style="margin: 0; color: #666; font-size: 13px;">
            <strong style="color: #111;">${r.total_reviews.toLocaleString()} real buyers</strong> ·
            ${sourceLine} · ${priceLine}
          </p>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 24px; font-weight: bold; color: ${decisionColor[r.decision]};">${r.score.total}/25</div>
          <div style="background: ${decisionColor[r.decision]}; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; margin-top: 4px;">${r.decision}</div>
          ${r.score.capped ? '<div style="font-size: 11px; color: #666; margin-top: 4px;">[score capped]</div>' : ''}
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
        <div>
          <h4 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 600; color: #444; text-transform: uppercase;">Design Attributes</h4>
          <div style="font-size: 13px; line-height: 1.6; color: #666;">
            ${Object.entries(r.neck_breakdown).length > 0 ? `<div><strong>Neck:</strong> ${Object.entries(r.neck_breakdown).map(([k,v]) => k + ' ' + v).join(', ')}</div>` : ''}
            ${Object.entries(r.treatment_breakdown).length > 0 ? `<div><strong>Treatment:</strong> ${Object.entries(r.treatment_breakdown).map(([k,v]) => k + ' ' + v).join(', ')}</div>` : ''}
            <div><strong>Avg Rating:</strong> ${r.avg_rating !== null ? r.avg_rating + ' ★' : 'n/a'}</div>
          </div>
        </div>
        <div>
          <h4 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 600; color: #444; text-transform: uppercase;">Score Breakdown</h4>
          <div style="font-size: 12px; line-height: 1.6; color: #666; font-family: monospace;">
            <div>A. Evidence Strength: <strong>${r.score.evidence_strength}/5</strong></div>
            <div>B. Demand Volume: <strong>${r.score.demand_volume}/5</strong></div>
            <div>C. Customer Appeal: <strong>${r.score.customer_appeal}/5</strong></div>
            <div>D. Style Simplicity: <strong>${r.score.production_simplicity}/5</strong></div>
            <div>E. Value Score: <strong>${r.score.value_score}/5</strong></div>
          </div>
        </div>
      </div>

      ${validColors.length > 0 ? `
      <div style="margin-bottom: 16px;">
        <h4 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 600; color: #444; text-transform: uppercase;">Color Palette</h4>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">${colorSwatches}</div>
      </div>` : ''}

      ${r.sample_images.length > 0 ? `
      <div>
        <h4 style="margin: 0 0 8px 0; font-size: 13px; font-weight: 600; color: #444; text-transform: uppercase;">Product Photos</h4>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          ${r.sample_images.map(img => `
            <div style="text-align: center;" onerror="this.style.display='none'">
              <a href="${img.product_url || '#'}" target="_blank" rel="noopener" style="display: block; text-decoration: none;">
                <img src="${img.url}" alt="${(img.title || '').replace(/"/g, '&quot;').slice(0, 60)}"
                  style="width: 120px; height: 150px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb; display: block; transition: opacity 0.15s;"
                  onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'"
                  onerror="this.parentElement.parentElement.style.display='none'">
              </a>
              <div style="font-size: 10px; color: #999; margin-top: 4px; width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${img.source}</div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}
    </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trend Analysis Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f9fafb;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      padding: 32px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    h1 {
      margin: 0 0 8px 0;
      font-size: 32px;
      font-weight: 700;
    }
    .summary {
      color: #666;
      font-size: 14px;
      margin-bottom: 32px;
      padding-bottom: 16px;
      border-bottom: 1px solid #e5e7eb;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Trend Analysis</h1>
    <div class="summary">
      <p>Analyzed ${results.length} design clusters across ${[...clusters.values()].reduce((s,c)=>s+c.products.length,0)} classifiable products (${products.length} total). Showing top ${Math.min(TOP_N, results.length)} trends.</p>
      <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
    </div>
    ${trendCards}
  </div>
</body>
</html>`;
}

// ── Write output ──────────────────────────────────────────────────────────────

const OUTPUT_DIR = path.join(projectRoot, 'evidence', 'output');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const OUTPUT_FILE = path.join(OUTPUT_DIR, 'trends.json');
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

const HTML_FILE = path.join(OUTPUT_DIR, 'trends.html');
fs.writeFileSync(HTML_FILE, generateHTML(results, TOP_N));

// ── Console cards ─────────────────────────────────────────────────────────────

if (!JSON_ONLY) {
  const top = results.slice(0, TOP_N);
  const line = '═'.repeat(50);
  const dash = '─'.repeat(50);

  console.log(`\nTrend analysis — ${products.length} products, ${results.length} design clusters\n`);

  for (const r of top) {
    const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : null;
    const fmtSleeve = s => s === 'sleeveless' ? 'Sleeveless' : s ? cap(s) + ' sleeve' : null;
    const label = [
      cap(r.design_pattern) || 'Unknown pattern',
      fmtSleeve(r.sleeve_length),
    ].filter(Boolean).join(' · ');

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
    const neckStr = Object.entries(r.neck_breakdown).map(([k,v]) => `${k} ${v}`).join(', ') || 'n/a';
    const treatStr = Object.entries(r.treatment_breakdown).map(([k,v]) => `${k} ${v}`).join(', ') || 'n/a';
    console.log(`  Pattern:    ${(r.design_pattern || 'n/a').padEnd(14)} Sleeve:    ${r.sleeve_length || 'n/a'}`);
    console.log(`  Neck:       ${neckStr.padEnd(14)} Treatment: ${treatStr}`);
    console.log(`\nMarket Signal:`);
    console.log(`  Demand:     ${r.total_reviews.toLocaleString()} total reviews [${r.demand_label}]`);
    console.log(`  Products:   ${r.product_count} items across ${r.keyword_count} keyword(s)`);
    console.log(`  Sources:    ${sourceLine}`);
    console.log(`  Avg Rating: ${r.avg_rating !== null ? r.avg_rating + ' ★' : 'n/a'}`);
    console.log(`  Price:      ${priceLine}`);
    console.log(`  Colors:     ${topColors}`);
    console.log(`\nScore Breakdown:`);
    console.log(`  A. Evidence Strength    : ${r.score.evidence_strength}/5`);
    console.log(`  B. Demand Volume        : ${r.score.demand_volume}/5`);
    console.log(`  C. Customer Appeal      : ${r.score.customer_appeal}/5`);
    console.log(`  D. Style Simplicity     : ${r.score.production_simplicity}/5`);
    console.log(`  E. Value Score          : ${r.score.value_score}/5`);
    console.log(dash + '\n');
  }

  console.log(`Full ranked list → ${OUTPUT_FILE}`);
  console.log(`Total clusters scored: ${results.length} | Shown: top ${Math.min(TOP_N, results.length)}\n`);
}
