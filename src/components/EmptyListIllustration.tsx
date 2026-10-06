import { useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/i18n';

/**
 * EmptyListIllustration.tsx
 * ─────────────────────────────────────────────
 * The empty request list: a blank request clipboard, a cart, and a pill
 * floating above it, in the flat brand-blue illustration style. On load the
 * cart rolls in from the left; the pill and the medicine box float, the plus
 * signs twinkle, and a tap drops the pill into the cart (it also does this
 * once on its own after the cart arrives, so people see it can).
 * Motion lives in app.css (gm-ill-*) and stops under prefers-reduced-motion.
 */

const BLUE = '#1D9FDA';
const DEEP = '#136E9E';
const PALE = '#BFE3F6';
const MIST = '#E8F4FB';
const LINE = '#CDEAF8';

const DROP_MS = 1100;

export default function EmptyListIllustration() {
  const { tr } = useLang();
  const [dropping, setDropping] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const drop = () => {
    if (dropping) return;
    setDropping(true);
    timer.current = window.setTimeout(() => setDropping(false), DROP_MS);
  };

  // One drop once the cart has rolled in, as a hint that it can be tapped.
  useEffect(() => {
    const t = window.setTimeout(drop, 2600);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <button
      type="button"
      onClick={drop}
      aria-label={tr('Drop a medicine into the list', 'Maglagay ng gamot sa list')}
      className="mb-4 block w-full max-w-[300px] touch-manipulation"
    >
      <svg viewBox="0 0 320 240" className="h-auto w-full" aria-hidden="true">
        {/* Backdrop */}
        <circle cx="160" cy="122" r="100" fill={MIST} />
        <line x1="30" y1="214" x2="290" y2="214" stroke={LINE} strokeWidth="3" strokeLinecap="round" />

        {/* Plus signs and a dot */}
        <g className="gm-ill-twinkle" stroke={PALE} strokeWidth="4" strokeLinecap="round">
          <path d="M40 72v18M31 81h18" />
        </g>
        <g className="gm-ill-twinkle gm-ill-delay" stroke={PALE} strokeWidth="4" strokeLinecap="round">
          <path d="M292 104v14M285 111h14" />
        </g>
        <circle cx="58" cy="192" r="5" fill={PALE} />

        {/* Request clipboard, rows still empty */}
        <rect x="82" y="50" width="128" height="156" rx="14" fill="#fff" stroke={LINE} strokeWidth="3" />
        <rect x="121" y="41" width="50" height="17" rx="6" fill={BLUE} />
        <circle cx="146" cy="46" r="3" fill="#fff" />
        <rect x="98" y="70" width="64" height="8" rx="4" fill={BLUE} />
        <rect x="98" y="83" width="40" height="6" rx="3" fill={PALE} />
        {[104, 134, 164].map((y) => (
          <g key={y}>
            <rect x="98" y={y} width="16" height="16" rx="4" fill={MIST} stroke={LINE} strokeWidth="2" />
            <rect x="122" y={y + 1} width="70" height="7" rx="3.5" fill={MIST} />
            <rect x="122" y={y + 11} width="44" height="5" rx="2.5" fill={MIST} />
          </g>
        ))}

        {/* Medicine box, floating left */}
        <g transform="translate(36 112)">
          <g className="gm-ill-float gm-ill-delay">
            <rect x="0" y="0" width="30" height="34" rx="6" fill="#fff" stroke={PALE} strokeWidth="3" />
            <path d="M15 9v16M7 17h16" stroke={BLUE} strokeWidth="4" strokeLinecap="round" />
          </g>
        </g>

        {/* Cart */}
        <g transform="translate(192 130)">
          <g className="gm-ill-roll">
          <g className={dropping ? 'gm-ill-bump' : ''}>
            <path d="M0 8h14l12 54h62" fill="none" stroke={DEEP} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M18 22h78l-10 32H26z" fill={BLUE} stroke={BLUE} strokeWidth="6" strokeLinejoin="round" />
            <path d="M42 26v24M58 26v24M74 26v24" stroke="#fff" strokeOpacity=".55" strokeWidth="4" strokeLinecap="round" />
            <circle cx="36" cy="76" r="7" fill={DEEP} />
            <circle cx="36" cy="76" r="2.5" fill="#fff" />
            <circle cx="80" cy="76" r="7" fill={DEEP} />
            <circle cx="80" cy="76" r="2.5" fill="#fff" />
          </g>
          </g>
        </g>

        {/* Pill: floats, and drops into the cart on tap */}
        <g transform="translate(246 80)">
          <g className={dropping ? 'gm-ill-drop' : 'gm-ill-float'}>
            <g transform="rotate(-32)">
              <rect x="-20" y="-8" width="40" height="16" rx="8" fill={PALE} />
              <path d="M-12 -8h12v16h-12a8 8 0 0 1 0-16z" fill={BLUE} />
            </g>
          </g>
        </g>
      </svg>
    </button>
  );
}
