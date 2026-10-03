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

/* ── Footprints: where Back goes ─────────────────────────────────────────────
 *
 * Every history entry the app makes carries its step number (gmIdx) in its
 * history state, and the trail of addresses is mirrored in localStorage. So
 * the app always knows whether there is an in-app step behind the current one
 * and where it leads, which `window.history.length` cannot say: it also
 * counts forward entries and anything before the app.
 *
 * Every pushState/replaceState goes through here (patched below), so the
 * screens that push their own entries (account sub-screens, the details
 * sheet, search's ?q=, the catalog's subcategory URL) are counted too, and
 * Back closes them in the right order.
 *
 * A cold start is a new trail: the WebView's history starts empty then, and a
 * stored trail from an earlier session would point Back at screens that are
 * no longer behind this one.
 */
const FOOTPRINTS_KEY = 'getmeds:footprints';
const MAX_FOOTPRINTS = 100;

const here = () => window.location.pathname + window.location.search + window.location.hash;

const stepOf = (state: unknown): number | null => {
  const n = Number((state as { gmIdx?: unknown } | null)?.gmIdx);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

const withStep = (state: unknown, step: number) =>
  state && typeof state === 'object' ? { ...(state as object), gmIdx: step } : { gmIdx: step };

const readTrail = (): string[] => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FOOTPRINTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === 'string') : [];
  } catch {
    return [];
  }
};

let step = 0;
let trail: string[] = [];

const saveTrail = () => {
  try {
    // Only the steps up to here matter for Back; keep the stored copy small.
    window.localStorage.setItem(FOOTPRINTS_KEY, JSON.stringify(trail.slice(Math.max(0, step + 1 - MAX_FOOTPRINTS), step + 1)));
  } catch { /* storage blocked: the step numbers in history still work */ }
};

const nativePush = window.history.pushState.bind(window.history);
const nativeReplace = window.history.replaceState.bind(window.history);

{
  const resumed = stepOf(window.history.state);
  if (resumed === null) {
    // Cold start (or a page that never had a step): this is step 0.
    step = 0;
    trail = [here()];
    nativeReplace(withStep(window.history.state, 0), '');
  } else {
    // A reload inside the same WebView session: history kept its steps.
    step = resumed;
    const stored = readTrail();
    trail = stored.length > step ? stored : [...stored, ...Array(step + 1 - stored.length).fill('')];
    trail[step] = here();
  }
  saveTrail();
}

window.history.pushState = function (state: unknown, unused: string, url?: string | URL | null) {
  step += 1;
  nativePush(withStep(state, step), unused, url);
  trail = trail.slice(0, step);
  trail[step] = here();
  saveTrail();
};

window.history.replaceState = function (state: unknown, unused: string, url?: string | URL | null) {
  nativeReplace(withStep(state, step), unused, url);
  trail[step] = here();
  saveTrail();
};

/** Is there an in-app step behind this one for Back to return to? */
export const canGoBack = (): boolean => step > 0;

/** Where Back would land, or undefined at the first step. */
export const previousPath = (): string | undefined => (step > 0 ? trail[step - 1] || undefined : undefined);

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

  // Only the hash differs: move to it as a plain link would, but as a counted
  // step (location.hash would make an entry the footprints can't see).
  if (samePage && url.hash && url.hash !== window.location.hash) {
    window.history.pushState({}, '', url.hash);
    document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView({ behavior: 'smooth' });
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
  // Back or Forward: the entry we landed on says which step it is.
  const landed = stepOf(e.state);
  step = landed ?? Math.max(0, step - 1);
  trail[step] = here();
  saveTrail();

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
