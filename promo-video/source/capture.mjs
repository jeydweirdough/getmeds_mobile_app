// Captures real Getmeds app screens from the local dev server at phone size, 3x DPR.
import puppeteer from 'puppeteer-core';

const BASE = 'http://localhost:5173';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const only = process.argv.slice(2);

const shots = [
  { name: 'onboarding', path: '/', onboarded: false, wait: 3500 },
  { name: 'home', path: '/', wait: 6000 },
  { name: 'categories', path: '/categories', wait: 5000 },
  { name: 'catalog', path: '/cancer-medicines', wait: 7000 },
  { name: 'search', path: '/search', wait: 4000 },
  { name: 'cart', path: '/cart', wait: 4000 },
  { name: 'account', path: '/profile', wait: 5000 },
  { name: 'chat', path: '/chat', wait: 5000 },
  { name: 'order', path: '/order-medicines', wait: 5000 },
  { name: 'notifications', path: '/notifications', wait: 4000 },
  { name: 'product', path: '/cancer-medicines/pacliget-paclitaxel-100mg-16.7ml-injection', wait: 7000 },
  { name: 'product2', path: '/cancer-medicines/capeget-capecitabine-500mg-tablet', wait: 7000 },
  { name: 'searchq', path: '/search', wait: 2500, type: 'docetaxel' },
  { name: 'catalog-all', path: '/product-range', wait: 7000 },
];

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--hide-scrollbars'] });
for (const s of shots) {
  if (only.length && !only.includes(s.name)) continue;
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36');
  await page.evaluateOnNewDocument((onboarded) => {
    try {
      if (onboarded) {
        localStorage.setItem('getmeds:onboarded', '1');
        localStorage.setItem('getmeds:toured', '1');
        localStorage.setItem('getmeds:toured:guest', '1');
        localStorage.setItem('getmeds:toured:account', '1');
        localStorage.setItem('getmeds:toured:account:guest', '1');
      }
    } catch {}
  }, s.onboarded !== false);
  await page.setCookie({ name: 'gm_consent', value: `1.r.${Math.floor(Date.now()/1000)}.banner`, domain: 'localhost', path: '/' });
  try {
    await page.goto(BASE + s.path, { waitUntil: 'networkidle2', timeout: 45000 });
  } catch (e) { console.log('nav warn', s.name, e.message); }
  await new Promise((r) => setTimeout(r, s.wait));
  if (s.type) {
    const input = await page.$('input');
    await input.click();
    await page.keyboard.type(s.type, { delay: 60 });
    await new Promise((r) => setTimeout(r, 4000));
  }
  await page.screenshot({ path: `shots/${s.name}.png` });
  // Full-length capture too, for scrolling showcase shots.
  await page.screenshot({ path: `shots/${s.name}-full.png`, fullPage: true });
  console.log('captured', s.name);
  await page.close();
}
await browser.close();
