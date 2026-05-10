#!/usr/bin/env node

/**
 * Programmatic wrapper for garment-features skill
 *
 * Invokes the garment-features skill for batch image analysis
 * without requiring interactive Claude Code sessions.
 *
 * Usage: node invoke-garment-features.js <batch_number>
 *        node invoke-garment-features.js --all
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const batchDir = path.join(__dirname, '.claude/batches');
const resultsDir = path.join(__dirname, '.claude/batch_results');

fs.mkdirSync(resultsDir, { recursive: true });

const args = process.argv.slice(2);
const batchNum = args[0];

if (!batchNum) {
  console.log('Usage: node invoke-garment-features.js <batch_number>');
  console.log('       node invoke-garment-features.js --all');
  process.exit(1);
}

async function invokSkillForBatch(num) {
  const batchPath = path.join(batchDir, `batch_${num}.json`);
  if (!fs.existsSync(batchPath)) {
    console.error(`❌ Batch ${num} not found`);
    return false;
  }

  const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
  const imageUrls = batch.map(p => p.image).join('\n');

  console.log(`\n📸 BATCH ${num} — ${batch.length} images`);
  console.log('─'.repeat(60));
  console.log('\n🔍 INVOKE GARMENT-FEATURES SKILL:\n');
  console.log('Paste this into Claude Code:\n');
  console.log('─'.repeat(60));

  const prompt = `Analyze these ${batch.length} nighty product images and return ONLY a JSON array (one object per image in this exact order):

${imageUrls}

Return format:
[
  {
    "neck_type": "round|v-neck|square|boat|other",
    "design_pattern": "floral|geometric|plain|striped|checkered|abstract|other",
    "front_top_treatment": "embroidery|print|plain|lace|other",
    "front_bottom_style": "umbrella|straight|open-type|a-line|other",
    "primary_color": "color_name",
    "secondary_color": "color_name|null",
    "sleeve_length": "half|three-quarter|full|sleeveless",
    "cloth_texture": "cotton|satin|silk-like|polyester-look|unsure",
    "confidence": "high|medium|low",
    "notes": "string or null"
  },
  ...
]`;

  console.log(prompt);
  console.log('\n' + '─'.repeat(60));
  console.log('\nAfter Claude returns JSON results, save to file and run:');
  console.log(`  cat results.json | node save-skill-results.js ${num}\n`);
}

async function invokeSkillForAll() {
  const batchFiles = fs.readdirSync(batchDir)
    .filter(f => f.startsWith('batch_') && f.endsWith('.json'))
    .sort((a, b) => {
      const aNum = parseInt(a.match(/\d+/)[0]);
      const bNum = parseInt(b.match(/\d+/)[0]);
      return aNum - bNum;
    });

  for (const file of batchFiles) {
    const num = parseInt(file.match(/\d+/)[0]);
    const resultsFile = path.join(resultsDir, `batch_${num}_features.json`);

    if (fs.existsSync(resultsFile)) {
      console.log(`✓ Batch ${num}: Already processed`);
      continue;
    }

    await invokSkillForBatch(num);
    console.log('\n⏸️  Waiting for user to paste results...');
    break; // Process one at a time
  }
}

if (batchNum === '--all') {
  invokeSkillForAll();
} else {
  invokSkillForBatch(parseInt(batchNum));
}
