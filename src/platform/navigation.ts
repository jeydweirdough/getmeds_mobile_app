import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { SITE_URL } from './config';
import { isAppPath } from './routes';
import { canGoBack, navigate } from './router';

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
 *   - a link to an app screen, even one written as https://getmeds.ph/..., stays in the app and
 *     switches screens in place (router.ts) rather than reloading it;
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
        if (anchor.target && anchor.target !== '_self') return;
        event.preventDefault();
        navigate(url.pathname + url.search + url.hash);
        return;
      }
      event.preventDefault();
      openOnWebsite(own ? url.pathname + url.search + url.hash : url.href);
    },
    true,
  );
}

/**
 * Programmatic counterpart of a link tap: an app screen switches in place, a
 * website page opens in the in-app browser.
 */
export function goTo(href: string, opts?: { replace?: boolean }): void {
  const url = new URL(href, window.location.href);
  if (isAppPath(url.pathname)) navigate(url.pathname + url.search + url.hash, opts);
  else openOnWebsite(url.pathname + url.search + url.hash);
}

/** Leaves a screen the app does not have: back where the user came from, or home. */
export function leaveUnknownScreen(): void {
  goBack('/');
}

/**
 * What every Back button in the app does: return to the previous footprint
 * (router.ts), i.e. exactly the screen the user came from. With nothing
 * behind it (the app opened straight onto this screen from a link or a
 * notification), go to `fallback` instead, the screen's natural parent,
 * replacing this one so Back from there doesn't bounce back here.
 */
export function goBack(fallback: string = '/'): void {
  if (canGoBack()) window.history.back();
  else goTo(fallback, { replace: true });
}

/**
 * Bottom sheets (sign-in, add to cart, the More menu...) open without a
 * history entry. The phone's Back closes the topmost one first, as a native
 * app would. Full screens opened over a page (Screen, DetailsScreen) do make
 * an entry, so plain Back already closes those; they are marked
 * data-history-backed and skipped here.
 */
function closeTopSheet(): boolean {
  // The tab bar's More menu stays in the page while closed; its toggle closes it.
  const more = document.getElementById('gm-more');
  if (more?.getAttribute('aria-expanded') === 'true') {
    more.click();
    return true;
  }
  const open = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).filter(
    (el) => !el.closest('[data-history-backed]') && el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0
  );
  const top = open[open.length - 1];
  if (!top) return false;
  // A sheet names what closes it with data-sheet-close; otherwise its Close button.
  const close = top.matches('[data-sheet-close]')
    ? top
    : top.querySelector<HTMLElement>('[data-sheet-close], button[aria-label="Close"]');
  if (!close) return false;
  close.click();
  return true;
}

/**
 * The Android Back button (and gesture). Registering a listener replaces
 * Capacitor's default, which walked the WebView's raw history and closed the
 * app from wherever that ran out.
 */
export function installBackButton(): void {
  if (!Capacitor.isNativePlatform()) return;
  App.addListener('backButton', () => {
    if (closeTopSheet()) return;
    if (canGoBack()) {
      window.history.back();
      return;
    }
    // Nothing behind this screen: Home first, then leave the app.
    if (window.location.pathname !== '/' && window.location.pathname !== '/app-home') {
      navigate('/', { replace: true });
      return;
    }
    App.exitApp();
  }).catch(() => undefined);
}
