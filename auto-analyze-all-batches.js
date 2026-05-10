#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const batchDir = path.join(__dirname, '.claude/batches');
const outputDir = path.join(__dirname, 'evidence/image_features');

fs.mkdirSync(outputDir, { recursive: true });

const batchFiles = fs.readdirSync(batchDir)
  .filter(f => f.endsWith('.json'))
  .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));

console.log(`📦 Total batches: ${batchFiles.length}`);
console.log(`📊 Generating prompts for all image analyses...\n`);

// Generate analysis prompts grouped by platform
const allBatches = {};
for (const batchFile of batchFiles) {
  const batchNum = parseInt(batchFile.match(/\d+/)[0]);
  const batchPath = path.join(batchDir, batchFile);
  const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  allBatches[batchNum] = batch;
}

// Process batch 2 analysis request (next step after batch 1)
const batch2 = allBatches[2];
if (batch2) {
  const prompt = `\n🔍 BATCH 2 ANALYSIS REQUEST\n${'='.repeat(60)}\n\nAnalyze these ${batch2.length} nighty product images and return ONLY a JSON array (one object per image in order):\n\n`;
  const urls = batch2.map((p, i) => `${i + 1}. ${p.image}\n   (${p.source}/${p.keyword})`).join('\n\n');

  console.log(`${prompt}${urls}`);
  console.log(`\n${'='.repeat(60)}`);
  console.log('\nAfter analyzing, save to results file and run:');
  console.log('  node batch-result-saver.js 2 <results.json>');

  // Create template for user
  fs.mkdirSync(path.join(__dirname, '.claude/batch_templates'), { recursive: true });
  fs.writeFileSync(
    path.join(__dirname, '.claude/batch_templates/batch_2_products.json'),
    JSON.stringify(batch2, null, 2)
  );

  console.log(`\n✅ Products saved to .claude/batch_templates/batch_2_products.json`);
}
