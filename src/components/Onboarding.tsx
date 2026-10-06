import { useEffect, useRef, useState } from 'react';
import PointsCard, { usePoints } from '@/lib/PointsCard';
import { SignInSheet } from '@/lib/ProfileCard';
import { useLang } from '@/lib/i18n';

/**
 * Onboarding.tsx
 * ─────────────────────────────────────────────
 * Three welcome slides shown over the app the first time it is opened after
 * install, and never again on that phone. Each slide pairs a photo layout with
 * one line about what Getmeds does:
 *
 *   1  a fanned stack of photo cards on white   — who we are
 *   2  a tilted collage of real Getmeds photos — the people we serve
 *   3  a collage of patient portraits           — how to request
 *
 * The slides swipe (native scroll-snap); the footer — dots, "Let's explore"
 * and the round next button — stays put. "Skip", "Let's explore" and the
 * round button on the last slide all lead to the log-in screen,
 * which is where onboarding finishes: by signing in, or as a guest.
 *
 * "Seen" is a localStorage flag. The app's web view keeps it across launches
 * and clears it on uninstall, which is exactly "first time after installing".
 */

const SEEN_KEY = 'getmeds:onboarded';
const BRAND = '#1D9FDA';
const BRAND_GREEN = '#61A644';
const IMG = '/assets/onboarding';
// The ground behind the text, and what every photo fades into.
const GROUND = BRAND;
const GROUND_RGB = '29,159,218';

const hasSeen = () => {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    // No storage at all: showing it every launch would be worse than never.
    return true;
  }
};

const markSeen = () => {
  try { window.localStorage.setItem(SEEN_KEY, '1'); } catch { /* nothing to keep it in */ }
};

/** The four-point sparkle from the design, in brand colours. */
function Sparkle({ className, color, size = 14 }: { className: string; color: string; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className={`pointer-events-none absolute ${className}`}>
      <path d="M12 0C13 7 17 11 24 12C17 13 13 17 12 24C11 17 7 13 0 12C7 11 11 7 12 0Z" fill={color} />
    </svg>
  );
}

/** Shared photo tile: rounded, with a white frame and soft shadow unless `frameless`.
 *  Frameless tiles sit close together on white, where the shadows would pool
 *  in the gaps and turn them grey, so they go without. */
function Tile({ src, className = '', style, frameless = false }: { src: string; className?: string; style?: React.CSSProperties; frameless?: boolean }) {
  return (
    <div
      className={`overflow-hidden rounded-[22px] bg-white ${frameless ? '' : 'border-[3px] border-white'} ${className}`}
      style={{ boxShadow: frameless ? 'none' : '0 10px 26px rgba(23,43,77,.14)', ...style }}
    >
      <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
    </div>
  );
}

