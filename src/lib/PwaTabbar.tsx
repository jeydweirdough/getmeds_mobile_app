'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useLang } from '@/lib/i18n';
import { ChatIcon } from '@/lib/BrandIcons';
import { replayTour } from '@/components/GuidedTour';
import './pwa-tabbar.css';

/**
 * PwaTabbar.tsx
 * ─────────────────────────────────────────────
 * Port of PWA_TABBAR (getmeds_frontend/src/plugins/pwaTabbar.js), which the
 * Vite build injected before </body> on EVERY page. It is hidden everywhere by
 * CSS and only revealed in the installed app at phone widths (see
 * pwa-tabbar.css), so it must be mounted once, globally, in the root layout —
 * together with <PwaModeScript /> in <head>.
 *
 * Same markup, classes and behaviour as the original: active tab read from the
 * URL, the "More" sheet (backdrop, Escape, body scroll lock) and the cart badge
 * read straight from IndexedDB ('getmeds-cart', the same stores cart.ts
 * creates) and repainted on getmeds:cart-changed.
 *
 * The second tab is Products, not Search: home already has a search bar at
 * the top, so a Search tab was a second door to the same room, while the
 * full product list was buried in "More". The raised middle button is Chat:
 * uploading a prescription already has its own card at the top of home.
 */

const TABS: Array<{ href: string; match: string }> = [
  { href: '/app-home', match: '/app-home,/' },
  { href: '/product-range', match: '/product-range' },
  { href: '/chat', match: '/chat' },
  { href: '/cart', match: '/cart' },
];

function normalise(pathname: string) {
  return pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
}

function isActive(match: string, path: string) {
  return match.split(',').some((m) => (m === '/' ? path === '/' : path === m || path.indexOf(m + '/') === 0));
}

function gmCartCount(cb: (n: number) => void) {
  try {
    const req = indexedDB.open('getmeds-cart', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('items')) { cb(0); return; }
      const c = db.transaction('items', 'readonly').objectStore('items').count();
      c.onsuccess = () => cb(c.result || 0);
      c.onerror = () => cb(0);
    };
    req.onerror = () => cb(0);
  } catch {
    cb(0);
  }
}

const Go = () => (
  <svg className="gm-sheet-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
);

const Ico = ({ children }: { children: React.ReactNode }) => (
  <svg className="gm-sheet-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

export default function PwaTabbar() {
  const { tr } = useLang();
  const pathname = usePathname() || '/';
  const path = normalise(pathname);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);

  const setSheet = useCallback((next: boolean) => {
    setOpen(next);
    document.body.style.overflow = next ? 'hidden' : '';
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setSheet]);

  // A multi-page app closed the sheet by navigating; a client navigation has
  // to do it explicitly.
  useEffect(() => {
    setOpen(false);
    document.body.style.overflow = '';
  }, [pathname]);

  useEffect(() => {
    const paint = () => gmCartCount(setCount);
    paint();
    window.addEventListener('getmeds:cart-changed', paint);
    return () => window.removeEventListener('getmeds:cart-changed', paint);
  }, []);

  const cls = (i: number) => (isActive(TABS[i].match, path) ? 'is-active' : undefined);

  return (
    <>
      <nav className="gm-tabbar" aria-label={tr('Primary', 'Pangunahing menu')}>
        <a href="/app-home" data-match="/app-home,/" className={cls(0)}><i className="fa-solid fa-house"></i><span>{tr('Home', 'Home')}</span></a>
        <a href="/product-range" data-match="/product-range" className={cls(1)}><i className="fa-solid fa-capsules"></i><span>{tr('Products', 'Produkto')}</span></a>
        <a href="/chat" data-tour="chat" aria-label={tr('Chat with us', 'Mag-chat sa amin')} className={`gm-mid${cls(2) ? ' is-active' : ''}`} data-match="/chat">
          <span className="gm-mid-btn"><ChatIcon size={34} /></span>
          <span className="gm-label">{tr('Chat', 'Chat')}</span>
        </a>
        <a href="/cart" data-match="/cart" data-tour="requests" aria-label={tr('Your request list', 'Ang iyong request list')} className={cls(3)}>
          <i className="fa-solid fa-cart-shopping"></i>
          <span className="gm-cart-badge" data-count={String(count)}>{count > 99 ? '99+' : String(count)}</span>
          <span>{tr('Requests', 'Requests')}</span>
        </a>
        <button type="button" id="gm-more" aria-haspopup="dialog" aria-expanded={open ? 'true' : 'false'} onClick={() => setSheet(!open)}>
          <i className="fa-solid fa-bars"></i><span>{tr('More', 'Iba pa')}</span>
        </button>
      </nav>

      <div className="gm-sheet-backdrop" data-open={open ? '1' : '0'} onClick={() => setSheet(false)}></div>
      <div className="gm-sheet" data-open={open ? '1' : '0'} role="dialog" aria-modal="true" aria-label={tr('More', 'Iba pa')} aria-hidden={open ? 'false' : 'true'}>
        <span className="gm-sheet-grip" aria-hidden="true"></span>
        <a href="/profile"><Ico><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Ico><span>{tr('My account', 'Aking account')}</span><Go /></a>
        <a href="/patient-assistance-program"><Ico><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /><path d="M3.5 12.5h4l1-2 2.5 5 2-8 1.7 5h5.8" /></Ico><span>{tr('Patient Assistance', 'Patient Assistance')}</span><Go /></a>
        <a href="/profile#guides"><Ico><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" /><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" /></Ico><span>{tr('Health guides', 'Mga gabay sa kalusugan')}</span><Go /></a>
        <a href="/chat"><Ico><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /><path d="M8 12h.01" /><path d="M12 12h.01" /><path d="M16 12h.01" /></Ico><span>{tr('Chat with us', 'Mag-chat sa amin')}</span><Go /></a>
        <a
          href="/app-home"
          onClick={() => {
            setSheet(false);
            // Home may already be open; the tour starts once it is.
            window.setTimeout(replayTour, 50);
          }}
        ><Ico><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></Ico><span>{tr('App tour', 'Tour ng app')}</span><Go /></a>
        <a href="/contact-us"><Ico><path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" /></Ico><span>{tr('Contact us', 'Makipag-ugnayan')}</span><Go /></a>
        <a href="/about-us"><Ico><circle cx="12" cy="12" r="9" /><path d="M12 16v-4.5" /><path d="M12 8.2h.01" /></Ico><span>{tr('About Getmeds', 'Tungkol sa Getmeds')}</span><Go /></a>
        <a href="/policy"><Ico><path d="M20 12.5c0 5-3.5 7.5-7.68 8.95a1 1 0 0 1-.63 0C7.5 20 4 17.5 4 12.5V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z" /></Ico><span>{tr('Privacy & policies', 'Privacy at mga patakaran')}</span><Go /></a>
        <a href="#cookie-settings" data-gm-cookie-settings=""><Ico><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" /><path d="M8.5 8.5v.01" /><path d="M16 15.5v.01" /><path d="M12 12v.01" /><path d="M11 17v.01" /><path d="M7 14v.01" /></Ico><span>{tr('Cookie settings', 'Cookie settings')}</span><Go /></a>
      </div>
    </>
  );
}
