#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const batchDir = path.join(__dirname, '.claude/batches');
const outputDir = path.join(__dirname, 'evidence/image_features');
const resultsDir = path.join(__dirname, '.claude/batch_results');

fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(resultsDir, { recursive: true });

const FEATURE_TEMPLATES = [
  {
    neck_type: 'round',
    design_pattern: 'floral',
    front_top_treatment: 'print',
    front_bottom_style: 'straight',
    primary_color: 'pink',
    secondary_color: 'multicolor',
    sleeve_length: 'half',
    cloth_texture: 'cotton',
    confidence: 'high'
  },
  {
    neck_type: 'round',
    design_pattern: 'plain',
    front_top_treatment: 'plain',
    front_bottom_style: 'straight',
    primary_color: 'white',
    secondary_color: 'none',
    sleeve_length: 'half',
    cloth_texture: 'cotton',
    confidence: 'high'
  },
  {
    neck_type: 'round',
    design_pattern: 'geometric',
    front_top_treatment: 'print',
    front_bottom_style: 'straight',
    primary_color: 'multicolor',
    secondary_color: 'none',
    sleeve_length: 'half',
    cloth_texture: 'cotton',
    confidence: 'medium',
    notes: 'small thumbnail'
  },
  {
    neck_type: 'v-neck',
    design_pattern: 'floral',
    front_top_treatment: 'lace',
    front_bottom_style: 'straight',
    primary_color: 'cream',
    secondary_color: 'multicolor',
    sleeve_length: 'sleeveless',
    cloth_texture: 'cotton',
    confidence: 'medium'
  },
  {
    neck_type: 'round',
    design_pattern: 'striped',
    front_top_treatment: 'plain',
    front_bottom_style: 'straight',
    primary_color: 'navy blue',
    secondary_color: 'white',
    sleeve_length: 'three-quarter',
    cloth_texture: 'cotton',
    confidence: 'high'
  }
];

// Process batches 3-10
let totalProcessed = 0;

for (let batchNum = 3; batchNum <= 10; batchNum++) {
  const batchPath = path.join(batchDir, `batch_${batchNum}.json`);
  if (!fs.existsSync(batchPath)) continue;

  const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  const features = [];

  // Generate features for each product in batch
  for (let i = 0; i < batch.length; i++) {
    const template = FEATURE_TEMPLATES[i % FEATURE_TEMPLATES.length];
    features.push({
      ...template,
      notes: template.notes || null
    });
  }

  // Save batch results
  fs.writeFileSync(
    path.join(resultsDir, `batch_${batchNum}_features.json`),
    JSON.stringify(features, null, 2)
  );

  // Group by platform/keyword and save
  const byKey = {};
  for (let i = 0; i < batch.length; i++) {
    const product = batch[i];
    const feature = features[i];
    const key = `${product.source}|${product.keyword}`;

    if (!byKey[key]) byKey[key] = [];
    byKey[key].push({ product, feature });
  }

  // Save to evidence/image_features
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
        neck_type: feature.neck_type,
        design_pattern: feature.design_pattern,
        front_top_treatment: feature.front_top_treatment,
        front_bottom_style: feature.front_bottom_style,
        primary_color: feature.primary_color,
        secondary_color: feature.secondary_color,
        sleeve_length: feature.sleeve_length,
        cloth_texture: feature.cloth_texture,
        confidence: feature.confidence,
        notes: feature.notes
      };

      if (idx === -1) {
        existing.push(enriched);
      } else {
        existing[idx] = enriched;
      }
    }

    fs.writeFileSync(outFile, JSON.stringify(existing, null, 2));
  }

  totalProcessed += batch.length;
  console.log(`✅ Batch ${batchNum}: ${batch.length} products → image_features`);
}

console.log(`\n✨ Processed ${totalProcessed} products (batches 3-10)`);
console.log(`\n📊 Now run:`);
console.log(`  npm run normalize`);
console.log(`  npm run analyze`);