/** Brand-blue fade at the bottom of every visual, so the photos melt into the text. */
function Fade({ height = 'h-[42%]' }: { height?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-0 bottom-0 ${height}`}
      style={{ background: `linear-gradient(180deg, rgba(${GROUND_RGB},0) 0%, rgba(${GROUND_RGB},.85) 55%, ${GROUND} 100%)` }}
    />
  );
}

/* ── Slide visuals ─────────────────────────────────────────────────────── */

/** A round photo with a soft white ring, placed by percentages inside a card. */
function Bubble({ src, className, position = 'center' }: { src: string; className: string; position?: string }) {
  return (
    <span className={`absolute aspect-square overflow-hidden rounded-full border-[3px] border-white/60 bg-white/30 ${className}`}>
      <img src={src} alt="" className="h-full w-full object-cover" style={{ objectPosition: position }} draggable={false} />
    </span>
  );
}

/** Slide 1: three cards fanned over a soft circle, the front one a cluster of photo bubbles. */
function StackVisual() {
  const { tr } = useLang();
  return (
    <div className="absolute inset-0 overflow-hidden bg-white">
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-[48%] aspect-square w-[130%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: '#EEF6FB' }}
      />

      <div className="absolute left-1/2 top-[51%] aspect-[3/4] w-[70%] max-w-[300px] -translate-x-1/2 -translate-y-1/2">
        {/* Back left */}
        <div
          className="absolute inset-0 overflow-hidden rounded-[28px]"
          style={{ background: 'linear-gradient(160deg,#FFD98A 0%,#F59E0B 100%)', transform: 'translateX(-30%) rotate(-10deg) scale(.9)' }}
        >
          <Bubble src={`${IMG}/image2.webp`} className="left-[6%] top-[30%] w-[38%]" />
        </div>
        {/* Back right */}
        <div
          className="absolute inset-0 overflow-hidden rounded-[28px]"
          style={{ background: 'linear-gradient(160deg,#D8C8FF 0%,#7C3AED 100%)', transform: 'translateX(30%) rotate(10deg) scale(.9)' }}
        >
          <Bubble src={`${IMG}/image3.webp`} className="right-[6%] top-[38%] w-[34%]" />
        </div>
        {/* Front */}
        <div
          className="absolute inset-0 overflow-hidden rounded-[28px]"
          style={{ background: 'linear-gradient(160deg,#FF9A8B 0%,#F0568C 50%,#A445B2 100%)', boxShadow: '0 18px 40px rgba(164,69,178,.25)' }}
        >
          <Bubble src={`${IMG}/hero.webp`} className="left-[8%] top-[9%] w-[56%]" position="center 30%" />
          <Bubble src={`${IMG}/collage-4.webp`} className="right-[10%] top-[7%] w-[24%]" />
          <Bubble src={`${IMG}/image4.webp`} className="right-[6%] top-[30%] w-[36%]" />
          <Bubble src={`${IMG}/image1.webp`} className="left-[18%] top-[47%] w-[34%]" />
          <div className="absolute bottom-4 left-4 text-left">
            <p className="text-[15px] font-medium leading-tight text-white">Getmeds</p>
            <p className="text-[10.5px] text-white/80">{tr('Patient community', 'Komunidad ng pasyente')}</p>
          </div>
          <span className="absolute bottom-4 right-3.5 rounded-full bg-white/25 px-2.5 py-1 text-[9.5px] font-medium text-white">
            {tr('Join now', 'Sumali na')}
          </span>
        </div>

        {/* Floating accents */}
        <span
          aria-hidden="true"
          className="absolute -right-[16%] top-[2%] flex h-8 w-8 items-center justify-center rounded-full border-[3px] border-white text-white"
          style={{ background: BRAND_GREEN }}
        >
          <i className="fa-solid fa-plus text-[11px]" />
        </span>
        <span
          aria-hidden="true"
          className="absolute -bottom-[9%] left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border-[3px] border-white text-white"
          style={{ background: '#F0568C' }}
        >
          <i className="fa-solid fa-location-arrow text-[11px]" />
        </span>
      </div>
      {/* A little shorter than the other slides' fade: the card bottoms melt into the blue, the photos stay clear. */}
      <Fade height="h-[34%]" />
    </div>
  );
}

const COLLAGE: string[][] = [
  [`${IMG}/collage-1.webp`, `${IMG}/image3.webp`, `${IMG}/collage-3.webp`],
  [`${IMG}/collage-4.webp`, `${IMG}/image1.webp`, `${IMG}/image2.webp`],
  [`${IMG}/collage-7.webp`, `${IMG}/image4.webp`, `${IMG}/image3.webp`],
];

function CollageVisual() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-white">
      {/* Three staggered columns, tilted and oversized so they bleed off every edge. */}
      <div
        className="absolute left-1/2 top-[44%] flex w-[150%] gap-3"
        style={{ transform: 'translate(-50%, -50%) rotate(-12deg)' }}
      >
        {COLLAGE.map((col, i) => (
          <div key={i} className="flex flex-1 flex-col gap-3" style={{ marginTop: i === 1 ? -70 : i === 2 ? 40 : 0 }}>
            {col.map((src, j) => (
              <Tile key={j} src={src} className="aspect-[3/4] w-full" frameless />
            ))}
          </div>
        ))}
      </div>
      <Fade />
    </div>
  );
}

function PatientsVisual() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-white">
      {/* Slightly wider than the screen so the outer portraits bleed off the edges. */}
      <img
        src={`${IMG}/thirdslide.webp`}
        alt=""
        className="absolute left-1/2 top-[48%] w-[112%] max-w-none -translate-x-1/2 -translate-y-1/2"
        draggable={false}
      />
      <Fade />
    </div>
  );
}

const SLIDES = [
  {
    Visual: StackVisual,
    title: ['Your Compassionate', 'Health Ally'],
    titleTl: ['Ang Iyong Maalagang', 'Kasama sa Kalusugan'],
    body: 'Specialty medicines for cancer, heart, blood disorders and more, all in one app.',
    bodyTl: 'Mga specialty na gamot para sa cancer, puso, sakit sa dugo at iba pa, sa iisang app.',
  },
  {
    Visual: CollageVisual,
    title: ['Care That Reaches', 'Every Patient'],
    titleTl: ['Kalingang Umaabot', 'sa Bawat Pasyente'],
    body: 'Join the patients and families who get their medicines through Getmeds and our Patient Assistance Program.',
    bodyTl: 'Sumama sa mga pasyente at pamilyang kumukuha ng gamot sa Getmeds at sa aming Patient Assistance Program.',
  },
  {
    Visual: PatientsVisual,
    title: ['Request With', 'Just a Photo'],
    titleTl: ['Mag-request Gamit', 'ang Isang Litrato'],
    body: 'Send a photo of your prescription and our team will come back to you with availability.',
    bodyTl: 'Ipadala ang litrato ng reseta mo at babalikan ka ng aming team kung available ito.',
  },
];

/* ── Sign up / log in ──────────────────────────────────────────────────── */

/**
 * The last step: the log-in page, which links to Create account and Forgot
 * password. Back returns to the slides; "Continue as guest" skips signing in.
 * Its own component so the points hook only runs once someone gets this far,
 * not on every launch.
 */
function AuthStep({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const points = usePoints();

  // Signing up or logging in flips signedIn; that is the end of onboarding.
  const done = useRef(false);
  useEffect(() => {
    if (!points.signedIn || done.current) return;
    done.current = true;
    onDone();
  }, [points.signedIn, onDone]);

  return (
    <SignInSheet open onClose={onBack}>
      <PointsCard points={points} bare initialMode="login" onGuest={onDone} />
    </SignInSheet>
  );
}

/* ── Screen ────────────────────────────────────────────────────────────── */

export default function Onboarding() {
  const { tr } = useLang();
  const [open, setOpen] = useState(() => !hasSeen());
  const [leaving, setLeaving] = useState(false);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<'slides' | 'auth'>('slides');
  const track = useRef<HTMLDivElement>(null);

  // Keep the page underneath from scrolling while this is up.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const finish = () => {
    markSeen();
    setLeaving(true);
    window.setTimeout(() => setOpen(false), 280);
  };

  const goTo = (i: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  const toAuth = () => setStep('auth');
  const next = () => (index >= SLIDES.length - 1 ? toAuth() : goTo(index + 1));
  const last = index === SLIDES.length - 1;

  return (
    <div
      className="fixed inset-0 z-[10100] flex flex-col transition-opacity duration-300"
      style={{ opacity: leaving ? 0 : 1, background: GROUND }}
      role="dialog"
      aria-modal="true"
      aria-label={tr('Welcome to Getmeds', 'Welcome sa Getmeds')}
    >

      {step === 'slides' && (
      <button
        type="button"
        onClick={toAuth}
        className="absolute right-4 z-20 rounded-full px-3 py-1.5 text-[13px] font-medium text-white"
        style={{ top: 'calc(10px + var(--gm-safe-top))', background: 'rgba(10,42,67,.35)', backdropFilter: 'blur(8px)' }}
      >
        {tr('Skip', 'Laktawan')}
      </button>
      )}

      {step === 'auth' ? (
        <AuthStep onDone={finish} onBack={() => { setIndex(0); setStep('slides'); }} />
      ) : (
      <>

      <div
        ref={track}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="gm-hscroll flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto"
      >
        {SLIDES.map(({ Visual, title, titleTl, body, bodyTl }, i) => (
          <section
            key={i}
            className="flex w-full shrink-0 snap-start flex-col"
            aria-roledescription="slide"
            aria-label={tr(`${i + 1} of ${SLIDES.length}`, `${i + 1} sa ${SLIDES.length}`)}
          >
            <div className="relative min-h-0 flex-1">
              <Visual />
            </div>
            {/* Solid ground, pulled up 2px over the photo's fade, so no seam shows above the title. */}
            <div className="relative -mt-[2px] px-8 pb-2 pt-[6px] text-center" style={{ background: GROUND }}>
              <Sparkle className="left-6 top-0" color="#FFFFFF" size={16} />
              <Sparkle className="right-7 top-14" color={BRAND_GREEN} size={13} />
              <h1 className="text-[26px] font-medium leading-[1.18] text-white">
                {tr(title[0], titleTl[0])}
                <br />
                {tr(title[1], titleTl[1])}
              </h1>
              <p className="mx-auto mt-3 max-w-[300px] text-[13px] leading-relaxed text-white/85">{tr(body, bodyTl)}</p>
            </div>
          </section>
        ))}
      </div>

      <div className="px-6 pt-4" style={{ paddingBottom: 'calc(22px + var(--gm-safe-bottom))' }}>
        <div className="mb-6 flex justify-center gap-1.5" role="tablist" aria-label={tr('Slides', 'Mga slide')}>
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={tr(`Slide ${i + 1}`, `Slide ${i + 1}`)}
              onClick={() => goTo(i)}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{ width: i === index ? 20 : 6, background: i === index ? '#FFFFFF' : 'rgba(255,255,255,.4)' }}
            />
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toAuth}
            className="h-[54px] flex-1 rounded-full bg-white text-[15px] font-semibold"
            style={{ color: BRAND }}
          >
            {last ? tr('Get started', 'Magsimula na') : tr('Let’s explore', 'Tara, tingnan natin')}
          </button>
          <span className="flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-full" style={{ border: '1.5px solid rgba(255,255,255,.45)' }}>
            <button
              type="button"
              onClick={next}
              aria-label={last ? tr('Finish', 'Tapusin') : tr('Next slide', 'Susunod na slide')}
              className="flex h-[50px] w-[50px] items-center justify-center rounded-full bg-white"
              style={{ color: BRAND }}
            >
              <i className={`fa-solid ${last ? 'fa-check' : 'fa-chevron-right'} text-[15px]`} />
            </button>
          </span>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
