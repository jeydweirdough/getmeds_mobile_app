'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/i18n';

/**
 * turnstile.tsx
 * ─────────────────────────────────────────────
 * Cloudflare Turnstile, shared by every inquiry form.
 *
 * This was previously implemented once, inline, in order-medicines.tsx and
 * nowhere else — so seven of the eight forms sent an empty token. The moment a
 * secret key was set on the backend those seven started rejecting real
 * customers with "Please complete the verification challenge", pointing at a
 * widget that was not on the page. Keeping it in one place is what stops that
 * happening again the next time a form is added.
 *
 * Requires the api.js script on the page:
 *   <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
 *
 * The Vite build put that tag in every HTML shell. Next.js has no per-page
 * shell, so ensureTurnstileScript() injects the same tag on demand (once) the
 * first time a form using the widget mounts.
 *
 * Every form keeps its submit button disabled until there is a token. On its
 * own that reads as a broken button, so the widget says what it is waiting for
 * underneath itself ("Checking your connection…", "expired, tick it again",
 * "could not run — Try again"); see TurnstileHandle.status.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id?: string) => void;
    };
  }
}

/**
 * No site key configured means no widget and no gating, so forms still work in
 * local dev and if the key is ever unset. The backend mirrors this: with no
 * secret, verification is skipped entirely.
 */
export const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
  process.env.VITE_TURNSTILE_SITE_KEY ||
  '';

export const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

/**
 * Adds the Turnstile api.js <script async defer> to <head> if it is not on the
 * page already. Safe to call repeatedly; a no-op on the server.
 */
export function ensureTurnstileScript(): void {
  if (typeof document === 'undefined') return;
  if (window.turnstile) return;
  if (document.querySelector(`script[src^="${TURNSTILE_SCRIPT_SRC}"]`)) return;
  const s = document.createElement('script');
  s.src = TURNSTILE_SCRIPT_SRC;
  s.async = true;
  s.defer = true;
  // A download that failed (offline) leaves no tag behind, so "Try again" fetches it afresh.
  s.onerror = () => s.remove();
  document.head.appendChild(s);
}

/**
 * Where the check is, for the line under the widget:
 *   loading — api.js or the widget is still arriving
 *   ready   — the widget is up, waiting for the visitor (or solving itself)
 *   solved  — there is a token; submit can go
 *   expired — the token or the challenge timed out; it needs ticking again
 *   error   — Turnstile reported an error
 *   failed  — the widget never appeared (offline, blocked), after 30s
 */
export type TurnstileStatus = 'loading' | 'ready' | 'solved' | 'expired' | 'error' | 'failed';

export interface TurnstileHandle {
  /** Current token, or '' when unsolved. Send this as `turnstileToken`. */
  token: string;
  status: TurnstileStatus;
  /** Attach to the element the widget should render into. */
  ref: React.RefObject<HTMLDivElement | null>;
  /** Call after every submit — tokens are single-use. */
  reset: () => void;
  /** False when no site key is configured, i.e. the widget renders nothing. */
  enabled: boolean;
}

/**
 * @param active Set false while the form is hidden, so the widget is not
 *               mounted for a form the visitor cannot see.
 */
