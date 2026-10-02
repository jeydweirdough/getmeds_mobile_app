import { useSyncExternalStore } from 'react';
import { normalisePath } from './routes';

/**
 * router.ts
 * ─────────────────────────────────────────────
 * In-app page changes without reloading index.html.
 *
 * The app started as "every link is a full load" (see routes.ts), which meant
 * every tap re-downloaded nothing but still re-parsed and re-started the whole
 * app on a blank white page. navigate() instead pushes the new address and
 * tells App to swap screens, so a page change is one React render.
 *
 * What counts as a new page is the pathname. Screens that push their own
 * same-path history entries (search's ?q=, the account sub-screens, the
 * details sheet) handle their own popstate; a Back between two entries with the
 * same pathname leaves the mounted screen alone, exactly as before.
 *
 * Scroll position is kept per history entry, so Back lands where you were.
 */

export const NAVIGATE_EVENT = 'getmeds:navigate';

export interface Location {
  pathname: string;
  search: string;
  hash: string;
  /** Bumps whenever a different screen should mount. App keys the screen by it. */
  key: number;
}

let current: Location = {
  pathname: window.location.pathname,
  search: window.location.search,
  hash: window.location.hash,
  key: 0,
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';

const saveScroll = () => {
  try {
    window.history.replaceState({ ...(window.history.state || {}), gmScroll: window.scrollY }, '');
  } catch { /* a state the browser will not clone: skip, it only costs the scroll */ }
};

const restoreScroll = (y: number) => {
  // Two frames: one for React to commit the screen, one for it to lay out.
  requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
};

/** Moves to another app screen. Website-only paths are not handled here; see navigation.ts. */
export function navigate(href: string, { replace = false }: { replace?: boolean } = {}): void {
  const url = new URL(href, window.location.href);
  const samePage =
    normalisePath(url.pathname) === normalisePath(window.location.pathname) && url.search === window.location.search;

  // Only the hash differs: let the browser move to it, as a plain link would.
  if (samePage && url.hash && url.hash !== window.location.hash) {
    window.location.hash = url.hash;
    return;
  }
  // Exactly where we are already (the Home tab tapped on Home): back to the
  // top, without a second history entry to Back through.
  if (samePage && !replace) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  saveScroll();
  const target = url.pathname + url.search + url.hash;
  if (replace) window.history.replaceState({}, '', target);
  else window.history.pushState({}, '', target);

  current = { pathname: url.pathname, search: url.search, hash: url.hash, key: current.key + 1 };
  window.scrollTo(0, 0);
  emit();
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

window.addEventListener('popstate', (e) => {
  const next = { pathname: window.location.pathname, search: window.location.search, hash: window.location.hash };
  const newScreen = normalisePath(next.pathname) !== normalisePath(current.pathname);
  current = { ...next, key: newScreen ? current.key + 1 : current.key };
  emit();
  if (newScreen) restoreScroll(Number((e.state as { gmScroll?: number } | null)?.gmScroll) || 0);
});

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};
const snapshot = () => current;

/** The current address; re-renders on every in-app navigation and Back/Forward. */
export function useLocation(): Location {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
