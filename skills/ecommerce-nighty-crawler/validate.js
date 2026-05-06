/**
 * Validation and testing script for E-Commerce Nighty Crawler
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Validate skill configuration
function validateSkillConfig() {
  console.log('🔍 Validating skill configuration...\n');
  
  const skillFile = path.join(__dirname, 'ecommerce-nighty-crawler.skill');
  
  if (!fs.existsSync(skillFile)) {
    console.error('❌ Skill file not found:', skillFile);
    return false;
  }
  
  try {
    const skillConfig = JSON.parse(fs.readFileSync(skillFile, 'utf8'));
    
    // Required fields
    const requiredFields = ['name', 'title', 'description', 'version', 'inputs', 'outputs'];
    const missingFields = requiredFields.filter(field => !skillConfig[field]);
    
    if (missingFields.length > 0) {
      console.error('❌ Missing required fields:', missingFields);
      return false;
    }
    
    // Validate inputs structure
    if (!skillConfig.inputs || typeof skillConfig.inputs !== 'object') {
      console.error('❌ Invalid inputs structure');
      return false;
    }
    
    // Validate outputs structure
    if (!skillConfig.outputs || typeof skillConfig.outputs !== 'object') {
      console.error('❌ Invalid outputs structure');
      return false;
    }
    
    console.log('✅ Skill configuration valid');
    console.log(`  - Name: ${skillConfig.name}`);
    console.log(`  - Version: ${skillConfig.version}`);
    console.log(`  - Input parameters: ${Object.keys(skillConfig.inputs).length}`);
    console.log(`  - Supported platforms: ${skillConfig.supportedPlatforms?.length || 0}\n`);
    
    return true;
  } catch (error) {
    console.error('❌ Error parsing skill file:', error.message);
    return false;
  }
}

// Validate required files
function validateFiles() {
  console.log('📁 Validating project structure...\n');
  
  const requiredFiles = [
    'SKILL.md',
    'README.md',
    'CONFIG.md',
    'ecommerce-nighty-crawler.skill',
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
    'SKILL.md': ['Overview', 'Supported', 'Data Extraction', 'Installation', 'Usage'],
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
