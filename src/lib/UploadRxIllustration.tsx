import { useId } from 'react';

/**
 * UploadRxIllustration.tsx
 * ─────────────────────────────────────────────
 * The picture in the prescription upload box: a prescription sheet floating
 * over a soft blue disc, with Getmeds' blue-to-green upload badge whose arrow
 * keeps rising, and a few sparkles. Pure SVG + CSS, so it needs no image file
 * and stays sharp at any size. Motion stops for people who ask their phone to
 * reduce it.
 */

const CSS = `
.gm-urx-sheet{animation:gmUrxFloat 3.2s ease-in-out infinite}
.gm-urx-arrow{animation:gmUrxRise 1.6s ease-in-out infinite}
.gm-urx-badge{animation:gmUrxPulse 1.6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.gm-urx-spark{transform-box:fill-box;transform-origin:center;animation:gmUrxTwinkle 2.4s ease-in-out infinite}
.gm-urx-spark.d1{animation-delay:.8s}.gm-urx-spark.d2{animation-delay:1.6s}
@keyframes gmUrxFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes gmUrxRise{0%{transform:translateY(5px);opacity:0}30%{opacity:1}70%{opacity:1}100%{transform:translateY(-6px);opacity:0}}
@keyframes gmUrxPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes gmUrxTwinkle{0%,100%{transform:scale(.4);opacity:.2}50%{transform:scale(1);opacity:1}}
@media (prefers-reduced-motion: reduce){.gm-urx-sheet,.gm-urx-arrow,.gm-urx-badge,.gm-urx-spark{animation:none}}
`;

/** A four-point sparkle centred on (x, y). */
const spark = (x: number, y: number, r: number) =>
  `M${x} ${y - r}Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y}Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r}Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y}Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`;

export function UploadRxIllustration({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 160 120" className={className} role="img" aria-label="Upload your prescription">
      <style>{CSS}</style>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#0A84F0" />
          <stop offset=".55" stopColor="#1FB8B4" />
          <stop offset="1" stopColor="#7AD957" />
        </linearGradient>
      </defs>

      {/* Ground: a soft disc and the sheet's shadow on it. */}
      <circle cx="80" cy="60" r="50" fill="#EAF5FC" />
      <ellipse cx="80" cy="104" rx="26" ry="3.5" fill="#D6E6F2" />

      {/* The prescription sheet. */}
      <g className="gm-urx-sheet">
        <path d="M60 20H92L104 32V90A6 6 0 0 1 98 96H60A6 6 0 0 1 54 90V26A6 6 0 0 1 60 20Z" fill="#fff" stroke="#D6E6F2" strokeWidth="1.5" />
        <path d="M92 20V28A4 4 0 0 0 96 32H104Z" fill="#E3EEF7" />
        {/* "Rx" */}
        <path d="M63 46V32H68A3.6 3.6 0 0 1 68 39.2H63M67 39.2L74.5 47M74.5 40.5L67.5 47" fill="none" stroke={`url(#g${id})`} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        {/* Writing and a signature. */}
        <rect x="63" y="55" width="30" height="3" rx="1.5" fill="#E3EAF2" />
        <rect x="63" y="62" width="24" height="3" rx="1.5" fill="#E3EAF2" />
        <rect x="63" y="69" width="27" height="3" rx="1.5" fill="#E3EAF2" />
        <path d="M63 85C66 80 68 88 71 83S76 82 78 85" fill="none" stroke="#B9C9D8" strokeWidth="1.6" strokeLinecap="round" />
      </g>

      {/* The upload badge. */}
      <g className="gm-urx-badge">
        <circle cx="104" cy="84" r="15" fill="#fff" />
        <circle cx="104" cy="84" r="12.5" fill={`url(#g${id})`} />
      </g>
      <g className="gm-urx-arrow">
        <path d="M104 90V78M99 82.5L104 77.5L109 82.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      {/* Sparkles. */}
      <path className="gm-urx-spark" d={spark(36, 34, 5)} fill="#7AD957" />
      <path className="gm-urx-spark d1" d={spark(126, 36, 4)} fill="#1D9FDA" />
      <path className="gm-urx-spark d2" d={spark(40, 82, 3.5)} fill="#1FB8B4" />
    </svg>
  );
}
