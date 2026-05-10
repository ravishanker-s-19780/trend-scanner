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

console.log(`📦 Processing ${batchFiles.length} batches...`);

let totalProcessed = 0;
let batchResults = {};

// Process each batch and generate prompts for Claude
for (const batchFile of batchFiles) {
  const batchNum = parseInt(batchFile.match(/\d+/)[0]);
  const batchPath = path.join(batchDir, batchFile);
  const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));

  const urls = batch.map(p => `${p.image}`).join('\n');
  const prompt = `Batch ${batchNum}: Analyze these ${batch.length} nighty images:\n${urls}\n\nReturn ONLY JSON array (one object per image in order).`;

  batchResults[batchNum] = {
    products: batch,
    prompt,
    status: 'pending'
  };

  totalProcessed += batch.length;
}

console.log(`Total products: ${totalProcessed}`);
console.log(`\n🚀 Ready to process. Run:`);
console.log(`  node merge-batch-results.js\n`);

// Save batch metadata
fs.writeFileSync(path.join(__dirname, '.claude/batch_metadata.json'), JSON.stringify(batchResults, null, 2));
