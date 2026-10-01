'use client';

/**
 * Page-wide behaviours the original public/components/components.js set up on every
 * page (besides fetching navbar.html / footer.html):
 *   - loadConsentManager()  → cookie consent + consented analytics (analytics-consent.js)
 *   - fetchAndApplyLogo()   → swaps every Getmeds logo <img> (and the favicon) for the
 *                             logo set in Sanity siteSettings
 * The Tawk chat, chat links and #scroll-to-top live in FloatingContactButtons. Both are
 * mounted by the root layout on every route that loaded components.js.
 */

import { useEffect } from 'react';
import { initGetmedsConsent } from '@/lib/analyticsConsent';
import { fetchSiteLogoUrl } from '@/lib/siteSettings';

export default function ChromeExtras() {
  // Cookie consent banner first, so the question is on screen as early as possible.
  useEffect(() => {
    initGetmedsConsent();
  }, []);

  // Dynamic logo from Sanity, applied to every Getmeds logo image on the page.
  useEffect(() => {
    let observer: MutationObserver | null = null;
    let cancelled = false;
    fetchSiteLogoUrl().then((logoUrl) => {
      if (!logoUrl || cancelled) return;
      const apply = () => {
        document.querySelectorAll('img').forEach((img) => {
          const src = img.getAttribute('src') || '';
          const alt = img.getAttribute('alt') || '';
          if (
            src.includes('getmedslogo.png') ||
            src.includes('getmedslogo') ||
            alt.toLowerCase().includes('getmeds logo') ||
            alt.toLowerCase() === 'logo'
          ) {
            if (img.src !== logoUrl) img.src = logoUrl;
          }
        });
        const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
        if (link && link.href !== logoUrl) link.href = logoUrl;
      };
      apply();
      observer = new MutationObserver(apply);
      observer.observe(document.body, { childList: true, subtree: true });
    });
    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, []);

  return null;
}