export function useTurnstile(active: boolean = true): TurnstileHandle {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<TurnstileStatus>('loading');
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  // Set by the effect below so reset() can mount a brand-new widget after a
  // submission rather than reusing the solved one.
  const mount = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active || !TURNSTILE_SITE_KEY) return;

    ensureTurnstileScript();

    let cancelled = false;
    // Two things have to arrive before the widget can be drawn, and NEITHER is
    // ready when this effect first runs:
    //
    //   window.turnstile — api.js is async/defer, so it lands a moment later.
    //   ref.current      — on a page whose form only renders once data has
    //                      loaded (product-detail waits for the product), the
    //                      host div does not exist yet at mount.
    //
    // Both are therefore checked inside the poll rather than before it.
    // Reading ref.current up front and bailing out was a real bug: the effect
    // never re-ran, so those forms silently shipped with no widget at all.
    const render = () => {
      if (cancelled || widgetId.current) return true; // done, or nothing to do
      const host = ref.current;
      if (!host || !window.turnstile) return false;   // not ready — keep polling
      widgetId.current = window.turnstile.render(host, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'light',
        // 'flexible' sizes the widget to its container instead of a fixed
        // 300px box. On a 390px phone a fixed box plus card padding is already
        // tight, and Turnstile's expanded "Troubleshoot" panel is wider still —
        // which is what pushed it off the screen. The wrapper below scrolls
        // rather than clips, so that panel stays readable when it appears.
        size: 'flexible',
        appearance: 'always', // keep the widget visible rather than interaction-only
        callback: (t: string) => { setToken(t); setStatus('solved'); },
        'expired-callback': () => { setToken(''); setStatus('expired'); },
        'timeout-callback': () => { setToken(''); setStatus('expired'); },
        'error-callback': () => { setToken(''); setStatus('error'); },
      });
      setStatus('ready');
      return true;
    };

    let timer = 0;
    let giveUp = 0;
    // Polls until the widget is drawn. Also what reset() and "Try again" re-run,
    // so a widget that never appeared (offline, blocked) gets another go.
    const start = () => {
      window.clearInterval(timer);
      window.clearTimeout(giveUp);
      if (render()) return;
      setStatus('loading');
      ensureTurnstileScript();
      timer = window.setInterval(() => {
        if (render()) { window.clearInterval(timer); window.clearTimeout(giveUp); }
      }, 150);
      // 30s rather than 15s: the poll now also waits for a form that appears only
      // after its data loads, which on a slow connection takes longer than the
      // script alone ever did.
      giveUp = window.setTimeout(() => {
        window.clearInterval(timer);
        if (!widgetId.current && !cancelled) setStatus('failed');
      }, 30000);
    };
    start();
    mount.current = start;

    return () => {
      cancelled = true;
      mount.current = null;
      window.clearInterval(timer);
      window.clearTimeout(giveUp);
      if (widgetId.current) {
        try { window.turnstile?.remove(widgetId.current); } catch { /* already gone */ }
        widgetId.current = null;
      }
    };
  }, [active]);

  // Tear the widget down and mount a fresh one, rather than calling reset() on the
  // existing instance. Turnstile tokens are single-use, so every submission needs a
  // genuinely new challenge — a reused token is rejected server-side as
  // "timeout-or-duplicate". Removing and re-rendering also guarantees the widget
  // returns to its unsolved state instead of staying visually ticked.
  const reset = () => {
    setToken('');
    setStatus('loading');
    if (widgetId.current) {
      try { window.turnstile?.remove(widgetId.current); } catch { /* already gone */ }
      widgetId.current = null;
    }
    mount.current?.();
  };

  return { token, status, ref, reset, enabled: Boolean(TURNSTILE_SITE_KEY) };
}

/** The line under the widget: why submit is not on yet, and what to do about it. */
function TurnstileHint({ turnstile }: { turnstile: TurnstileHandle }) {
  const { tr } = useLang();
  const { status } = turnstile;
  if (status === 'solved') return null;
  const problem = status === 'error' || status === 'failed';
  const text =
    status === 'loading'
      ? tr('Checking your connection… Submit turns on in a moment.', 'Sinusuri ang koneksyon mo… Mabubuksan ang Submit sa ilang sandali.')
      : status === 'ready'
        ? tr('Complete the security check above to turn on Submit.', 'Kumpletuhin ang security check sa itaas para mabuksan ang Submit.')
        : status === 'expired'
          ? tr('The security check expired. Tick it again to continue.', 'Nag-expire ang security check. I-tick ulit para magpatuloy.')
          : tr(
              'The security check could not run. Check your internet connection, then try again.',
              'Hindi tumakbo ang security check. Tingnan ang internet connection mo, saka subukan ulit.',
            );
  return (
    <p
      role="status"
      aria-live="polite"
      className={`mt-1.5 flex items-start gap-1.5 text-[11.5px] leading-snug ${problem ? 'text-red-500' : 'text-gray-500'}`}
    >
      {status === 'loading' ? (
        <span aria-hidden="true" className="mt-[3px] h-2.5 w-2.5 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
      ) : (
        <i aria-hidden="true" className={`fa-solid ${problem ? 'fa-circle-exclamation' : 'fa-shield-halved'} mt-[2px] shrink-0 text-[10px]`} />
      )}
      <span>
        {text}
        {problem && (
          <button type="button" onClick={turnstile.reset} className="ml-1.5 font-semibold underline underline-offset-2">
            {tr('Try again', 'Subukan ulit')}
          </button>
        )}
      </span>
    </p>
  );
}

/** Renders nothing when no site key is configured. */
export function Turnstile({
  turnstile,
  className = 'my-4 w-full max-w-full overflow-x-auto',
}: {
  turnstile: TurnstileHandle;
  className?: string;
}) {
  if (!turnstile.enabled) return null;
  // One wrapper, so a form that lays the widget out in a row beside its
  // button still sees a single item.
  return (
    <div className="min-w-0">
      <div ref={turnstile.ref} className={className} />
      <TurnstileHint turnstile={turnstile} />
    </div>
  );
}
