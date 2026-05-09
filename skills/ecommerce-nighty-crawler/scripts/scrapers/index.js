export { scrapeAmazon }   from './amazon.js';
export { scrapeMyntra }   from './myntra.js';
export { scrapeFlipkart } from './flipkart.js';
export { scrapeAjio }     from './ajio.js';
export { scrapeMeesho }   from './meesho.js';
export { scrapeClovia }   from './clovia.js';
export { scrapeTatacliq } from './tatacliq.js';
export { scrapeShyaway }  from './shyaway.js';

import { scrapeAmazon }   from './amazon.js';
import { scrapeMyntra }   from './myntra.js';
import { scrapeFlipkart } from './flipkart.js';
import { scrapeAjio }     from './ajio.js';
import { scrapeMeesho }   from './meesho.js';
import { scrapeClovia }   from './clovia.js';
import { scrapeTatacliq } from './tatacliq.js';
import { scrapeShyaway }  from './shyaway.js';

export const SCRAPERS = {
  amazon:   scrapeAmazon,
  myntra:   scrapeMyntra,
  flipkart: scrapeFlipkart,
  ajio:     scrapeAjio,
  meesho:   scrapeMeesho,
  clovia:   scrapeClovia,
  tatacliq: scrapeTatacliq,
  shyaway:  scrapeShyaway,
};
