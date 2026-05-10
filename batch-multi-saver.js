#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, 'evidence/image_features');

fs.mkdirSync(outputDir, { recursive: true });

// Batch results (I'll analyze and provide these)
const allBatchResults = {
  2: require('./.claude/batch_results/batch_2_features.json')
};

let totalSaved = 0;

// Process each batch
for (const [batchNum, features] of Object.entries(allBatchResults)) {
  const batchPath = path.join(__dirname, `.claude/batches/batch_${batchNum}.json`);

  if (!fs.existsSync(batchPath)) continue;

  const products = JSON.parse(fs.readFileSync(batchPath, 'utf8'));

  // Group by platform/keyword
  const byKey = {};
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const feature = features[i];
    const key = `${product.source}|${product.keyword}`;

    if (!byKey[key]) byKey[key] = [];
    byKey[key].push({ product, feature });
  }

  // Save each platform/keyword
  for (const [key, items] of Object.entries(byKey)) {
    const [platform, keyword] = key.split('|');
    const keywordSlug = keyword.toLowerCase().replace(/\s+/g, '-');
    const platformDir = path.join(outputDir, platform);
    const outFile = path.join(platformDir, `${keywordSlug}.json`);

    fs.mkdirSync(platformDir, { recursive: true });

    // Read existing
    let existing = [];
    if (fs.existsSync(outFile)) {
      existing = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    }

    // Merge
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
        confidence: feature?.confidence || 'inferred',
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
  }

  console.log(`✅ Batch ${batchNum}: Saved ${products.length} products`);
}

console.log(`\n✨ Total: ${totalSaved} products enriched`);
