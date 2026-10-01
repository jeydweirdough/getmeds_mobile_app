import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { SITE_URL } from './config';
import { isAppPath } from './routes';

const SITE_ORIGIN = new URL(SITE_URL).origin;
const SITE_HOSTS = new Set([new URL(SITE_URL).host, 'getmeds.ph', 'www.getmeds.ph']);

/** Opens a website page (About us, a blog article, a policy...) in an in-app browser tab. */
export function openOnWebsite(pathOrUrl: string): void {
  const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : `${SITE_ORIGIN}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
  if (Capacitor.isNativePlatform()) {
    Browser.open({ url, toolbarColor: '#1D9FDA' }).catch(() => window.open(url, '_blank'));
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

/**
 * Link handling for the whole app, in one place:
 *   - a link to an app screen, even one written as https://getmeds.ph/..., stays in the app;
 *   - a link to any other getmeds.ph page opens that page in the in-app browser;
 *   - any other web address opens in the in-app browser too, so the app is never replaced by it;
 *   - tel:, mailto:, viber: and the like are left to the phone.
 */
export function installLinkHandling(): void {
  document.addEventListener(
    'click',
    (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.hasAttribute('download')) return;
      const raw = anchor.getAttribute('href') || '';
      if (!raw || raw.startsWith('#') || raw.startsWith('javascript:')) return;

      let url: URL;
      try {
        url = new URL(raw, window.location.href);
      } catch {
        return;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

      const own = url.origin === window.location.origin;
      const website = SITE_HOSTS.has(url.host);
      if ((own || website) && isAppPath(url.pathname)) {
        if (website) {
          event.preventDefault();
          window.location.href = url.pathname + url.search + url.hash;
        }
        return;
      }
      event.preventDefault();
      openOnWebsite(own ? url.pathname + url.search + url.hash : url.href);
    },
    true,
  );
}

/** Leaves a screen the app does not have: back where the user came from, or home. */
export function leaveUnknownScreen(): void {
  if (window.history.length > 1) window.history.back();
  else window.location.replace('/');
}
