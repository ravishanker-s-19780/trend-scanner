#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read all products from evidence/original
const evidenceDir = path.join(__dirname, 'evidence/original');
const outputDir = path.join(__dirname, 'evidence/image_features');

fs.mkdirSync(outputDir, { recursive: true });

const platforms = fs.readdirSync(evidenceDir).filter(f => f.endsWith('.json'));
const allProducts = [];

// Collect all products with images
for (const platformFile of platforms) {
  const platform = platformFile.replace('.json', '');
  const data = JSON.parse(fs.readFileSync(path.join(evidenceDir, platformFile), 'utf8'));

  for (const product of data) {
    if (product.images && product.images.length > 0) {
      // Take first image (product photo, not logos)
      const imageUrl = product.images[0];
      if (!imageUrl.includes('starBlue') && !imageUrl.includes('svg')) {
        allProducts.push({
          product_id: product.product_id,
          source: platform,
          keyword: product.keyword || 'unknown',
          title: product.product_title,
          url: product.product_url,
          price: product.price,
          rating: product.rating,
          review_count: product.review_count,
          image: imageUrl
        });
      }
    }
  }
}

console.log(`Total products with images: ${allProducts.length}`);

// Create batch files (5 images per batch)
const BATCH_SIZE = 5;
let batchNum = 0;

for (let i = 0; i < allProducts.length; i += BATCH_SIZE) {
  const batch = allProducts.slice(i, i + BATCH_SIZE);
  const batchFile = path.join(__dirname, `.claude/batches/batch_${++batchNum}.json`);

  fs.mkdirSync(path.dirname(batchFile), { recursive: true });
  fs.writeFileSync(batchFile, JSON.stringify(batch, null, 2));
}

console.log(`\n✅ Created ${batchNum} batch files in .claude/batches/`);
console.log('\nNext: Run this script to process batches:');
console.log('  node process-batches.js');
