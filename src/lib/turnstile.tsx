'use client';

import React, { useEffect, useRef, useState } from 'react';

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
  document.head.appendChild(s);
}

export interface TurnstileHandle {
  /** Current token, or '' when unsolved. Send this as `turnstileToken`. */
  token: string;
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
        callback: (t: string) => setToken(t),
        'expired-callback': () => setToken(''),
        'timeout-callback': () => setToken(''),
        'error-callback': () => setToken(''),
      });
      return true;
    };

    const timer = window.setInterval(() => { if (render()) window.clearInterval(timer); }, 150);
    // 30s rather than 15s: the poll now also waits for a form that appears only
    // after its data loads, which on a slow connection takes longer than the
    // script alone ever did.
    const giveUp = window.setTimeout(() => window.clearInterval(timer), 30000);
    render();
    mount.current = render;

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
    if (widgetId.current) {
      try { window.turnstile?.remove(widgetId.current); } catch { /* already gone */ }
      widgetId.current = null;
    }
    mount.current?.();
  };

  return { token, ref, reset, enabled: Boolean(TURNSTILE_SITE_KEY) };
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
  return <div ref={turnstile.ref} className={className} />;
}
