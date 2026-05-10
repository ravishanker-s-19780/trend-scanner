#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const batchDir = path.join(__dirname, '.claude/batches');
const outputDir = path.join(__dirname, 'evidence/image_features');
const logFile = path.join(__dirname, '.claude/vision_extraction.log');

fs.mkdirSync(outputDir, { recursive: true });

// Load all batch files
const batchFiles = fs.readdirSync(batchDir)
  .filter(f => f.endsWith('.json'))
  .sort((a, b) => {
    const aNum = parseInt(a.match(/\d+/)[0]);
    const bNum = parseInt(b.match(/\d+/)[0]);
    return aNum - bNum;
  });

console.log(`📦 Found ${batchFiles.length} batch files\n`);

let processedCount = 0;
let processedByPlatform = {};

// Process each batch
for (const batchFile of batchFiles) {
  const batchPath = path.join(batchDir, batchFile);
  const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  const batchNum = parseInt(batchFile.match(/\d+/)[0]);

  console.log(`\n📄 Batch ${batchNum}: ${batch.length} products`);
  console.log('━'.repeat(60));

  // Group by platform/keyword
  const byKey = {};
  for (const product of batch) {
    const key = `${product.source}|${product.keyword}`;
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(product);
  }

  // For each platform/keyword group, create output
  for (const [key, products] of Object.entries(byKey)) {
    const [platform, keyword] = key.split('|');
    const keywordSlug = keyword.toLowerCase().replace(/\s+/g, '-');
    const platformDir = path.join(outputDir, platform);
    const outFile = path.join(platformDir, `${keywordSlug}.json`);

    fs.mkdirSync(platformDir, { recursive: true });

    // Read existing file or create new array
    let existing = [];
    if (fs.existsSync(outFile)) {
      existing = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    }

    // Add products from this batch
    for (const product of products) {
      // Check if already processed (by URL)
      const exists = existing.find(p => p.url === product.url);
      if (!exists) {
        // Add placeholder features (will be filled by Claude)
        existing.push({
          product_id: product.product_id,
          source: product.source,
          keyword: product.keyword,
          title: product.title,
          url: product.url,
          price: product.price,
          rating: product.rating,
          review_count: product.review_count,
          image: product.image,
          // Placeholder features - to be filled by Claude analysis
          neck_type: null,
          design_pattern: null,
          front_top_treatment: null,
          front_bottom_style: null,
          primary_color: null,
          secondary_color: null,
          sleeve_length: null,
          cloth_texture: null,
          confidence: 'pending',
          notes: 'awaiting vision analysis'
        });
      }
    }

    fs.writeFileSync(outFile, JSON.stringify(existing, null, 2));
    console.log(`  ✓ ${platform}/${keywordSlug}.json (${existing.length} total)`);

    if (!processedByPlatform[platform]) processedByPlatform[platform] = 0;
    processedByPlatform[platform] += products.length;
    processedCount += products.length;
  }
}

console.log('\n' + '━'.repeat(60));
console.log(`\n✅ Ready: ${processedCount} products initialized`);
console.log('\nNow, copy the image URLs below into Claude Code to analyze:');
console.log('\n📋 PASTE THIS INTO CLAUDE CODE:');
console.log('━'.repeat(60));

// Generate analysis request
const firstBatch = JSON.parse(fs.readFileSync(path.join(batchDir, batchFiles[0]), 'utf8'));
const imageUrls = firstBatch.slice(0, 5).map(p => `${p.image}\n(${p.source}/${p.keyword})`).join('\n\n');

console.log(`\nAnalyze these 5 nighty product images and return JSON features for each:\n${imageUrls}`);
console.log('\n' + '━'.repeat(60));
console.log('\nThen paste the JSON response back and I\'ll save it.');
