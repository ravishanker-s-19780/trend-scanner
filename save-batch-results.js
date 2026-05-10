#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, 'evidence/image_features');

fs.mkdirSync(outputDir, { recursive: true });

// Read stdin for JSON features
let jsonInput = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', chunk => {
  jsonInput += chunk;
});

process.stdin.on('end', () => {
  try {
    const features = JSON.parse(jsonInput);
    if (!Array.isArray(features)) {
      console.error('❌ Input must be a JSON array');
      process.exit(1);
    }

    // Corresponding products from batch_1
    const products = [
      { product_id: "6e271ae565c4", source: "ajio", keyword: "nighty", title: "Women Floral Print Nightie with Lace Details", url: "https://www.ajio.com/ichaa-women-floral-print-nightie-with-lace-details/p/702302063_peach?", price: 499, rating: 3.8, review_count: 276, image: "https://assets-jiocdn.ajio.com/medias/sys_master/root1/20260509/giFf/69ff678814d0c21719ce1978/ichaa_peach_women_floral_print_nightie_with_lace_details.jpg" },
      { product_id: "700a5a5663b3", source: "ajio", keyword: "nighty", title: "Women Printed Nightie", url: "https://www.ajio.com/rio-women-printed-nightie/p/443099321_mustard?", price: 399, rating: 4.2, review_count: 15, image: "https://assets-jiocdn.ajio.com/medias/sys_master/root1/20260421/5CYP/69e729d4fcb5bb61d26cfa29/rio_mustard_women_printed_nightie.jpg" },
      { product_id: "c520b7e614c3", source: "ajio", keyword: "nighty", title: "Women Floral Print Nightie with Insert Pocket", url: "https://www.ajio.com/rio-women-floral-print-nightie-with-insert-pocket/p/443082566_ltblue?", price: 399, rating: 4, review_count: 230, image: "https://assets-jiocdn.ajio.com/medias/sys_master/root1/20250813/Gxsl/689c6a1b3d468c61ab68f5e6/rio_blue_women_floral_print_nightie_with_insert_pocket.jpg" },
      { product_id: "dfeaf4513c5f", source: "ajio", keyword: "nighty", title: "Women Floral Print Nightie with Insert Pocket", url: "https://www.ajio.com/rio-women-floral-print-nightie-with-insert-pocket/p/443099322_ltgreen?", price: 399, rating: 4.1, review_count: 114, image: "https://assets-jiocdn.ajio.com/medias/sys_master/root1/20260220/2ZZE/6998110ecbfa0d56082396e1/rio_green_women_floral_print_nightie_with_insert_pocket.jpg" },
      { product_id: "f40b244be926", source: "ajio", keyword: "nighty", title: "Women Printed Round-Neck Nightie", url: "https://www.ajio.com/buythattrendz-women-printed-round-neck-nightie/p/701558543_navy?", price: 350, rating: 3, review_count: 6, image: "https://assets-jiocdn.ajio.com/medias/sys_master/root/20250509/chCK/681e32ba55340d4b4f278ffa/buythattrendz_navy_blue_women_printed_round-neck_nightie.jpg" }
    ];

    // Merge features with products
    const enriched = [];
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const feature = features[i] || {};

      enriched.push({
        product_id: product.product_id,
        source: product.source,
        keyword: product.keyword,
        title: product.title,
        url: product.url,
        price: product.price,
        rating: product.rating,
        review_count: product.review_count,
        image: product.image,
        neck_type: feature.neck_type || null,
        design_pattern: feature.design_pattern || null,
        front_top_treatment: feature.front_top_treatment || null,
        front_bottom_style: feature.front_bottom_style || null,
        primary_color: feature.primary_color || null,
        secondary_color: feature.secondary_color || null,
        sleeve_length: feature.sleeve_length || null,
        cloth_texture: feature.cloth_texture || null,
        confidence: feature.confidence || 'medium',
        notes: feature.notes || null
      });
    }

    // Save to evidence/image_features
    const platformDir = path.join(outputDir, 'ajio');
    fs.mkdirSync(platformDir, { recursive: true });

    const outFile = path.join(platformDir, 'nighty.json');
    fs.writeFileSync(outFile, JSON.stringify(enriched, null, 2));

    console.log(`✅ Saved ${enriched.length} enriched products to evidence/image_features/ajio/nighty.json`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
});

if (process.stdin.isTTY) {
  console.log('Usage: cat features.json | node save-batch-results.js');
  console.log('Or: echo \'[...JSON...]\' | node save-batch-results.js');
}
