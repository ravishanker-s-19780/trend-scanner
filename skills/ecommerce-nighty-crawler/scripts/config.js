import fs   from 'node:fs/promises';
import path  from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT      = path.resolve(__dirname, '../../..');
export const OUT_DIR   = path.join(ROOT, 'evidence', 'original');
export const USER_DATA = path.join(ROOT, 'user-data');

// ─── CLI args ─────────────────────────────────────────────────────────────────
const argv = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);

export const ALL_PLATFORMS = ['amazon','myntra','flipkart','ajio','meesho','clovia','tatacliq','shyaway'];

export const platforms = (argv.platforms ? String(argv.platforms).split(',') : ALL_PLATFORMS)
  .map(s => s.trim().toLowerCase()).filter(s => ALL_PLATFORMS.includes(s));

export const MAX_ITEMS   = Number(argv.max         ?? 100);
export const CONCURRENCY = Number(argv.concurrency ?? 4);
export const HEADFUL     = Boolean(argv.headful);

const kwFile = path.join(ROOT, 'keywords.json');
const defaultKeywords = JSON.parse(await fs.readFile(kwFile, 'utf8'));
export const keywords = argv.keywords
  ? String(argv.keywords).split(',').map(k => k.trim()).filter(Boolean)
  : defaultKeywords;
