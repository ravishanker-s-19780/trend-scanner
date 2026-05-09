import { chromium } from 'playwright';
import fs            from 'node:fs/promises';
import path          from 'node:path';
import { HEADFUL, USER_DATA } from './config.js';

export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36';

export const STEALTH_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'plugins',   { get: () => [1,2,3,4,5] });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-IN','en'] });
  window.chrome = { runtime: {} };
  const _pq = window.navigator.permissions.query.bind(window.navigator.permissions);
  window.navigator.permissions.query = p =>
    p.name === 'notifications' ? Promise.resolve({ state: Notification.permission }) : _pq(p);
`;

// Platforms that fail with HTTP/2 (ERR_HTTP2_PROTOCOL_ERROR)
const HTTP1_PLATFORMS = new Set(['myntra']);

export async function makeContext(platform) {
  const dir = path.join(USER_DATA, platform);
  await fs.mkdir(dir, { recursive: true });

  const args = ['--disable-blink-features=AutomationControlled','--no-sandbox','--disable-setuid-sandbox'];
  if (HTTP1_PLATFORMS.has(platform)) args.push('--disable-http2');

  const opts = {
    headless: !HEADFUL, userAgent: UA,
    viewport: { width: 1366, height: 900 },
    locale: 'en-IN', timezoneId: 'Asia/Kolkata', args,
  };
  try {
    return await chromium.launchPersistentContext(dir, { ...opts, channel: 'chrome' });
  } catch {
    return await chromium.launchPersistentContext(dir, opts);
  }
}
