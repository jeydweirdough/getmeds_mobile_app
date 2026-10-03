import { useEffect, useRef, useState } from 'react';
import PointsCard, { usePoints } from '@/lib/PointsCard';
import { SignInSheet } from '@/lib/ProfileCard';

/**
 * Onboarding.tsx
 * ─────────────────────────────────────────────
 * Three welcome slides shown over the app the first time it is opened after
 * install, and never again on that phone. Each slide pairs a photo layout with
 * one line about what Getmeds does:
 *
 *   1  one large photo fading into brand blue  — who we are
 *   2  a tilted collage of real Getmeds photos — the people we serve
 *   3  a collage of patient portraits           — how to request
 *
 * The slides swipe (native scroll-snap); the footer — dots, "Let's explore"
 * and the round next button — stays put. "Skip", "Let's explore" and the
 * round button on the last slide all lead to the sign-up / log-in screen,
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

/** Shared photo tile: rounded, soft shadow, and a white frame unless `frameless`. */
function Tile({ src, className = '', style, frameless = false }: { src: string; className?: string; style?: React.CSSProperties; frameless?: boolean }) {
  return (
    <div
      className={`overflow-hidden rounded-[22px] bg-[#EAF4FB] ${frameless ? '' : 'border-[3px] border-white'} ${className}`}
      style={{ boxShadow: '0 10px 26px rgba(23,43,77,.14)', ...style }}
    >
      <img src={src} alt="" className="h-full w-full object-cover" draggable={false} />
    </div>
  );
}

/** Brand-blue fade at the bottom of every visual, so the photos melt into the text. */
function Fade() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%]"
      style={{ background: `linear-gradient(180deg, rgba(${GROUND_RGB},0) 0%, rgba(${GROUND_RGB},.85) 55%, ${GROUND} 100%)` }}
    />
  );
}

/* ── Slide visuals ─────────────────────────────────────────────────────── */

function HeroVisual() {
  return (
    <div className="absolute inset-0">
      <img src={`${IMG}/hero.webp`} alt="" className="h-full w-full object-cover" style={{ objectPosition: 'center 30%' }} draggable={false} />
      <Fade />
    </div>
  );
}

const COLLAGE: string[][] = [
  [`${IMG}/collage-1.webp`, `${IMG}/collage-2.webp`, `${IMG}/collage-3.webp`],
  [`${IMG}/collage-4.webp`, `${IMG}/collage-5.webp`, `${IMG}/collage-6.webp`],
  [`${IMG}/collage-7.webp`, `${IMG}/collage-8.webp`, `${IMG}/collage-2.webp`],
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
    Visual: HeroVisual,
    title: ['Your Compassionate', 'Health Ally'],
    body: 'Specialty medicines for cancer, heart, blood disorders and more, all in one app.',
  },
  {
    Visual: CollageVisual,
    title: ['Care That Reaches', 'Every Patient'],
    body: 'Join the patients and families who get their medicines through Getmeds and our Patient Assistance Program.',
  },
  {
    Visual: PatientsVisual,
    title: ['Request With', 'Just a Photo'],
    body: 'Send a photo of your prescription and our team will come back to you with availability.',
  },
];

/* ── Sign up / log in ──────────────────────────────────────────────────── */

/**
 * The last step. Sign up and Log in open the same sheet (AuthForm), each on
 * its own form; the form links to the other and to "Forgot password". Its own
 * component so the points hook only runs once someone gets this far, not on
 * every launch.
 */
