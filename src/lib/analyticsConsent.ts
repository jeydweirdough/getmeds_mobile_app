/*
 * Getmeds cookie consent, and website analytics that only run after a "yes".
 * Port of getmeds_frontend/public/components/analytics-consent.js (loaded on every
 * page by components.js). Behaviour, markup, cookies and endpoints are unchanged;
 * its stylesheet now lives in src/components/chrome.css (the .gmc-* rules).
 *
 * 1. Ask. The first visit shows a banner: Accept, Reject, or Manage preferences.
 *    A browser sending Global Privacy Control or Do Not Track is taken as a "no"
 *    without asking, and told so once. The answer is kept in the gm_consent cookie
 *    for 180 days. Anything marked data-gm-cookie-settings, or #cookie-settings in
 *    the URL, reopens the preferences at any time.
 * 2. Count, only after a yes. Page views, time on page, scroll depth, link and
 *    button clicks, device type and the referring site are batched and sent to
 *    /api/analytics/collect, tied to a random visitor ID in gm_vid.
 *
 * The UI is plain DOM appended to <body> (outside the React tree), exactly as the
 * original script built it, so nothing React renders can collide with it.
 */

type ConsentState = { analytics: boolean; at: number; source: string };

type TawkApi = {
  hideWidget?: () => void;
  showWidget?: () => void;
  onLoad?: (...args: unknown[]) => void;
  [key: string]: unknown;
};

type ConsentWindow = Window & {
  GetmedsConsent?: {
    open: () => void;
    get: () => { analytics: boolean; decidedAt: Date; source: string } | null;
    acceptAnalytics: () => void;
    rejectAnalytics: () => void;
  };
  Tawk_API?: TawkApi;
  doNotTrack?: string;
};

type PageState = {
  id: string;
  path: string;
  visibleSince: number;
  unsentMs: number;
  maxScroll: number;
  reported: boolean;
  clicks: number;
};

type AnalyticsEvent = Record<string, unknown> & { type: string; path?: string; title?: string | null };

