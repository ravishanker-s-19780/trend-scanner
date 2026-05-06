/**
 * Example usage of the E-Commerce Nighty Crawler
 * 
 * This file demonstrates various ways to use the crawler
 * for different analysis scenarios.
 */

const { crawlEcommercePlatforms } = require('./scripts/crawler.js');
const fs = require('fs');
const path = require('path');

// Helper function to save results
async function saveResults(results, filename) {
  const outputDir = path.join(__dirname, 'outputs');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const filepath = path.join(outputDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(results, null, 2));
  console.log(`Results saved to: ${filepath}`);
}

// Example 1: Basic multi-platform crawl
async function exampleBasicCrawl() {
  console.log('\n=== Example 1: Basic Multi-Platform Crawl ===\n');
  
  const results = await crawlEcommercePlatforms({
    platforms: ['amazon', 'myntra'],
    keywords: ['women cotton nighty'],
    maxProducts: 20,
    includeImages: true,
    includeVideos: false
  });
  
  console.log(`✓ Collected ${results.products.length} products`);
  console.log(`✓ From ${results.metadata.platforms_crawled.length} platforms`);
  console.log(`✓ Time taken: ${(results.metadata.total_duration_ms / 1000).toFixed(2)}s`);
  
  await saveResults(results, 'example-1-basic-crawl.json');
}

// Example 2: Wedding-focused analysis
async function exampleWeddingAnalysis() {
  console.log('\n=== Example 2: Wedding-Focused Analysis ===\n');
  
  const results = await crawlEcommercePlatforms({
    platforms: ['nykaa', 'tatacliq', 'zivame'],  // Premium platforms
    keywords: ['wedding nighty', 'bridal nightwear', 'honeymoon wear'],
    maxProducts: 30,
    includeImages: true
  });
  
  // Filter for wedding-relevant products
  const weddingProducts = results.products.filter(
    p => p.purchase_context.wedding_relevant === true
  );
  
  console.log(`✓ Total products: ${results.products.length}`);
  console.log(`✓ Wedding-relevant: ${weddingProducts.length}`);
  console.log(`✓ Wedding relevance: ${((weddingProducts.length / results.products.length) * 100).toFixed(1)}%`);
  
  // Analyze by platform
  const byPlatform = weddingProducts.reduce((acc, p) => {
    acc[p.platform] = (acc[p.platform] || 0) + 1;
    return acc;
  }, {});
  
  console.log('\nWedding products by platform:');
  Object.entries(byPlatform).forEach(([platform, count]) => {
    console.log(`  ${platform}: ${count}`);
  });
  
  await saveResults({ weddingProducts, summary: byPlatform }, 'example-2-wedding-analysis.json');
}

// Example 3: Budget segment comparison
async function exampleBudgetAnalysis() {
  console.log('\n=== Example 3: Budget Segment Analysis ===\n');
  
  const results = await crawlEcommercePlatforms({
    platforms: ['meesho', 'flipkart'],  // Budget platforms
    keywords: ['cheap nighty', 'affordable nightwear', 'budget cotton nighty'],
    maxProducts: 50,
    includeImages: false
  });
  
  // Group by cloth type
  const byClothType = results.products.reduce((acc, p) => {
    const type = p.cloth_type || 'Unknown';
    if (!acc[type]) {
      acc[type] = {
        count: 0,
        avg_rating: 0,
        total_reviews: 0,
        products: []
      };
    }
    acc[type].count += 1;
    acc[type].avg_rating += p.reviews.average_rating;
    acc[type].total_reviews += p.reviews.count;
    acc[type].products.push(p.product_title);
    return acc;
  }, {});
  
  // Calculate averages
  Object.keys(byClothType).forEach(type => {
    byClothType[type].avg_rating = (byClothType[type].avg_rating / byClothType[type].count).toFixed(2);
  });
  
  console.log('Popular cloth types in budget segment:');
  Object.entries(byClothType)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([type, data]) => {
      console.log(`  ${type}: ${data.count} products (Avg rating: ${data.avg_rating}⭐, Reviews: ${data.total_reviews})`);
    });
  
  await saveResults(byClothType, 'example-3-budget-analysis.json');
}

