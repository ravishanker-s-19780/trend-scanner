/**
 * Example usage of the E-Commerce Nighty Crawler
 * 
 * This file demonstrates various ways to use the crawler
 * for different analysis scenarios.
 * 
 * Results are incrementally saved to: evidence/<platform>/<keyword>.jsonl
 */

import { crawlEcommercePlatforms } from './scripts/crawler.js';

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
  
  console.log(`\n✓ Crawl complete!`);
  console.log(`✓ Results stored in: evidence/ directory`);
  console.log(`✓ Time taken: ${(results.metadata.total_duration_ms / 1000).toFixed(2)}s`);
  console.log(`\nFiles created:`);
  Object.entries(results.results).forEach(([platform, keywords]) => {
    console.log(`  📁 ${platform}/`);
    Object.entries(keywords).forEach(([keyword, count]) => {
      const slugifiedKeyword = keyword.toLowerCase().trim().replace(/\s+/g, '-');
      console.log(`    └─ ${slugifiedKeyword}.json (${count} products)`);
    });
  });
}

// Example 2: Wedding-focused analysis
async function exampleWeddingAnalysis() {
  console.log('\n=== Example 2: Wedding-Focused Analysis ===\n');
  
  const results = await crawlEcommercePlatforms({
    platforms: ['myntra'],
    keywords: ['wedding nighty', 'bridal nightwear', 'honeymoon wear'],
    maxProducts: 30,
    includeImages: true
  });
  
  console.log(`✓ Crawl complete!`);
  console.log(`✓ Check evidence/ directory for platform-specific files`);
  console.log(`\nData saved to:`);
  Object.entries(results.results).forEach(([platform, keywords]) => {
    console.log(`  📁 ${platform}/ directory:`);
    Object.entries(keywords).forEach(([keyword, count]) => {
      const slugifiedKeyword = keyword.toLowerCase().trim().replace(/\s+/g, '-');
      console.log(`    └─ ${slugifiedKeyword}.json (${count} products)`);
    });
  });
}

// Example 3: Budget segment analysis
async function exampleBudgetAnalysis() {
  console.log('\n=== Example 3: Budget Segment Analysis ===\n');
  
  const results = await crawlEcommercePlatforms({
    platforms: ['meesho', 'flipkart'],
    keywords: ['cheap nighty', 'affordable nightwear', 'budget cotton nighty'],
    maxProducts: 50,
    includeImages: false
  });
  
  console.log(`✓ Budget segment crawl complete`);
  console.log(`✓ Files stored in: evidence/meesho/ and evidence/flipkart/`);
  console.log(`\nData summary:`);
  Object.entries(results.results).forEach(([platform, keywords]) => {
    const totalProducts = Object.values(keywords).reduce((a, b) => a + b, 0);
    console.log(`  ${platform}: ${totalProducts} products total`);
  });
}

// Example 4: Design trends analysis
async function exampleDesignTrends() {
  console.log('\n=== Example 4: Design Trends Analysis ===\n');
  
  const results = await crawlEcommercePlatforms({
    platforms: ['amazon', 'myntra'],
    keywords: ['women nighty', 'ladies sleep wear', 'nightgown'],
    maxProducts: 30
  });
  
  console.log(`✓ Design analysis data saved to evidence/`);
  console.log(`✓ Read evidence/amazon/ and evidence/myntra/ to analyze patterns`);
  console.log(`\nEach product JSON includes:`);
  console.log(`  - design_name: Design pattern classification`);
  console.log(`  - cloth_type: Fabric composition`);
  console.log(`  - reviews: Rating and review data`);
}

// Example 5: Purchaser demographics analysis
async function exampleDemographicsAnalysis() {
  console.log('\n=== Example 5: Purchaser Demographics Analysis ===\n');
  
  const results = await crawlEcommercePlatforms({
    platforms: ['amazon', 'myntra', 'meesho', 'flipkart'],
    keywords: ['women nighty', 'ladies nightwear'],
    maxProducts: 40
  });
  
  console.log(`✓ Demographic data collected from ${Object.keys(results.results).length} platforms`);
  const totalProducts = Object.values(results.results).reduce((total, platforms) => {
    return total + Object.values(platforms).reduce((a, b) => a + b, 0);
  }, 0);
  console.log(`✓ Total product records: ${totalProducts}`);
  console.log(`✓ Check purchaser_profile in each product for: location, age_range, repeat_purchase_rate`);
}

// Example 6: Full comprehensive crawl
async function exampleComprehensiveCrawl() {
  console.log('\n=== Example 6: Full Comprehensive Crawl ===\n');
  console.log('⚠️  This will take 30-60 minutes. Results will be saved to evidence/ directory.\n');
  
  const results = await crawlEcommercePlatforms({
    platforms: ['amazon', 'myntra', 'flipkart', 'ajio', 'meesho'],
    keywords: [
      'women cotton nighty',
      'ladies nightwear',
      'sleep wear women'
    ],
    maxProducts: 30,
    includeImages: true,
    includeVideos: false
  });
  
  console.log(`\n✓ Comprehensive crawl complete!`);
  console.log(`✓ Time taken: ${(results.metadata.total_duration_ms / 1000 / 60).toFixed(1)} minutes`);
  console.log(`✓ Data quality: ${results.metadata.data_quality}`);
  console.log(`✓ Total platforms crawled: ${Object.keys(results.results).length}`);
  
  console.log(`\n📊 Summary of files created:`);
  Object.entries(results.results).forEach(([platform, keywords]) => {
    const totalCount = Object.values(keywords).reduce((a, b) => a + b, 0);
    console.log(`  ${platform}: ${Object.keys(keywords).length} keyword files, ${totalCount} products`);
  });
  
  if (results.errors && results.errors.length > 0) {
    console.log(`\n⚠️  Errors encountered: ${results.errors.length}`);
    results.errors.forEach(err => {
      console.log(`  - ${err.platform} (${err.keyword}): ${err.error}`);
    });
  }
}

// Main runner
async function runExamples() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   E-Commerce Nighty Crawler - Usage Examples              ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  
  console.log('\nAvailable examples:');
  console.log('  1. exampleBasicCrawl()              - Two platforms, one keyword');
  console.log('  2. exampleWeddingAnalysis()         - Wedding-focused search');
  console.log('  3. exampleBudgetAnalysis()          - Budget platform crawling');
  console.log('  4. exampleDesignTrends()            - Design pattern analysis');
  console.log('  5. exampleDemographicsAnalysis()    - Purchaser demographics');
  console.log('  6. exampleComprehensiveCrawl()      - Full multi-platform crawl\n');
  
  console.log('Run any example:');
  console.log('  await exampleBasicCrawl()\n');
  
  // For demo, run example 1
  console.log('Running Example 1...');
  try {
    await exampleBasicCrawl();
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Export functions
export {
  exampleBasicCrawl,
  exampleWeddingAnalysis,
  exampleBudgetAnalysis,
  exampleDesignTrends,
  exampleDemographicsAnalysis,
  exampleComprehensiveCrawl,
  runExamples
};

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples().catch(console.error);
}
