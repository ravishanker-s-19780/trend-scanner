#!/usr/bin/env node

/**
 * Save garment-features skill results to evidence/image_features
 *
 * Usage: cat features.json | node save-skill-results.js <batch_number>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const batchNum = process.argv[2];

if (!batchNum) {
  console.error('Usage: cat features.json | node save-skill-results.js <batch_number>');
  process.exit(1);
}

const batchPath = path.join(__dirname, `.claude/batches/batch_${batchNum}.json`);
const outputDir = path.join(__dirname, 'evidence/image_features');

if (!fs.existsSync(batchPath)) {
  console.error(`❌ Batch ${batchNum} not found`);
  process.exit(1);
}

let inputData = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  inputData += chunk;
});

process.stdin.on('end', () => {
  try {
    const features = JSON.parse(inputData);
    if (!Array.isArray(features)) {
      console.error('❌ Input must be a JSON array');
      process.exit(1);
    }

    const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));

    if (features.length !== batch.length) {
      console.error(`❌ Feature count (${features.length}) != product count (${batch.length})`);
      process.exit(1);
    }

    // Group by platform/keyword
    const byKey = {};
    for (let i = 0; i < batch.length; i++) {
      const product = batch[i];
      const feature = features[i];
      const key = `${product.source}|${product.keyword}`;

      if (!byKey[key]) byKey[key] = [];
      byKey[key].push({ product, feature });
    }

    // Save to evidence/image_features
    fs.mkdirSync(outputDir, { recursive: true });
    let totalSaved = 0;

    for (const [key, items] of Object.entries(byKey)) {
      const [platform, keyword] = key.split('|');
      const keywordSlug = keyword.toLowerCase().replace(/\s+/g, '-');
      const platformDir = path.join(outputDir, platform);
      const outFile = path.join(platformDir, `${keywordSlug}.json`);

      fs.mkdirSync(platformDir, { recursive: true });

      let existing = [];
      if (fs.existsSync(outFile)) {
        existing = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      }

      for (const { product, feature } of items) {
        const idx = existing.findIndex(p => p.url === product.url);
        const enriched = {
          product_id: product.product_id,
          source: platform,
          keyword,
          title: product.title,
          url: product.url,
          price: product.price,
          rating: product.rating,
          review_count: product.review_count,
          image: product.image,
          neck_type: feature?.neck_type || null,
          design_pattern: feature?.design_pattern || null,
          front_top_treatment: feature?.front_top_treatment || null,
          front_bottom_style: feature?.front_bottom_style || null,
          primary_color: feature?.primary_color || null,
          secondary_color: feature?.secondary_color || null,
          sleeve_length: feature?.sleeve_length || null,
          cloth_texture: feature?.cloth_texture || null,
          confidence: feature?.confidence || 'medium',
          notes: feature?.notes || null
        };

        if (idx === -1) {
          existing.push(enriched);
        } else {
          existing[idx] = enriched;
        }
      }

      fs.writeFileSync(outFile, JSON.stringify(existing, null, 2));
      totalSaved += items.length;
      console.log(`✅ ${platform}/${keywordSlug}.json (${existing.length} total)`);
    }

    console.log(`\n✨ Saved ${totalSaved} products from batch ${batchNum}`);
    console.log('\nNext: node invoke-garment-features.js --all');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
});

if (process.stdin.isTTY) {
  console.log('Waiting for JSON input from stdin...');
}
