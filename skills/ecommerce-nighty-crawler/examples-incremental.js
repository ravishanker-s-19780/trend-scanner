/**
 * Incremental Crawling Examples
 * 
 * Demonstrates append-based storage with deduplication and change tracking
 */

import IncrementalStorageManager from './scripts/incremental-storage.js';

// Example 1: Basic incremental crawl with change tracking
async function exampleIncrementalBasic() {
  console.log('\n=== Example 1: Incremental Basic Crawl ===\n');
  
  const storage = new IncrementalStorageManager();
  
  // Simulated crawl results
  const crawlResults = {
    platform: 'amazon',
    keyword: 'women cotton nighty',
    products: [
      {
        url: 'https://amazon.in/dp/B0123ABCDE',
        title: 'Women 100% Cotton Floral Nighty',
        price: 399,
        review_count: 263,
        average_rating: 4.2,
        images: ['image1.jpg']
      },
      {
        url: 'https://amazon.in/dp/B0456HIJKL',
        title: 'Cotton Solid Pink Nightgown',
        price: 599,
        review_count: 145,
        average_rating: 4.5,
        images: ['image2.jpg']
      }
    ]
  };

  // Save each product
  let newCount = 0, updatedCount = 0;
  for (const product of crawlResults.products) {
    const result = storage.saveProduct(crawlResults.platform, crawlResults.keyword, product);
    if (result.isNew) newCount++;
    if (result.isUpdated) updatedCount++;
    console.log(`Saved: ${result.enrichedProduct.title}`);
    console.log(`  Status: ${result.isNew ? 'NEW' : result.isUpdated ? 'UPDATED' : 'DUPLICATE'}`);
  }

  // Save crawl summary
  storage.saveCrawlSummary(crawlResults.platform, crawlResults.keyword, {
    products_fetched: crawlResults.products.length,
    new_products: newCount,
    updated_products: updatedCount,
    skipped_duplicates: crawlResults.products.length - newCount - updatedCount
  });

  storage.saveDedupIndex();

  console.log(`\n✓ Crawl complete: ${newCount} new, ${updatedCount} updated`);
}

// Example 2: Find new products across multiple crawls
async function exampleFindNewProducts() {
  console.log('\n=== Example 2: Find New Products ===\n');
  
  const storage = new IncrementalStorageManager();
  
  // Get new products from last crawl
  const newProducts = storage.getNewProducts('amazon', 'women cotton nighty');
  
  console.log(`Found ${newProducts.length} new products:\n`);
  newProducts.slice(0, 5).forEach(product => {
    console.log(`✨ NEW: ${product.title}`);
    console.log(`   Price: ₹${product.price}, Rating: ${product.average_rating}⭐`);
    console.log(`   Added in crawl: ${product.crawl_sequence}\n`);
  });
}

// Example 3: Track price changes across crawls
async function exampleTrackPriceChanges() {
  console.log('\n=== Example 3: Price Tracking ===\n');
  
  const storage = new IncrementalStorageManager();
  
  // Get products with price changes
  const priceChanges = storage.getPriceChanges('amazon', 'women cotton nighty');
  
  console.log(`Found ${priceChanges.length} products with price changes:\n`);
  priceChanges.slice(0, 5).forEach(product => {
    const priceDiff = product.current_price - product.previous_price;
    const percentChange = ((priceDiff / product.previous_price) * 100).toFixed(1);
    const direction = priceDiff < 0 ? '📉 DOWN' : '📈 UP';
    
    console.log(`${direction}: ${product.title}`);
    console.log(`   ₹${product.previous_price} → ₹${product.current_price} (${percentChange}%)`);
    console.log(`   Seen ${product.times_seen} times\n`);
  });
}

// Example 4: Identify trending products
async function exampleTrendingProducts() {
  console.log('\n=== Example 4: Trending Products ===\n');
  
  const storage = new IncrementalStorageManager();
  
  // Get trending products (multiple crawls, growing reviews)
  const trending = storage.getTrendingProducts('amazon', 'women cotton nighty', 2);
  
  console.log(`Found ${trending.length} trending products:\n`);
  trending.slice(0, 5).forEach(product => {
    const reviewGrowth = product.current_review_count - product.previous_review_count;
    const growthPercent = ((reviewGrowth / product.previous_review_count) * 100).toFixed(1);
    
    console.log(`🔥 TRENDING: ${product.title}`);
    console.log(`   Reviews: ${product.previous_review_count} → ${product.current_review_count} (+${growthPercent}%)`);
    console.log(`   Seen in ${product.times_seen} crawls`);
    console.log(`   Current rating: ${product.average_rating}⭐\n`);
  });
}

