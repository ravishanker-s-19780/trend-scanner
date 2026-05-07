/**
 * Validation and testing script for E-Commerce Nighty Crawler
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Validate skill configuration from SKILL.md frontmatter
function validateSkillConfig() {
  console.log('🔍 Validating skill configuration...\n');

  const skillMd = path.join(__dirname, 'SKILL.md');

  if (!fs.existsSync(skillMd)) {
    console.error('❌ SKILL.md not found');
    return false;
  }

  const content = fs.readFileSync(skillMd, 'utf8');
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

  if (!frontmatterMatch) {
    console.error('❌ SKILL.md missing frontmatter (--- block)');
    return false;
  }

  const frontmatter = frontmatterMatch[1];
  const name = (frontmatter.match(/^name:\s*(.+)$/m) || [])[1]?.trim();
  const description = (frontmatter.match(/^description:\s*(.+)$/m) || [])[1]?.trim();
  const compatibility = (frontmatter.match(/^compatibility:\s*(.+)$/m) || [])[1]?.trim();

  const missing = [];
  if (!name) missing.push('name');
  if (!description) missing.push('description');
  if (!compatibility) missing.push('compatibility');

  if (missing.length > 0) {
    console.error('❌ SKILL.md frontmatter missing fields:', missing);
    return false;
  }

  console.log('✅ Skill configuration valid');
  console.log(`  - Name: ${name}`);
  console.log(`  - Description: ${description.slice(0, 60)}...`);
  console.log(`  - Compatibility: ${compatibility}\n`);

  return true;
}

// Validate required files
function validateFiles() {
  console.log('📁 Validating project structure...\n');
  
  const requiredFiles = [
    'SKILL.md',
    'README.md',
    'CONFIG.md',
    'scripts/crawler.js',
    'examples.js'
  ];
  
  let allValid = true;
  
  requiredFiles.forEach(file => {
    const filepath = path.join(__dirname, file);
    if (fs.existsSync(filepath)) {
      console.log(`✅ ${file}`);
    } else {
      console.error(`❌ Missing: ${file}`);
      allValid = false;
    }
  });
  
  console.log();
  return allValid;
}

// Validate crawler implementation
function validateCrawler() {
  console.log('🔧 Validating crawler implementation...\n');
  
  try {
    const crawlerPath = path.join(__dirname, 'scripts/crawler.js');
    const crawlerCode = fs.readFileSync(crawlerPath, 'utf8');
    
    // Check for key functions
    const requiredFunctions = [
      'crawlEcommercePlatforms',
      'scrapeAmazon',
      'scrapeMyntra',
      'extractClothType',
      'extractDesignName',
      'inferPurpose',
      'isWeddingRelevant'
    ];
    
    let missingFunctions = [];
    requiredFunctions.forEach(func => {
      if (!crawlerCode.includes(`function ${func}`) && !crawlerCode.includes(`const ${func}`)) {
        missingFunctions.push(func);
      }
    });
    
    if (missingFunctions.length > 0) {
      console.warn('⚠️  Missing functions:', missingFunctions);
      return false;
    }
    
    console.log('✅ All core functions present');
    
    // Check for platform support
    const platforms = ['amazon', 'myntra', 'flipkart', 'ajio', 'meesho'];
    let supportedPlatforms = 0;
    
    platforms.forEach(platform => {
      if (crawlerCode.includes(`[${platform}]`) || crawlerCode.includes(`'${platform}'`)) {
        console.log(`  ✓ ${platform}`);
        supportedPlatforms++;
      }
    });
    
    console.log(`  Found: ${supportedPlatforms} platforms configured\n`);
    
    return true;
  } catch (error) {
    console.error('❌ Error validating crawler:', error.message);
    return false;
  }
}

// Validate documentation
function validateDocumentation() {
  console.log('📚 Validating documentation...\n');
  
  const files = {
    'SKILL.md': ['Platforms to Crawl', 'Required Output Fields', 'Incremental Storage', 'Crawl Execution', 'Error Handling'],
    'README.md': ['Features', 'Configuration', 'Output Format', 'Examples', 'Performance'],
    'CONFIG.md': ['Platform', 'Rate Limit', 'Extraction Rules', 'Error Handling']
  };
  
  let allValid = true;
  
  Object.entries(files).forEach(([file, keywords]) => {
    const filepath = path.join(__dirname, file);
    
    if (!fs.existsSync(filepath)) {
      console.error(`❌ ${file} not found`);
      allValid = false;
      return;
    }
    
    const content = fs.readFileSync(filepath, 'utf8');
    const missingKeywords = keywords.filter(keyword => 
      !content.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (missingKeywords.length === 0) {
      console.log(`✅ ${file}`);
    } else {
      console.warn(`⚠️  ${file} missing sections: ${missingKeywords.join(', ')}`);
    }
  });
  
  console.log();
  return allValid;
}

// Run all validations
function runValidation() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   E-Commerce Nighty Crawler - Validation Report             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  const results = {
    config: validateSkillConfig(),
    files: validateFiles(),
    crawler: validateCrawler(),
    documentation: validateDocumentation()
  };
  
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Validation Summary                                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  const allValid = Object.values(results).every(r => r);
  
  Object.entries(results).forEach(([category, valid]) => {
    console.log(`${valid ? '✅' : '❌'} ${category.charAt(0).toUpperCase() + category.slice(1)}`);
  });
  
  console.log();
  
  if (allValid) {
    console.log('✨ All validations passed! Skill is ready to use.\n');
    return 0;
  } else {
    console.log('⚠️  Some validations failed. Please review the issues above.\n');
    return 1;
  }
}

// Export and run
export {
  validateSkillConfig,
  validateFiles,
  validateCrawler,
  validateDocumentation,
  runValidation
};

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(runValidation());
}