// Example 4: Design trends analysis
async function exampleDesignTrends() {
  console.log('\n=== Example 4: Design Trends Analysis ===\n');
  
  const results = await crawlEcommercePlatforms({
    platforms: ['amazon', 'myntra', 'nykaa'],
    keywords: ['women nighty', 'ladies sleep wear', 'nightgown'],
    maxProducts: 30
  });
  
  // Analyze design names
  const designFrequency = results.products.reduce((acc, p) => {
    const design = p.design_name || 'Unknown';
    acc[design] = (acc[design] || 0) + 1;
    return acc;
  }, {});
  
  console.log('Top design trends:');
  Object.entries(designFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([design, count]) => {
      console.log(`  ${design}: ${count} products`);
    });
  
  // Analyze design popularity by rating
  const designQuality = results.products.reduce((acc, p) => {
    const design = p.design_name || 'Unknown';
    if (!acc[design]) {
      acc[design] = { count: 0, avg_rating: 0 };
    }
    acc[design].count += 1;
    acc[design].avg_rating += p.reviews.average_rating;
    return acc;
  }, {});
  
  Object.keys(designQuality).forEach(design => {
    designQuality[design].avg_rating = (designQuality[design].avg_rating / designQuality[design].count).toFixed(2);
  });
  
  console.log('\nDesign quality (avg rating):');
  Object.entries(designQuality)
    .sort((a, b) => b[1].avg_rating - a[1].avg_rating)
    .slice(0, 5)
    .forEach(([design, data]) => {
      console.log(`  ${design}: ${data.avg_rating}⭐ (${data.count} products)`);
    });
  
  await saveResults({ designFrequency, designQuality }, 'example-4-design-trends.json');
}

// Example 5: Purchaser demographics analysis
async function exampleDemographicsAnalysis() {
  console.log('\n=== Example 5: Purchaser Demographics Analysis ===\n');
  
  const results = await crawlEcommercePlatforms({
    platforms: ['amazon', 'myntra', 'meesho', 'flipkart'],
    keywords: ['women nighty', 'ladies nightwear'],
    maxProducts: 40
  });
  
  // Analyze by age group
  const byAgeGroup = results.products.reduce((acc, p) => {
    const age = p.purchaser_profile.age_range || 'Unknown';
    acc[age] = (acc[age] || 0) + 1;
    return acc;
  }, {});
  
  console.log('Product popularity by age group:');
  Object.entries(byAgeGroup)
    .sort((a, b) => b[1] - a[1])
    .forEach(([age, count]) => {
      console.log(`  ${age}: ${count} products`);
    });
  
  // Analyze by location
  const topLocations = results.products.reduce((acc, p) => {
    const locations = p.purchaser_profile.primary_location?.split(',') || [];
    locations.forEach(loc => {
      const trimmed = loc.trim();
      acc[trimmed] = (acc[trimmed] || 0) + 1;
    });
    return acc;
  }, {});
  
  console.log('\nTop purchase locations:');
  Object.entries(topLocations)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([location, count]) => {
      console.log(`  ${location}: ${count}`);
    });
  
  await saveResults({ byAgeGroup, topLocations }, 'example-5-demographics.json');
}

// Example 6: Full comprehensive crawl
async function exampleComprehensiveCrawl() {
  console.log('\n=== Example 6: Full Comprehensive Crawl (All Platforms) ===\n');
  console.log('⚠️  This will take 30-60 minutes. Use sparingly.\n');
  
  const results = await crawlEcommercePlatforms({
    platforms: ['amazon', 'myntra', 'flipkart', 'ajio', 'meesho', 'nykaa', 'clovia', 'zivame'],
    keywords: [
      'women cotton nighty',
      'ladies nightwear',
      'sleep wear women',
      'nightgown',
      'pajama sets'
    ],
    maxProducts: 30,
    includeImages: true,
    includeVideos: false
  });
  
  console.log(`\n✓ Comprehensive crawl complete!`);
  console.log(`  Total products: ${results.products.length}`);
  console.log(`  Time taken: ${(results.metadata.total_duration_ms / 1000 / 60).toFixed(1)} minutes`);
  console.log(`  Data quality: ${results.metadata.data_quality}`);
  
  if (results.errors) {
    console.log(`  Errors encountered: ${results.errors.length}`);
  }
  
  // Summary statistics
  const avgRating = (results.products.reduce((sum, p) => sum + p.reviews.average_rating, 0) / results.products.length).toFixed(2);
  const totalReviews = results.products.reduce((sum, p) => sum + p.reviews.count, 0);
  
  console.log(`\nSummary statistics:`);
  console.log(`  Average rating: ${avgRating}⭐`);
  console.log(`  Total reviews collected: ${totalReviews}`);
  console.log(`  Products with images: ${results.products.filter(p => p.media.images.length > 0).length}`);
  
  await saveResults(results, 'example-6-comprehensive-crawl.json');
}

// Run examples
async function runExamples() {
  console.log('🚀 E-Commerce Nighty Crawler Examples\n');
  console.log('Choose which example to run:');
  console.log('  1. Basic multi-platform crawl');
  console.log('  2. Wedding-focused analysis');
  console.log('  3. Budget segment analysis');
  console.log('  4. Design trends analysis');
  console.log('  5. Purchaser demographics analysis');
  console.log('  6. Full comprehensive crawl\n');
  
  // For demo, run example 1
  console.log('Running Example 1 (Basic crawl)...');
  try {
    await exampleBasicCrawl();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Export functions
module.exports = {
  exampleBasicCrawl,
  exampleWeddingAnalysis,
  exampleBudgetAnalysis,
  exampleDesignTrends,
  exampleDemographicsAnalysis,
  exampleComprehensiveCrawl,
  runExamples
};

// Run if executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}
