'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * PullToRefresh.tsx
 * ─────────────────────────────────────────────
 * The native gesture the installed app was missing: drag down from the top of
 * any screen and a circular spinner rides down with the finger; let go past
 * the threshold and the page reloads fresh. Material style — the page itself
 * never moves, only the indicator does, which is also what spares us from
 * fighting every screen's own layout.
 *
 * Refresh is a plain location.reload(): the app boots on the same address, so
 * the screen comes back as itself with every query refetched. Heavier than an
 * in-place refetch, but it is what "refresh" honestly means, and it works the
 * same on every screen without each one having to export a reload hook.
 *
 * The gesture only arms when the window is at the very top, the touch is not
 * inside a bottom sheet or an element that is itself scrolled, and the drag
 * is clearly vertical — so it never steals the promo slider's horizontal
 * swipe or a sheet's own scroll.
 */

/** Indicator travel (px) past which release triggers the refresh. */
const THRESHOLD = 64;
/** The farthest the indicator rides; pulling further just meets resistance. */
const MAX = 96;
/** Finger movement before the gesture decides it is a vertical pull. */
const SLOP = 12;

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [state, setState] = useState<'idle' | 'pulling' | 'refreshing'>('idle');
  // Mirrors for the document-level listeners, which see stale state otherwise.
  const stateRef = useRef(state);
  stateRef.current = state;
  const pullRef = useRef(pull);
  pullRef.current = pull;
  const start = useRef<{ x: number; y: number } | null>(null);
  const armed = useRef(false);

  useEffect(() => {
    /** True if anything between the touch and <body> has its own scroll going. */
    const scrolledAncestor = (el: Element | null): boolean => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        if (n.scrollTop > 0) return true;
      }
      return false;
    };

    const onStart = (e: TouchEvent) => {
      if (stateRef.current === 'refreshing' || e.touches.length !== 1) return;
      if (window.scrollY > 0) return;
      const t = e.target as Element | null;
      // A sheet owns its own gesture; a scrolled pane means this drag is its
      // scroll coming back up, not a pull on the page.
      if (t && (t.closest('.gm-sheet') || scrolledAncestor(t))) return;
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      armed.current = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!start.current || stateRef.current === 'refreshing') return;
      const dx = e.touches[0].clientX - start.current.x;
      const dy = e.touches[0].clientY - start.current.y;
      if (!armed.current) {
        if (dy > SLOP && dy > Math.abs(dx) * 1.5 && window.scrollY <= 0) {
          armed.current = true;
          setState('pulling');
        } else if (dy < -4 || Math.abs(dx) > 16) {
          // Scrolling down or swiping sideways: not ours, stop watching.
          start.current = null;
        }
        return;
      }
      // Ours now: keep the browser's own overscroll glow out of it.
      e.preventDefault();
      setPull(Math.min(MAX, (dy - SLOP) * 0.45));
    };

    const finish = () => {
      if (armed.current) {
        if (pullRef.current >= THRESHOLD) {
          setState('refreshing');
          setPull(THRESHOLD);
          // Long enough for one visible spin, short enough to feel immediate.
          window.setTimeout(() => window.location.reload(), 500);
        } else {
          setState('idle');
          setPull(0);
        }
      }
      start.current = null;
      armed.current = false;
    };

    // touchmove must be non-passive or preventDefault() is ignored.
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', finish);
    document.addEventListener('touchcancel', finish);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', finish);
      document.removeEventListener('touchcancel', finish);
    };
  }, []);

  const visible = state !== 'idle' && pull > 0;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-1/2 z-[10050]"
      style={{
        top: 'calc(var(--gm-safe-top, 0px) + 6px)',
        // Parked 56px above its slot, so it slides in from under the top edge.
        transform: `translate(-50%, ${pull - 56}px)`,
        transition: state === 'pulling' ? 'none' : 'transform .25s ease, opacity .25s ease',
        opacity: visible ? 1 : 0,
      }}
    >
      <span
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white"
        style={{ boxShadow: '0 2px 10px rgba(23,43,77,.18)' }}
      >
        <i
          className={`fa-solid fa-arrows-rotate text-[16px] ${state === 'refreshing' ? 'fa-spin' : ''}`}
          style={{
            color: '#1D9FDA',
            // Winds up with the pull, so the drag visibly does something
            // before the threshold; fa-spin takes over on release.
            transform: state === 'refreshing' ? undefined : `rotate(${pull * 2.2}deg)`,
          }}
        />
      </span>
    </div>
  );
}
