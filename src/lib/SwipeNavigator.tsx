'use client';

import { useEffect, useRef, useState } from 'react';
import PageSkeleton from '@/components/PageSkeleton';
import { goBack } from '@/platform/navigation';
import { navigate } from '@/platform/router';
import { normalisePath } from '@/platform/routes';

/**
 * SwipeNavigator.tsx
 * ─────────────────────────────────────────────
 * Swiping between screens, the way Instagram does it:
 *
 *   tab screens   Home ↔ Products ↔ Chat ↔ Requests, in tab bar order. Drag
 *                 left for the next tab, right for the one before.
 *   other screens a category, a product... drag right to go back.
 *
 * The next screen rides in under the finger and the swipe lands or springs
 * back depending on how far, or how fast, it went.
 *
 * What slides is a panel laid over the page (a skeleton of the screen that is
 * coming), not the page itself: a transform on the screen would turn every
 * position:fixed header, sheet and bottom bar inside it into position:absolute
 * for the length of the drag (see .gm-screen-in in app.css). On release the
 * real screen mounts under the panel, which then fades away.
 *
 * Never starts on something that has its own sideways gesture or its own
 * world: a horizontal scroller (the promo slider, the category strip), a form
 * field, an open sheet or dialog, or a full screen opened over a page.
 */

const TABS = ['/app-home', '/product-range', '/chat', '/cart'];
/** Finger travel before the gesture decides which way it is going. */
const SLOP = 10;
/** Share of the screen width past which a release lands the swipe. */
const COMMIT_SHARE = 0.35;
/** A flick this fast (px/ms) lands it however short it was. */
const FLICK = 0.45;
const DURATION = 240;
const EASE = 'cubic-bezier(.2,.8,.2,1)';

function tabIndex(pathname: string): number {
  const path = normalisePath(pathname);
  if (path === '/' || path === '/index') return 0;
  return TABS.indexOf(path);
}

/** True if the touch landed on something that owns horizontal drags itself. */
function ownsSwipe(target: Element | null): boolean {
  if (!target) return true;
  if (target.closest('input, textarea, select, [contenteditable="true"], [role="slider"], [data-no-swipe], .gm-sheet, [role="dialog"], [data-history-backed]')) return true;
  for (let n: Element | null = target; n && n !== document.body; n = n.parentElement) {
    const el = n as HTMLElement;
    if (el.scrollWidth > el.clientWidth + 1) {
      const ox = getComputedStyle(el).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
  }
  return false;
}

/** A sheet or modal is up: the page underneath is not what the finger is on. */
function overlayOpen(): boolean {
  if (document.body.style.overflow === 'hidden') return true;
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).some(
    (el) => el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0,
  );
}

type Target = { go: () => void; from: 1 | -1 };

export default function SwipeNavigator() {
  // Which side the panel comes in from while a swipe is under way; null hides it.
  const [from, setFrom] = useState<1 | -1 | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let start: { x: number; y: number } | null = null;
    let target: Target | null = null;
    let locked = false;
    let busy = false;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;

    const width = () => window.innerWidth || 1;

    /** Moves the panel to `travel` px of the way in (0 = parked off screen). */
    const paint = (travel: number, animate: boolean) => {
      const panel = panelRef.current;
      const scrim = scrimRef.current;
      if (!panel || !scrim || !target) return;
      const w = width();
      const t = Math.max(0, Math.min(w, travel));
      const transition = animate && !reduced ? `transform ${DURATION}ms ${EASE}` : 'none';
      panel.style.transition = transition;
      panel.style.transform = `translate3d(${target.from * (w - t)}px,0,0)`;
      scrim.style.transition = animate && !reduced ? `opacity ${DURATION}ms ${EASE}` : 'none';
      scrim.style.opacity = String((t / w) * 0.28);
    };

    const reset = () => {
      start = null;
      target = null;
      locked = false;
    };

    /** Which way this drag goes from here, if anywhere. */
    const resolve = (dx: number): Target | null => {
      const i = tabIndex(window.location.pathname);
      if (i >= 0) {
        if (dx < 0 && i < TABS.length - 1) return { from: 1, go: () => navigate(TABS[i + 1]) };
        if (dx > 0 && i > 0) return { from: -1, go: () => navigate(TABS[i - 1]) };
        return null;
      }
      if (dx > 0) return { from: -1, go: () => goBack('/app-home') };
      return null;
    };

    const onStart = (e: TouchEvent) => {
      if (busy || e.touches.length !== 1) return;
      if (overlayOpen() || ownsSwipe(e.target as Element | null)) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastX = start.x;
      lastT = e.timeStamp;
      velocity = 0;
      locked = false;
      target = null;
    };

    const onMove = (e: TouchEvent) => {
      if (!start || busy) return;
      const x = e.touches[0].clientX;
      const dx = x - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (!locked) {
        if (Math.abs(dy) > SLOP && Math.abs(dy) >= Math.abs(dx)) { reset(); return; }
        if (Math.abs(dx) < SLOP || Math.abs(dx) < Math.abs(dy) * 1.3) return;
        target = resolve(dx);
        if (!target) { reset(); return; }
        locked = true;
        setFrom(target.from);
      }
      // Ours now: no vertical scroll or pull-to-refresh under a sideways drag.
      e.preventDefault();
      const dt = e.timeStamp - lastT;
      if (dt > 0) velocity = 0.7 * ((x - lastX) / dt) + 0.3 * velocity;
      lastX = x;
      lastT = e.timeStamp;
      // Only the travel towards the target counts; dragging back parks it again.
      const travel = -target!.from * dx;
      requestAnimationFrame(() => { if (locked && !busy) paint(travel, false); });
    };

    const onEnd = () => {
      if (!start) return;
      if (!locked || !target) { reset(); return; }
      const t = target;
      const travel = -t.from * (lastX - start.x);
      const flick = -t.from * velocity;
      const land = travel > width() * COMMIT_SHARE || (flick > FLICK && travel > SLOP);
      busy = true;
      paint(land ? width() : 0, true);
      const wait = reduced ? 0 : DURATION;
      window.setTimeout(() => {
        if (!land) {
          setFrom(null);
          busy = false;
          reset();
          return;
        }
        t.go();
        // Two frames for the new screen to commit and paint under the panel,
        // then the panel fades off it.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const panel = panelRef.current;
          const scrim = scrimRef.current;
          if (panel) {
            panel.style.transition = reduced ? 'none' : 'opacity 180ms ease-out';
            panel.style.opacity = '0';
          }
          if (scrim) scrim.style.opacity = '0';
          window.setTimeout(() => {
            setFrom(null);
            busy = false;
            reset();
          }, reduced ? 0 : 190);
        }));
      }, wait);
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    // touchmove must be non-passive or preventDefault() is ignored.
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  if (from === null) return null;
  return (
    <>
      <div
        ref={scrimRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[9995] bg-black"
        style={{ opacity: 0 }}
      />
      {/* Parked just off the side it comes in from until the first move paints it. */}
      <div
        ref={panelRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[9996] overflow-hidden bg-white"
        style={{
          transform: `translate3d(${from * 100}%,0,0)`,
          paddingTop: 'var(--gm-safe-top)',
          boxShadow: from === 1 ? '-8px 0 24px rgba(23,43,77,.12)' : '8px 0 24px rgba(23,43,77,.12)',
          willChange: 'transform',
        }}
      >
        <PageSkeleton />
      </div>
    </>
  );
}