function AuthStep({ onDone }: { onDone: () => void }) {
  const points = usePoints();
  const [mode, setMode] = useState<'signup' | 'login' | null>(null);

  // Signing up or logging in flips signedIn; that is the end of onboarding.
  const done = useRef(false);
  useEffect(() => {
    if (!mode || !points.signedIn || done.current) return;
    done.current = true;
    onDone();
  }, [mode, points.signedIn, onDone]);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
        <span className="mb-6 flex h-[88px] w-[88px] items-center justify-center rounded-full bg-white/15">
          <span className="flex h-[64px] w-[64px] items-center justify-center rounded-full bg-white">
            <i className="fa-solid fa-user text-[24px]" style={{ color: BRAND }} />
          </span>
        </span>
        <h1 className="text-[26px] font-medium leading-[1.18] text-white">Welcome to Getmeds</h1>
        <p className="mx-auto mt-3 max-w-[300px] text-[13px] leading-relaxed text-white/85">
          Create an account with your email or mobile number to earn points on every request.
        </p>
      </div>

      <div className="space-y-3 px-6 pt-4" style={{ paddingBottom: 'calc(22px + env(safe-area-inset-bottom, 0px))' }}>
        <button
          type="button"
          onClick={() => setMode('signup')}
          className="h-[54px] w-full rounded-full bg-white text-[15px] font-semibold"
          style={{ color: BRAND, boxShadow: '0 10px 24px rgba(10,42,67,.18)' }}
        >
          Sign up
        </button>
        <button
          type="button"
          onClick={() => setMode('login')}
          className="h-[54px] w-full rounded-full border-[1.5px] border-white/70 text-[15px] font-semibold text-white"
        >
          Log in
        </button>
        <button type="button" onClick={onDone} className="w-full py-2 text-[13px] font-medium text-white/85">
          Continue as guest
        </button>
      </div>

      <SignInSheet open={mode !== null} onClose={() => setMode(null)}>
        {/* Keyed so each button opens its own form fresh. */}
        <PointsCard key={mode ?? 'closed'} points={points} bare initialMode={mode ?? 'signup'} />
      </SignInSheet>
    </>
  );
}

/* ── Screen ────────────────────────────────────────────────────────────── */

export default function Onboarding() {
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
      aria-label="Welcome to Getmeds"
    >
      {/* The regular logo turned white with a filter (it is a transparent PNG),
          so there is no second file to keep in step with it. */}
      <img
        src="/assets/getmeds-logo-sm.png"
        alt="Getmeds"
        className="absolute left-4 z-20 h-[38px] w-auto"
        style={{ top: 'calc(8px + env(safe-area-inset-top, 0px))', filter: 'brightness(0) invert(1)' }}
        draggable={false}
      />

      {step === 'slides' && (
      <button
        type="button"
        onClick={toAuth}
        className="absolute right-4 z-20 rounded-full px-3 py-1.5 text-[13px] font-medium text-white"
        style={{ top: 'calc(10px + env(safe-area-inset-top, 0px))', background: 'rgba(10,42,67,.35)', backdropFilter: 'blur(8px)' }}
      >
        Skip
      </button>
      )}

      {step === 'auth' ? (
        <AuthStep onDone={finish} />
      ) : (
      <>

      <div
        ref={track}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="gm-hscroll flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto"
      >
        {SLIDES.map(({ Visual, title, body }, i) => (
          <section
            key={i}
            className="flex w-full shrink-0 snap-start flex-col"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${SLIDES.length}`}
          >
            <div className="relative min-h-0 flex-1">
              <Visual />
            </div>
            <div className="relative px-8 pb-2 pt-1 text-center">
              <Sparkle className="left-6 top-0" color="#FFFFFF" size={16} />
              <Sparkle className="right-7 top-14" color={BRAND_GREEN} size={13} />
              <h1 className="text-[26px] font-medium leading-[1.18] text-white">
                {title[0]}
                <br />
                {title[1]}
              </h1>
              <p className="mx-auto mt-3 max-w-[300px] text-[13px] leading-relaxed text-white/85">{body}</p>
            </div>
          </section>
        ))}
      </div>

      <div className="px-6 pt-4" style={{ paddingBottom: 'calc(22px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="mb-6 flex justify-center gap-1.5" role="tablist" aria-label="Slides">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Slide ${i + 1}`}
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
            style={{ color: BRAND, boxShadow: '0 10px 24px rgba(10,42,67,.18)' }}
          >
            {last ? 'Get started' : 'Let’s explore'}
          </button>
          <span className="flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-full" style={{ border: '1.5px solid rgba(255,255,255,.45)' }}>
            <button
              type="button"
              onClick={next}
              aria-label={last ? 'Finish' : 'Next slide'}
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
