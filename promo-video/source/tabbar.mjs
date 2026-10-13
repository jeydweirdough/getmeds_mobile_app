import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args:['--hide-scrollbars'] });
for (const [name, path] of [['tab-home','/'],['tab-categories','/categories'],['tab-order','/order-medicines']]) {
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await p.evaluateOnNewDocument(() => { for (const k of ['getmeds:onboarded','getmeds:toured','getmeds:toured:guest']) localStorage.setItem(k,'1'); });
  await p.setCookie({ name: 'gm_consent', value: `1.r.${Math.floor(Date.now()/1000)}.banner`, domain: 'localhost', path: '/' });
  await p.goto('http://localhost:5173'+path, { waitUntil: 'networkidle2', timeout: 45000 }).catch(()=>{});
  await new Promise(r=>setTimeout(r,5000));
  await p.evaluate(() => {
    const st = document.createElement('style');
    st.textContent = 'html,body,#root{background:transparent!important} body *{visibility:hidden} .gm-keep, .gm-keep *{visibility:visible!important}';
    document.head.appendChild(st);
    for (const el of document.querySelectorAll('body *')) { const cs = getComputedStyle(el); if (cs.position==='fixed' && el.getBoundingClientRect().top > 600 && cs.display!=='none') el.classList.add('gm-keep'); }
  });
  await p.screenshot({ path: `assets/screens/${name}.png`, omitBackground: true, clip: { x: 0, y: 844-130, width: 390, height: 130 } });
  console.log(name);
  await p.close();
}
await b.close();