export function initGetmedsConsent(): void {
  if (typeof window === 'undefined') return;
  const w = window as ConsentWindow;
  if (w.GetmedsConsent) return;

  const CONSENT_COOKIE = 'gm_consent';
  const VISITOR_COOKIE = 'gm_vid';
  const SESSION_COOKIE = 'gm_sid';
  const CONSENT_DAYS = 180;
  const SESSION_MINUTES = 30;
  const API = '/api/analytics/';
  const PRIVACY_URL = '/privacy-policy';
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Only the live site and local dev report.
  const host = location.hostname;
  const REPORTS = /(^|\.)getmeds\.ph$/.test(host) || host === 'localhost' || host === '127.0.0.1';

  // ── Cookies ───────────────────────────────────────────────────────────────

  function readCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    if (!match) return null;
    try { return decodeURIComponent(match[1]); } catch { return null; }
  }

  function writeCookie(name: string, value: string, maxAgeSeconds: number) {
    document.cookie = name + '=' + encodeURIComponent(value) + '; Max-Age=' + maxAgeSeconds +
      '; Path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
  }

  function clearCookie(name: string) {
    document.cookie = name + '=; Max-Age=0; Path=/; SameSite=Lax';
  }

  // gm_consent is "1.<a|r>.<unix seconds>.<source>".
  function readConsent(): ConsentState | null {
    const parts = (readCookie(CONSENT_COOKIE) || '').split('.');
    if (parts[0] !== '1' || (parts[1] !== 'a' && parts[1] !== 'r')) return null;
    return { analytics: parts[1] === 'a', at: (Number(parts[2]) || 0) * 1000, source: parts[3] || 'banner' };
  }

  function saveConsent(analytics: boolean, source: string) {
    writeCookie(CONSENT_COOKIE, ['1', analytics ? 'a' : 'r', Math.floor(Date.now() / 1000), source].join('.'),
      CONSENT_DAYS * 86400);
  }

  function browserSaysNo() {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    return nav.globalPrivacyControl === true || navigator.doNotTrack === '1' || w.doNotTrack === '1';
  }

  // ── Sending ───────────────────────────────────────────────────────────────

  function uuid(): string {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 15) | 64;
    b[8] = (b[8] & 63) | 128;
    const h = Array.prototype.map.call(b, (x: number) => (x + 256).toString(16).slice(1)).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function send(endpoint: string, payload: unknown) {
    if (!REPORTS) return;
    const body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon &&
          navigator.sendBeacon(API + endpoint, new Blob([body], { type: 'text/plain;charset=UTF-8' }))) {
        return;
      }
    } catch { /* fall through to fetch */ }
    try {
      fetch(API + endpoint, {
        method: 'POST',
        body,
        keepalive: true,
        credentials: 'omit',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      }).catch(() => {});
    } catch { /* analytics must never break the page */ }
  }

  // ── Tracker (runs only with consent) ──────────────────────────────────────

  let tracker: { visitorId: string; stop: (discard: boolean) => void } | null = null;
  let onRouteChange: (() => void) | null = null;
  let historyPatched = false;

  function deviceClass() {
    const ua = navigator.userAgent || '';
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ||
        (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
      return 'tablet';
    }
    return /Mobi|iPhone|iPod|Android/i.test(ua) ? 'mobile' : 'desktop';
  }

  function timeZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
  }

  function scrollDepth() {
    const doc = document.documentElement;
    const height = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0);
    const viewport = window.innerHeight || doc.clientHeight;
    if (!height || height <= viewport) return 100;
    const seen = (window.scrollY || doc.scrollTop || 0) + viewport;
    return Math.max(0, Math.min(100, Math.round(seen / height * 100)));
  }

  function externalReferrer() {
    try {
      if (!document.referrer) return null;
      const ref = new URL(document.referrer);
      return ref.hostname === location.hostname ? null : ref.origin;
    } catch {
      return null;
    }
  }

  function labelFor(el: Element) {
    if (el.closest('#user-name-display, #mobile-user-name-display') ||
        (el.querySelector && el.querySelector('#user-name-display, #mobile-user-name-display'))) {
      return 'Account menu';
    }
    let text = el.getAttribute('data-track') || el.getAttribute('aria-label') || el.getAttribute('title') ||
      el.textContent || '';
    if (!text.trim() && el.querySelector) {
      const img = el.querySelector('img[alt]');
      if (img) text = img.getAttribute('alt') || '';
    }
    text = text.replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, 80) : null;
  }

  function hrefFor(el: Element) {
    const href = el.tagName === 'A' ? el.getAttribute('href') : null;
    if (!href || href.charAt(0) === '#' || /^javascript:/i.test(href)) return null;
    if (/^(tel|mailto|sms|viber|whatsapp):/i.test(href)) return href.split('?')[0];
    try {
      const url = new URL(href, location.href);
      return url.hostname === location.hostname ? url.pathname : url.hostname + url.pathname;
    } catch {
      return null;
    }
  }

  function patchHistory() {
    // Client-side navigations update the URL in place; those count as page views too.
    if (historyPatched) return;
    historyPatched = true;
    (['pushState', 'replaceState'] as const).forEach((name) => {
      const original = history[name];
      if (typeof original !== 'function') return;
      history[name] = function (this: History, ...args: Parameters<History['pushState']>) {
        const result = original.apply(this, args);
        try { if (onRouteChange) onRouteChange(); } catch { /* never break navigation */ }
        return result;
      };
    });
  }

  function createTracker() {
    let visitorId = readCookie(VISITOR_COOKIE) || '';
    const mintedVisitor = !UUID_RE.test(visitorId || '');
    if (mintedVisitor) visitorId = uuid();
    writeCookie(VISITOR_COOKIE, visitorId, CONSENT_DAYS * 86400);

    // gm_sid is "<session id>.<last active ms>.<1 if the visitor ID is new this visit>".
    const parts = (readCookie(SESSION_COOKIE) || '').split('.');
    const resumed = UUID_RE.test(parts[0] || '') && Date.now() - Number(parts[1]) < SESSION_MINUTES * 60000;
    const sessionId = resumed ? parts[0] : uuid();
    const newVisitor = mintedVisitor || (resumed && parts[2] === '1');
    const sessionIsNew = !resumed;

    const queue: AnalyticsEvent[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    let page: PageState | null = null;
    let scrollQueued = false;

    function touchSession() {
      writeCookie(SESSION_COOKIE, [sessionId, Date.now(), newVisitor ? 1 : 0].join('.'), SESSION_MINUTES * 60);
    }

    function flush() {
      if (timer) clearTimeout(timer);
      timer = null;
      // Titles are read at send time: pages set document.title after they mount.
      queue.forEach((ev) => {
        if (ev.type === 'pageview' && !ev.title && ev.path === location.pathname) ev.title = document.title || null;
      });
      while (queue.length) {
        send('collect', {
          visitorId,
          sessionId,
          newVisitor,
          device: deviceClass(),
          language: navigator.language || null,
          timezone: timeZone(),
          events: queue.splice(0, 40),
        });
      }
    }

    function flushSoon(ms: number) {
      if (!timer) timer = setTimeout(flush, ms);
    }

    function beginPage(first: boolean) {
      page = {
        id: uuid(),
        path: location.pathname,
        visibleSince: document.visibilityState === 'visible' ? Date.now() : 0,
        unsentMs: 0,
        maxScroll: 0,
        reported: false,
        clicks: 0,
      };
      const ev: AnalyticsEvent = { type: 'pageview', path: page.path, pageViewId: page.id, newSession: first && sessionIsNew };
      if (ev.newSession) ev.referrer = externalReferrer();
      const params = new URLSearchParams(location.search);
      ['Source', 'Medium', 'Campaign'].forEach((key) => {
        const value = params.get('utm_' + key.toLowerCase());
        if (value) ev['utm' + key] = value;
      });
      queue.push(ev);
      flushSoon(1500);
    }

    function reportLeave() {
      if (!page) return;
      if (page.visibleSince) {
        page.unsentMs += Date.now() - page.visibleSince;
        page.visibleSince = 0;
      }
      page.maxScroll = Math.max(page.maxScroll, scrollDepth());
      if (page.unsentMs > 0 || !page.reported) {
        queue.push({
          type: 'leave',
          path: page.path,
          pageViewId: page.id,
          durationMs: Math.round(page.unsentMs),
          scrollPct: page.maxScroll,
        });
        page.unsentMs = 0;
        page.reported = true;
      }
      flush();
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        reportLeave();
      } else if (page) {
        page.visibleSince = Date.now();
        touchSession();
      }
    }

    function onScroll() {
      if (scrollQueued || !page) return;
      scrollQueued = true;
      requestAnimationFrame(() => {
        scrollQueued = false;
        if (page) page.maxScroll = Math.max(page.maxScroll, scrollDepth());
      });
    }

    function onClick(e: MouseEvent) {
      if (!page || page.clicks >= 50) return;
      const target = e.target as Element | null;
      const el = target && target.closest ? target.closest('a[href], button, [role="button"], [data-track]') : null;
      // Sign-in and registration forms, and this banner, are never reported.
      if (!el || el.closest('[data-analytics-ignore], .gmc-root, #auth-modal-container')) return;
      const label = labelFor(el);
      const href = hrefFor(el);
      if (!label && !href) return;
      page.clicks += 1;
      queue.push({ type: 'click', path: page.path, pageViewId: page.id, label, target: href });
      flushSoon(20000);
    }

    function onRoute() {
      if (!page || location.pathname === page.path) return;
      reportLeave();
      touchSession();
      beginPage(false);
    }

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', reportLeave);
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onRoute);
    onRouteChange = onRoute;
    patchHistory();

    touchSession();
    beginPage(true);

    return {
      visitorId,
      stop(discard: boolean) {
        if (discard) queue.length = 0;
        else reportLeave();
        if (timer) clearTimeout(timer);
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', reportLeave);
        window.removeEventListener('scroll', onScroll);
        document.removeEventListener('click', onClick, true);
        window.removeEventListener('popstate', onRoute);
        onRouteChange = null;
        page = null;
      },
    };
  }

  function startTracking() {
    if (tracker || !REPORTS || navigator.webdriver) return;
    try { tracker = createTracker(); } catch { tracker = null; }
  }

  // ── Decisions ─────────────────────────────────────────────────────────────

  function decide(analytics: boolean, source: string) {
    const before = readConsent();
    const wasOn = !!tracker || !!(before && before.analytics);
    saveConsent(analytics, source);
    if (!before || before.analytics !== analytics) {
      send('consent', { decision: analytics ? 'accepted' : 'rejected', source });
    }

    if (analytics) {
      startTracking();
    } else {
      const visitorId = (tracker && tracker.visitorId) || readCookie(VISITOR_COOKIE);
      if (tracker) { tracker.stop(true); tracker = null; }
      if (wasOn && UUID_RE.test(visitorId || '')) send('forget', { visitorId });
      clearCookie(VISITOR_COOKIE);
      clearCookie(SESSION_COOKIE);
    }

    hideBanner();
    closePreferences();
    hideNotice();
  }

  // ── Interface ─────────────────────────────────────────────────────────────

  let banner: HTMLElement | null = null;
  let overlay: HTMLElement | null = null;
  let notice: HTMLElement | null = null;
  let returnFocus: Element | null = null;
  let chatHiddenByUs = false;

  const ICON_COOKIE =
    '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 ' +
    '4 4 0 0 1-5-5"/><path d="M8.5 8.5v.01"/><path d="M16 15.5v.01"/><path d="M12 12v.01"/><path d="M11 17v.01"/>' +
    '<path d="M7 14v.01"/></svg>';
  const ICON_CLOSE =
    '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

  function mount(html: string): HTMLElement {
    const holder = document.createElement('div');
    holder.innerHTML = html;
    const node = holder.firstElementChild as HTMLElement;
    document.body.appendChild(node);
    return node;
  }

  // Tawk's chat bubble sits bottom-right; on a phone it covers the banner's buttons,
  // so it is hidden only while the banner is up, and only on small screens.
  function holdChat(hold: boolean) {
    const tawk: TawkApi = (w.Tawk_API = w.Tawk_API || {});
    if (hold) {
      if (!window.matchMedia || !window.matchMedia('(max-width: 640px)').matches) return;
      chatHiddenByUs = true;
      if (typeof tawk.hideWidget === 'function') {
        try { tawk.hideWidget(); } catch { /* ignore */ }
      } else {
        const previous = tawk.onLoad;
        tawk.onLoad = function (this: unknown, ...args: unknown[]) {
          if (typeof previous === 'function') previous.apply(this, args);
          if (chatHiddenByUs && typeof tawk.hideWidget === 'function') tawk.hideWidget();
        };
      }
    } else if (chatHiddenByUs) {
      chatHiddenByUs = false;
      if (typeof tawk.showWidget === 'function') {
        try { tawk.showWidget(); } catch { /* ignore */ }
      }
    }
  }

  function wire(root: HTMLElement) {
    root.addEventListener('click', (e) => {
      const target = e.target as Element | null;
      const action = target && target.closest && target.closest('[data-gmc]');
      if (!action) return;
      const what = action.getAttribute('data-gmc');
      if (what === 'accept') decide(true, root === banner ? 'banner' : 'settings');
      else if (what === 'reject') decide(false, root === banner ? 'banner' : 'settings');
      else if (what === 'save') decide(!!(overlay && overlay.querySelector('#gmc-analytics:checked')), 'settings');
      else if (what === 'manage') openPreferences();
      else if (what === 'close') closePreferences();
      else if (what === 'dismiss') hideNotice();
    });
  }

  function showBanner() {
    if (banner || !document.body) return;
    banner = mount(
      '<section class="gmc-root gmc-banner" role="region" aria-labelledby="gmc-banner-title">' +
        '<p class="gmc-eyebrow">' + ICON_COOKIE + 'Your privacy, your choice</p>' +
        '<h2 class="gmc-title" id="gmc-banner-title">May we use analytics cookies?</h2>' +
        '<p class="gmc-text">They show us which pages people find useful, so we can make Getmeds better. ' +
          'They stay off unless you say yes. We never read what you type into forms, and we never sell your data. ' +
          '<a href="' + PRIVACY_URL + '">Privacy Policy</a></p>' +
        '<div class="gmc-actions">' +
          '<button type="button" class="gmc-btn gmc-btn-quiet" data-gmc="reject">Reject</button>' +
          '<button type="button" class="gmc-btn gmc-btn-primary" data-gmc="accept">Accept</button>' +
        '</div>' +
        '<button type="button" class="gmc-link" data-gmc="manage">Manage preferences</button>' +
      '</section>'
    );
    wire(banner);
    holdChat(true);
  }

  function hideBanner() {
    if (!banner) return;
    banner.remove();
    banner = null;
    holdChat(false);
  }

  function openPreferences() {
    if (overlay || !document.body) return;
    hideNotice();
    const current = readConsent();
    const signal = browserSaysNo();
    returnFocus = document.activeElement;
    overlay = mount(
      '<div class="gmc-root gmc-overlay">' +
        '<div class="gmc-modal" role="dialog" aria-modal="true" aria-labelledby="gmc-prefs-title" ' +
          'aria-describedby="gmc-prefs-intro">' +
          '<div class="gmc-modal-head">' +
            '<h2 class="gmc-title" id="gmc-prefs-title">Cookie preferences</h2>' +
            '<button type="button" class="gmc-close" data-gmc="close" aria-label="Close">' + ICON_CLOSE + '</button>' +
          '</div>' +
          '<p class="gmc-text" id="gmc-prefs-intro">Choose what Getmeds may use on this browser. You can change ' +
            'this any time from <strong>Cookie settings</strong> at the bottom of every page, or under More in ' +
            'the Getmeds app.</p>' +
          (signal
            ? '<p class="gmc-note">Your browser is sending a privacy signal (Global Privacy Control or Do Not ' +
              'Track), so we have kept analytics off. You can still switch them on here if you like.</p>'
            : '') +
          '<section class="gmc-cat">' +
            '<div class="gmc-cat-head"><h3 class="gmc-cat-name">Strictly necessary</h3>' +
              '<span class="gmc-pill">Always on</span></div>' +
            '<p class="gmc-cat-desc">These keep the site working: your cart, signing in, security checks on forms, ' +
              'and remembering this choice. They can\'t be switched off.</p>' +
          '</section>' +
          '<section class="gmc-cat">' +
            '<div class="gmc-cat-head"><label class="gmc-cat-name" for="gmc-analytics">Analytics</label>' +
              '<input type="checkbox" role="switch" id="gmc-analytics" class="gmc-switch" ' +
                'aria-describedby="gmc-analytics-desc"' + (current && current.analytics ? ' checked' : '') + '></div>' +
            '<div class="gmc-cat-desc" id="gmc-analytics-desc">' +
              '<p>These help us see which pages are useful and which ones people miss. If you allow them, we count:</p>' +
              '<ul>' +
                '<li>the pages you open, how long you stay, and how far you scroll</li>' +
                '<li>the links and buttons you click</li>' +
                '<li>your device type, browser, language, and the site that sent you here</li>' +
              '</ul>' +
              '<p>This is tied to a random ID stored on this browser, never to your name, email or IP address, ' +
                'and only the Getmeds team sees it. Each night the day\'s visits are added into anonymous totals ' +
                'and the individual records are deleted; the totals are kept for 13 months. Switching this off ' +
                'also erases any records still held for this browser.</p>' +
            '</div>' +
          '</section>' +
          '<div class="gmc-modal-actions">' +
            '<button type="button" class="gmc-btn gmc-btn-quiet" data-gmc="reject">Reject all</button>' +
            '<button type="button" class="gmc-btn gmc-btn-quiet" data-gmc="save">Save choices</button>' +
            '<button type="button" class="gmc-btn gmc-btn-primary" data-gmc="accept">Accept all</button>' +
          '</div>' +
          '<p class="gmc-foot"><a href="' + PRIVACY_URL + '">Read our Privacy Policy</a></p>' +
        '</div>' +
      '</div>'
    );
    const ov = overlay;
    wire(ov);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) closePreferences(); });
    ov.addEventListener('keydown', trapFocus);
    document.documentElement.style.overflow = 'hidden';
    const toggle = ov.querySelector<HTMLInputElement>('#gmc-analytics');
    if (toggle) toggle.focus();
  }

  function closePreferences() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.documentElement.style.overflow = '';
    if (location.hash === '#cookie-settings') {
      try { history.replaceState(history.state, '', location.pathname + location.search); } catch { /* ignore */ }
    }
    const target = banner ? banner.querySelector<HTMLElement>('[data-gmc="manage"]') : (returnFocus as HTMLElement | null);
    if (target && typeof target.focus === 'function') target.focus();
    returnFocus = null;
  }

  function trapFocus(e: KeyboardEvent) {
    if (!overlay) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closePreferences();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = overlay.querySelectorAll<HTMLElement>('button, input, a[href]');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function showNotice() {
    if (notice || !document.body) return;
    notice = mount(
      '<div class="gmc-root gmc-notice" role="status">' +
        '<p><strong>Analytics are off.</strong> Your browser asked sites not to track you, so nothing about ' +
          'this visit is counted.</p>' +
        '<div class="gmc-notice-actions">' +
          '<button type="button" data-gmc="manage">Cookie settings</button>' +
          '<button type="button" data-gmc="dismiss">OK</button>' +
        '</div>' +
      '</div>'
    );
    wire(notice);
  }

  function hideNotice() {
    if (!notice) return;
    notice.remove();
    notice = null;
  }

  // ── Start ─────────────────────────────────────────────────────────────────

  // Delegated, because triggers (footer, app sheets) render independently of this.
  // Capture phase, so a next/link or other React handler can't navigate first.
  document.addEventListener('click', (e) => {
    const target = e.target as Element | null;
    const trigger = target && target.closest && target.closest('[data-gm-cookie-settings], a[href="#cookie-settings"]');
    if (!trigger) return;
    e.preventDefault();
    if (trigger.closest('.gm-sheet')) {
      const backdrop = document.querySelector<HTMLElement>('.gm-sheet-backdrop');
      if (backdrop) backdrop.click();
    }
    openPreferences();
  }, true);

  const consent = readConsent();
  if (!consent) {
    if (browserSaysNo()) {
      saveConsent(false, 'gpc');
      send('consent', { decision: 'rejected', source: 'gpc' });
      showNotice();
    } else {
      showBanner();
    }
  } else if (consent.analytics) {
    startTracking();
  }
  if (location.hash === '#cookie-settings') openPreferences();

  w.GetmedsConsent = {
    open: openPreferences,
    get() {
      const c = readConsent();
      return c ? { analytics: c.analytics, decidedAt: new Date(c.at), source: c.source } : null;
    },
    acceptAnalytics() { decide(true, 'settings'); },
    rejectAnalytics() { decide(false, 'settings'); },
  };
}
