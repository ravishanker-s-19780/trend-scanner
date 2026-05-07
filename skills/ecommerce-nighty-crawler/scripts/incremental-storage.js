/**
 * Incremental Storage Manager for E-Commerce Nighty Crawler
 * 
 * Implements append-only JSONL storage with deduplication by URL.
 * Tracks new products, price changes, and review updates across crawls.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class IncrementalStorageManager {
  constructor(evidenceDir = null) {
    this.evidenceDir = evidenceDir || path.join(__dirname, '../evidence');
    this.dedupIndexPath = path.join(this.evidenceDir, '_dedup_index.json');
    this.crawlLogPath = path.join(this.evidenceDir, '_crawl_log.json');
    this.dedupIndex = this.loadDedupIndex();
    this.crawlLog = this.loadCrawlLog();
    this.crawlId = this.generateCrawlId();
  }

  /**
   * Generate unique crawl ID
   */
  generateCrawlId() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const hash = crypto.randomBytes(4).toString('hex');
    return `crawl-${timestamp}-${hash}`;
  }

  /**
   * Load global deduplication index
   */
  loadDedupIndex() {
    if (fs.existsSync(this.dedupIndexPath)) {
      const content = fs.readFileSync(this.dedupIndexPath, 'utf8');
      return JSON.parse(content || '{}');
    }
    return {};
  }

  /**
   * Load crawl log
   */
  loadCrawlLog() {
    if (fs.existsSync(this.crawlLogPath)) {
      const content = fs.readFileSync(this.crawlLogPath, 'utf8');
      return JSON.parse(content || '[]');
    }
    return [];
  }

  /**
   * Generate product ID from URL
   */
  generateProductId(platform, url) {
    const normalized = `${platform}:${this.normalizeUrl(url)}`;
    return `${platform}-${crypto.createHash('md5').update(normalized).digest('hex').substring(0, 12)}`;
  }

  /**
   * Normalize URL for comparison
   */
  normalizeUrl(url) {
    try {
      const urlObj = new URL(url);
      // Remove tracking parameters
      const params = new URLSearchParams(urlObj.search);
      params.delete('ref');
      params.delete('tag');
      params.delete('utm_source');
      params.delete('utm_campaign');
      
      return `${urlObj.hostname}${urlObj.pathname}`;
    } catch {
      return url;
    }
  }

  /**
   * Save product with deduplication and change tracking
   */
  saveProduct(platform, keyword, product) {
    const productId = this.generateProductId(platform, product.url);
    const slugKeyword = keyword.toLowerCase().replace(/\s+/g, '-');
    const platformDir = path.join(this.evidenceDir, platform);
    const jsonlPath = path.join(platformDir, `${slugKeyword}.jsonl`);
    const metaPath = path.join(platformDir, `${slugKeyword}.meta.json`);

    // Ensure directories exist
    if (!fs.existsSync(platformDir)) {
      fs.mkdirSync(platformDir, { recursive: true });
    }

    // Load existing metadata
    let metadata = {};
    if (fs.existsSync(metaPath)) {
      metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } else {
      metadata = {
        platform,
        keyword,
        created_at: new Date().toISOString(),
        crawl_history: [],
        total_unique_products: 0,
        new_in_last_crawl: [],
        updated_in_last_crawl: [],
        last_updated: null
      };
    }

    // Check if product already exists
    const isNew = !this.dedupIndex[productId];
    let isUpdated = false;
    let previousData = null;

    if (!isNew) {
      // Load existing product record to compare
      previousData = this.findProductById(platform, keyword, productId);
      if (previousData) {
        isUpdated = this.hasProductChanged(previousData, product);
      }
    }

    // Enrich product with metadata
    const enrichedProduct = {
      product_id: productId,
      platform,
      keyword,
      ...product,
      crawl_id: this.crawlId,
      crawl_sequence: metadata.crawl_history.length + 1,
      is_new_in_this_run: isNew,
      has_changes: isUpdated,
      times_seen: isNew ? 1 : (previousData?.times_seen || 0) + 1,
      first_seen: isNew ? new Date().toISOString() : previousData?.first_seen,
      last_updated: new Date().toISOString()
    };

    // Track price changes
    if (!isNew && previousData && previousData.price !== product.price) {
      enrichedProduct.price_changed = true;
      enrichedProduct.previous_price = previousData.price;
      enrichedProduct.current_price = product.price;
    }

    // Track review changes
    if (!isNew && previousData && previousData.review_count !== product.review_count) {
      enrichedProduct.review_count_changed = true;
      enrichedProduct.previous_review_count = previousData.review_count;
      enrichedProduct.current_review_count = product.review_count;
    }

    // Append to JSONL file
    const jsonlLine = JSON.stringify(enrichedProduct);
    fs.appendFileSync(jsonlPath, jsonlLine + '\n');

    // Update deduplication index
    if (isNew) {
      this.dedupIndex[productId] = `${platform}/${slugKeyword}`;
      metadata.new_in_last_crawl.push(productId);
      metadata.total_unique_products += 1;
    } else if (isUpdated) {
      metadata.updated_in_last_crawl.push(productId);
    }

    // Update metadata
    metadata.last_updated = new Date().toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

    return {
      productId,
      isNew,
      isUpdated,
      enrichedProduct
    };
  }

  /**
   * Find existing product by ID
   */
  findProductById(platform, keyword, productId) {
    const slugKeyword = keyword.toLowerCase().replace(/\s+/g, '-');
    const jsonlPath = path.join(this.evidenceDir, platform, `${slugKeyword}.jsonl`);

    if (!fs.existsSync(jsonlPath)) {
      return null;
    }

    const lines = fs.readFileSync(jsonlPath, 'utf8').split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        if (record.product_id === productId) {
          return record;
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  /**
   * Detect if product has meaningful changes
   */
  hasProductChanged(previousProduct, currentProduct) {
    const fieldsToCheck = ['price', 'review_count', 'average_rating', 'title'];
    for (const field of fieldsToCheck) {
      if (previousProduct[field] !== currentProduct[field]) {
        return true;
      }
    }
    return false;
  }

  /**
   * Save crawl summary
   */
  saveCrawlSummary(platform, keyword, stats) {
    const crawlRecord = {
      crawl_id: this.crawlId,
      platform,
      keyword,
      timestamp: new Date().toISOString(),
      ...stats
    };

    this.crawlLog.push(crawlRecord);
    fs.writeFileSync(this.crawlLogPath, JSON.stringify(this.crawlLog, null, 2));
  }

  /**
   * Save updated deduplication index
   */
  saveDedupIndex() {
    fs.writeFileSync(this.dedupIndexPath, JSON.stringify(this.dedupIndex, null, 2));
  }

  /**
   * Query products by criteria
   */
  queryProducts(platform, keyword, filter = {}) {
    const slugKeyword = keyword.toLowerCase().replace(/\s+/g, '-');
    const jsonlPath = path.join(this.evidenceDir, platform, `${slugKeyword}.jsonl`);

    if (!fs.existsSync(jsonlPath)) {
      return [];
    }

    const lines = fs.readFileSync(jsonlPath, 'utf8').split('\n').filter(l => l.trim());
    const products = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(p => p !== null);

    // Apply filters
    return products.filter(product => {
      if (filter.isNew && !product.is_new_in_this_run) return false;
      if (filter.priceChanged && !product.price_changed) return false;
      if (filter.reviewsGrew && !product.review_count_changed) return false;
      if (filter.minRating && product.average_rating < filter.minRating) return false;
      if (filter.hasImages && (!product.images || product.images.length === 0)) return false;
      return true;
    });
  }

  /**
   * Get new products from last crawl
   */
  getNewProducts(platform, keyword) {
    return this.queryProducts(platform, keyword, { isNew: true });
  }

  /**
   * Get products with price changes
   */
  getPriceChanges(platform, keyword) {
    return this.queryProducts(platform, keyword, { priceChanged: true });
  }

  /**
   * Get trending products (seen multiple times with growing reviews)
   */
  getTrendingProducts(platform, keyword, minSeenCount = 3) {
    const all = this.queryProducts(platform, keyword);
    return all.filter(p => 
      p.times_seen >= minSeenCount && 
      p.review_count_changed && 
      p.current_review_count > p.previous_review_count * 1.1
    );
  }

  /**
   * Get deduplication statistics
   */
  getDeduplicationStats(platform, keyword) {
    const metaPath = path.join(this.evidenceDir, platform, `${keyword.toLowerCase().replace(/\s+/g, '-')}.meta.json`);
    
    if (!fs.existsSync(metaPath)) {
      return null;
    }

    return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  }

  /**
   * Export products as JSON array
   */
  exportAsJson(platform, keyword) {
    const products = this.queryProducts(platform, keyword);
    return JSON.stringify(products, null, 2);
  }

  /**
   * Export products as CSV
   */
  exportAsCsv(platform, keyword, fields = ['product_id', 'title', 'price', 'average_rating', 'review_count', 'is_new_in_this_run', 'price_changed']) {
    const products = this.queryProducts(platform, keyword);
    
    const header = fields.join(',');
    const rows = products.map(p => 
      fields.map(field => {
        const value = p[field];
        // Escape commas and quotes in values
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    );

    return [header, ...rows].join('\n');
  }
}

export default IncrementalStorageManager;
