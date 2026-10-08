import { useId } from 'react';

/**
 * BrandIcons.tsx
 * ─────────────────────────────────────────────
 * The two app icons drawn in Getmeds' blue-to-green: Chat (two speech
 * bubbles) and Upload Rx (a prescription sheet with an upload badge).
 *
 * The white parts — the chat dots, the "Rx", the arrow and the thin gaps
 * between overlapping shapes — are cut out with masks rather than painted
 * white, so the icons sit cleanly on any background: the tinted tile on home,
 * or the gradient circle in the tab bar, where `mono` draws them in
 * currentColor instead of the gradient.
 */

type IconProps = { size?: number; mono?: boolean; className?: string };

function Gradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="4" y1="34" x2="42" y2="12" gradientUnits="userSpaceOnUse">
      <stop offset="0" stopColor="#0A84F0" />
      <stop offset=".55" stopColor="#1FB8B4" />
      <stop offset="1" stopColor="#7AD957" />
    </linearGradient>
  );
}

const BIG_BUBBLE =
  'M12 7H24A11 11 0 0 1 24 29H15.5L9.3 33.8C8.6 34.3 7.6 33.9 7.7 33L8.1 28.3A11 11 0 0 1 12 7Z';
const SMALL_BUBBLE =
  'M32 16.5A8 8 0 0 1 38.4 29.3L38.9 33.4C39 34.2 38.1 34.7 37.5 34.2L34.2 32.2A8 8 0 1 1 32 16.5Z';

export function ChatIcon({ size = 24, mono, className }: IconProps) {
  const id = useId().replace(/:/g, '');
  const fill = mono ? 'currentColor' : `url(#c${id})`;
  return (
    // Framed on the drawing itself (x 1-40, y 7-34.6) so it sits centred.
    <svg width={size} height={size} viewBox="-3.5 -3.2 48 48" className={className} aria-hidden="true">
      <defs>
        {!mono && (
          // Blue at the lower left running to green at the upper right, as in the artwork.
          <linearGradient id={`c${id}`} x1="1" y1="32" x2="40" y2="11" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#0A84F0" />
            <stop offset=".5" stopColor="#1EB3BE" />
            <stop offset="1" stopColor="#7AD957" />
          </linearGradient>
        )}
        <mask id={`b${id}`} maskUnits="userSpaceOnUse" x="-5" y="-5" width="58" height="58">
          <rect x="-5" y="-5" width="58" height="58" fill="#fff" />
          <circle cx="10.5" cy="18" r="2.6" fill="#000" />
          <circle cx="18" cy="18" r="2.6" fill="#000" />
          <circle cx="25.5" cy="18" r="2.6" fill="#000" />
        </mask>
        <mask id={`s${id}`} maskUnits="userSpaceOnUse" x="-5" y="-5" width="58" height="58">
          <rect x="-5" y="-5" width="58" height="58" fill="#fff" />
          <path d={BIG_BUBBLE} fill="#000" stroke="#000" strokeWidth="4.5" strokeLinejoin="round" />
        </mask>
      </defs>
      <path d={SMALL_BUBBLE} fill={fill} mask={`url(#s${id})`} />
      <path d={BIG_BUBBLE} fill={fill} mask={`url(#b${id})`} />
    </svg>
  );
}

const SHEET = 'M10 4H28.5L38 13.5V40A4 4 0 0 1 34 44H10A4 4 0 0 1 6 40V8A4 4 0 0 1 10 4Z';

export function UploadRxIcon({ size = 24, mono, className }: IconProps) {
  const id = useId().replace(/:/g, '');
  const fill = mono ? 'currentColor' : `url(#g${id})`;
  const cut = { fill: 'none', stroke: '#000', strokeWidth: 3.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        {!mono && <Gradient id={`g${id}`} />}
        <mask id={`d${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <rect width="48" height="48" fill="#fff" />
          {/* "Rx": the R's leg runs on into one stroke of the x. */}
          <path d="M13 30V14H18.5A5 5 0 0 1 18.5 24H13M18 24L26.5 34M26.5 26L19 34" {...cut} />
          {/* The gap around the upload badge. */}
          <circle cx="37" cy="36" r="11.4" fill="#000" />
        </mask>
        <mask id={`u${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <rect width="48" height="48" fill="#fff" />
          <path d="M37 41V31.5M33 35.3L37 31.3L41 35.3" {...cut} strokeWidth={2.8} />
        </mask>
      </defs>
      <path d={SHEET} fill={fill} mask={`url(#d${id})`} />
      {/* The folded corner, a lighter wash over the sheet. */}
      <path d="M28.5 4V10A3.5 3.5 0 0 0 32 13.5H38Z" fill="#fff" fillOpacity=".4" />
      <circle cx="37" cy="36" r="9" fill={fill} mask={`url(#u${id})`} />
    </svg>
  );
}
