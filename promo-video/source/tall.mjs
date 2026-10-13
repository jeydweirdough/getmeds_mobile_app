import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args:['--hide-scrollbars'] });
for (const [name, path, h] of [['home-tall','/',2600],['categories-tall','/categories',2400],['order-tall','/order-medicines',2400]]) {
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: h, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await p.evaluateOnNewDocument(() => { for (const k of ['getmeds:onboarded','getmeds:toured','getmeds:toured:guest']) localStorage.setItem(k,'1'); });
  await p.setCookie({ name: 'gm_consent', value: `1.r.${Math.floor(Date.now()/1000)}.banner`, domain: 'localhost', path: '/' });
  await p.goto('http://localhost:5173'+path, { waitUntil: 'networkidle2', timeout: 45000 }).catch(()=>{});
  await new Promise(r=>setTimeout(r,7000));
  // hide every fixed/sticky element at the bottom (tab bar, chat bubble, sheets)
  await p.evaluate(() => { for (const el of document.querySelectorAll('body *')) { const cs = getComputedStyle(el); if (cs.position==='fixed') { const r=el.getBoundingClientRect(); if (r.top > 300) el.style.visibility='hidden'; } } });
  await p.screenshot({ path: `shots/${name}.png` });
  console.log(name);
  await p.close();
}
await b.close();