// Example 5: Compare crawls and identify delisted products
async function exampleDelistingAnalysis() {
  console.log('\n=== Example 5: Delisting Analysis ===\n');
  
  const storage = new IncrementalStorageManager();
  
  // Get all products
  const allProducts = storage.queryProducts('amazon', 'women cotton nighty');
  
  // Find products not seen in recent crawls (assume last crawl happened today)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const delistedProducts = allProducts.filter(p => {
    return p.last_updated < thirtyDaysAgo && p.times_seen >= 2;
  });
  
  console.log(`Potentially delisted products (not seen in last 30 days):\n`);
  delistedProducts.slice(0, 5).forEach(product => {
    const lastSeen = new Date(product.last_updated);
    const daysSince = Math.floor((Date.now() - lastSeen) / (24 * 60 * 60 * 1000));
    
    console.log(`⚠️  ${product.title}`);
    console.log(`   Last seen: ${daysSince} days ago`);
    console.log(`   Was available in ${product.times_seen} crawls\n`);
  });
}

// Example 6: Deduplication statistics
async function exampleDeduplicationStats() {
  console.log('\n=== Example 6: Deduplication Statistics ===\n');
  
  const storage = new IncrementalStorageManager();
  
  const stats = storage.getDeduplicationStats('amazon', 'women cotton nighty');
  
  if (stats) {
    console.log(`Platform: ${stats.platform}`);
    console.log(`Keyword: ${stats.keyword}`);
    console.log(`Total unique products: ${stats.total_unique_products}`);
    console.log(`New in last crawl: ${stats.new_in_last_crawl.length}`);
    console.log(`Updated in last crawl: ${stats.updated_in_last_crawl.length}`);
    console.log(`Total crawls: ${stats.crawl_history.length}`);
    console.log(`Last updated: ${stats.last_updated}\n`);
    
    // Show crawl history
    console.log('Recent crawls:');
    stats.crawl_history.slice(-5).reverse().forEach((crawl, idx) => {
      console.log(`  ${idx + 1}. ${crawl.timestamp}`);
    });
  }
}

// Example 7: Export data for analysis
async function exampleExportData() {
  console.log('\n=== Example 7: Export Data ===\n');
  
  const storage = new IncrementalStorageManager();
  
  // Export as JSON
  const jsonData = storage.exportAsJson('amazon', 'women cotton nighty');
  console.log('JSON export (first 500 chars):');
  console.log(jsonData.substring(0, 500) + '...\n');
  
  // Export as CSV
  const csvData = storage.exportAsCsv('amazon', 'women cotton nighty');
  console.log('CSV export:');
  console.log(csvData.split('\n').slice(0, 5).join('\n'));
  console.log('...\n');
}

// Example 8: Complex filtering and analysis
async function exampleComplexAnalysis() {
  console.log('\n=== Example 8: Complex Analysis ===\n');
  
  const storage = new IncrementalStorageManager();
  
  // Query high-rated new products
  const highRatedNew = storage.queryProducts('amazon', 'women cotton nighty')
    .filter(p => p.is_new_in_this_run && p.average_rating >= 4.0);
  
  console.log(`High-rated new products (4.0⭐ or above):\n`);
  highRatedNew.slice(0, 5).forEach(product => {
    console.log(`${product.title}`);
    console.log(`  ₹${product.price} | ${product.average_rating}⭐ (${product.review_count} reviews)`);
    console.log(`  Added in crawl ${product.crawl_sequence}\n`);
  });
  
  // Price distribution analysis
  const allProducts = storage.queryProducts('amazon', 'women cotton nighty');
  const prices = allProducts.map(p => p.price).filter(p => p);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const maxPrice = Math.max(...prices);
  const minPrice = Math.min(...prices);
  
  console.log(`\nPrice Analysis:`);
  console.log(`  Average: ₹${avgPrice.toFixed(0)}`);
  console.log(`  Range: ₹${minPrice} - ₹${maxPrice}`);
  console.log(`  Median: ₹${prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)]}`);
}

// Run examples
async function runExamples() {
  console.log('🚀 Incremental Crawling Examples\n');
  console.log('Features: Append-only storage, deduplication, change tracking\n');
  
  try {
    // Run in sequence to show incremental behavior
    await exampleIncrementalBasic();
    await exampleFindNewProducts();
    await exampleTrackPriceChanges();
    await exampleTrendingProducts();
    await exampleDelistingAnalysis();
    await exampleDeduplicationStats();
    await exampleExportData();
    await exampleComplexAnalysis();
    
    console.log('\n✨ All examples completed!');
  } catch (error) {
    console.error('Error running examples:', error.message);
  }
}

export {
  exampleIncrementalBasic,
  exampleFindNewProducts,
  exampleTrackPriceChanges,
  exampleTrendingProducts,
  exampleDelistingAnalysis,
  exampleDeduplicationStats,
  exampleExportData,
  exampleComplexAnalysis,
  runExamples
};

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples().catch(console.error);
}
