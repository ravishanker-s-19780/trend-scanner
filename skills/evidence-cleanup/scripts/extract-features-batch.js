#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not set. Run: export ANTHROPIC_API_KEY=your-key');
  process.exit(1);
}

const BATCH_SIZE = 5;
const DELAY_MS = 1000;
const API_URL = 'https://api.anthropic.com/v1/messages';

// Garment feature extraction prompt
const FEATURE_PROMPT = `You are analyzing ladies' nightwear product images. Extract these exact fields for EACH product:

For each image URL provided, respond with ONLY valid JSON (no markdown, no explanation):
{
  "image_url": "url",
  "neck_type": "round|v-neck|square|boat|other",
  "design_pattern": "floral|geometric|plain|striped|checkered|abstract|other",
  "front_top_treatment": "embroidery|print|plain|lace|other",
  "front_bottom_style": "umbrella|straight|open-type|a-line|other",
  "primary_color": "color_name",
  "secondary_color": "color_name|none|null",
  "sleeve_length": "half|three-quarter|full|sleeveless",
  "cloth_texture": "cotton|satin|silk-like|polyester-look|unsure",
  "confidence": "high|medium|low",
  "notes": "string or null"
}

Analyze based on visual appearance only. For unclear features, set confidence to "low" and explain in notes.`;

async function extractFeaturesFromUrls(imageUrls) {
  const imageContent = imageUrls.map(url => ({
    type: 'image',
    source: { type: 'url', url }
  }));

  imageContent.push({
    type: 'text',
    text: `Extract garment features from these ${imageUrls.length} product images. Return a JSON array with one object per image (in the same order).`
  });

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: FEATURE_PROMPT,
      messages: [
        {
          role: 'user',
          content: imageContent
        }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  const content = data.content[0].text;

  // Try to parse JSON response
  try {
    return JSON.parse(content);
  } catch {
    console.warn('⚠️  Failed to parse response as JSON, attempting extraction...');
    // Try to extract JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    throw new Error('Could not extract valid JSON from response');
  }
}

async function processProducts() {
  const evidenceDir = path.join(PROJECT_ROOT, 'evidence/original');
  const outputDir = path.join(PROJECT_ROOT, 'evidence/image_features');

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  const platforms = fs.readdirSync(evidenceDir).filter(f => f.endsWith('.json'));
  let totalProcessed = 0;
  let totalErrors = 0;

  console.log(`📦 Found ${platforms.length} platform files\n`);

  for (const platformFile of platforms) {
    const platform = platformFile.replace('.json', '');
    const platformPath = path.join(evidenceDir, platformFile);
    const platformDir = path.join(outputDir, platform);

    fs.mkdirSync(platformDir, { recursive: true });

    const products = JSON.parse(fs.readFileSync(platformPath, 'utf8'));
    console.log(`\n🔍 Processing ${platform}: ${products.length} products`);

    // Group by keyword
    const byKeyword = {};
    for (const product of products) {
      const keyword = product.keyword || 'unknown';
      if (!byKeyword[keyword]) byKeyword[keyword] = [];
      byKeyword[keyword].push(product);
    }

    // Process each keyword group
    for (const [keyword, items] of Object.entries(byKeyword)) {
      const keywordSlug = keyword.toLowerCase().replace(/\s+/g, '-');
      const outputPath = path.join(platformDir, `${keywordSlug}.json`);

      // Normalize field names: evidence/original/ uses product_title/product_url/images[]
      // while image_features/ uses title/url/image (string). Support both formats.
      const getImage = p => p.image || (Array.isArray(p.images) ? p.images[0] : null);
      const productsWithImages = items.filter(p => getImage(p));
      if (productsWithImages.length === 0) {
        console.log(`  ⊘ ${keyword}: no images, skipped`);
        continue;
      }

      console.log(`  📸 ${keyword}: ${productsWithImages.length} products with images`);

      const enriched = [];

      // Process in batches
      for (let i = 0; i < productsWithImages.length; i += BATCH_SIZE) {
        const batch = productsWithImages.slice(i, i + BATCH_SIZE);
        const imageUrls = batch.map(p => getImage(p));

        try {
          process.stdout.write(`    Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(productsWithImages.length / BATCH_SIZE)}... `);

          const features = await extractFeaturesFromUrls(imageUrls);
          const featureArray = Array.isArray(features) ? features : [features];

          // Merge with original product data
          for (let j = 0; j < batch.length; j++) {
            const product = batch[j];
            const feature = featureArray[j] || {};
            enriched.push({
              product_id: product.product_id || '',
              source: platform,
              keyword,
              title: product.product_title || product.title || '',
              url: product.product_url || product.url || '',
              price: product.price != null ? product.price : '',
              rating: product.rating != null ? product.rating : '',
              review_count: product.review_count != null ? product.review_count : null,
              image: getImage(product),
              // Enrichment fields from crawler — passed through unchanged
              fabric_type: product.fabric_type || null,
              size_chart: product.size_chart || null,
              nursing_label: product.nursing_label || null,
              // Vision-extracted features
              neck_type: feature.neck_type || null,
              design_pattern: feature.design_pattern || null,
              front_top_treatment: feature.front_top_treatment || null,
              front_bottom_style: feature.front_bottom_style || null,
              primary_color: feature.primary_color || null,
              secondary_color: feature.secondary_color || null,
              sleeve_length: feature.sleeve_length || null,
              cloth_texture: feature.cloth_texture || null,
              confidence: feature.confidence || 'low',
              notes: feature.notes || null
            });
          }

          console.log('✓');
          totalProcessed += batch.length;

          // Rate limiting
          if (i + BATCH_SIZE < productsWithImages.length) {
            await new Promise(r => setTimeout(r, DELAY_MS));
          }
        } catch (error) {
          console.log(`✗ (${error.message})`);
          totalErrors += batch.length;
        }
      }

      // Write output for this keyword
      fs.writeFileSync(outputPath, JSON.stringify(enriched, null, 2));
      console.log(`    → Saved ${enriched.length} enriched products to ${keywordSlug}.json\n`);
    }
  }

  console.log(`\n✅ Complete: ${totalProcessed} products processed, ${totalErrors} errors`);
}

processProducts().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
