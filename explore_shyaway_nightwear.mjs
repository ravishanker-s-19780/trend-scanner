import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const USER_DATA = '/tmp/shyaway-explore';
await fs.mkdir(USER_DATA, { recursive: true });
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36';

let ctx;
try {
  ctx = await chromium.launchPersistentContext(USER_DATA, { headless: true, userAgent: UA, viewport: {width:1366,height:900}, locale:'en-IN', timezoneId:'Asia/Kolkata', args:['--disable-blink-features=AutomationControlled','--no-sandbox'], channel:'chrome' });
} catch {
  ctx = await chromium.launchPersistentContext(USER_DATA, { headless: true, userAgent: UA, viewport: {width:1366,height:900}, locale:'en-IN', timezoneId:'Asia/Kolkata', args:['--disable-blink-features=AutomationControlled','--no-sandbox'] });
}
await ctx.addInitScript(`Object.defineProperty(navigator,'webdriver',{get:()=>undefined});window.chrome={runtime:{}};`);

const page = await ctx.newPage();

// Try different URLs
const urlsToTry = [
  'https://www.shyaway.com/nightwear/',
  'https://www.shyaway.com/nightwear-online/',
  'https://www.shyaway.com/nighty-online/',
  'https://www.shyaway.com/nightwear-online/?q=nighty',
];

for (const url of urlsToTry) {
  console.log(`\nTrying: ${url}`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Get a sample product title
    const titles = await page.evaluate(() => {
      return [...document.querySelectorAll('h3, h2, [class*="name"], [class*="product"]')]
        .filter(el => el.textContent?.trim().length > 5 && el.textContent?.trim().length < 100)
        .slice(0, 3)
        .map(el => el.textContent?.trim());
    });
    
    if (titles.length > 0) {
      console.log('Products found:', titles);
    } else {
      console.log('No products on page');
    }
  } catch (e) {
    console.log('Error:', e.message.slice(0, 80));
  }
}

await ctx.close();
