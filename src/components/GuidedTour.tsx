import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useLang } from '@/lib/i18n';

/**
 * GuidedTour.tsx
 * ─────────────────────────────────────────────
 * First-visit walks through a screen: the rest dims, one control is lit, and
 * a card beside it says what it does, with Skip on every step.
 *
 * There is one tour per screen (TOURS below): home, and My Account. Each runs
 * the first time that screen is opened after the welcome slides, and never
 * again on that phone, whether it was finished or skipped. Home's starts as
 * the slides close (Onboarding fires TOUR_START_EVENT). "App tour" in the More
 * sheet clears every tour and replays home's.
 *
 * Steps find their target by data-tour="<key>" on the element itself, so the
 * tours do not depend on layout or class names. A step whose target is not
 * on screen is left out — a guest's account tour is shorter than a signed-in
 * customer's — and the dots count only the steps that will be shown.
 */

/** Fired by Onboarding when the slides close, and by "App tour" in More. */
export const TOUR_START_EVENT = 'getmeds:tour-start';

const BRAND = '#1D9FDA';
const GUTTER = 16;
const PAD = 6;

type Step = { key: string; title: [string, string]; body: [string, string] };
type Tour = {
  id: string;
  doneKey: string;
  matches: (path: string) => boolean;
  steps: Step[];
  /** Splits "seen" by what was on screen, e.g. guest vs signed in. */
  variant?: (shown: Step[]) => string;
};

const clean = (path: string) => path.replace(/\.html$/, '').replace(/\/+$/, '').toLowerCase() || '/';

const TOURS: Tour[] = [
  {
    id: 'home',
    doneKey: 'getmeds:toured',
    matches: (p) => ['/', '/app-home', '/index'].includes(clean(p)),
    steps: [
      {
        key: 'search',
        title: ['Find any medicine', 'Hanapin ang kahit anong gamot'],
        body: [
          'Type a brand or generic name to see what we carry.',
          'I-type ang brand o generic na pangalan para makita ang meron kami.',
        ],
      },
      {
        key: 'upload-rx',
        title: ['Send your prescription', 'Ipadala ang reseta mo'],
        body: [
          'Upload a photo of your Rx. Our pharmacists will get back to you with a quote.',
          'Mag-upload ng litrato ng Rx mo. Babalikan ka ng aming pharmacist na may quote.',
        ],
      },
      {
        key: 'pap',
        title: ['Patient Assistance Program', 'Patient Assistance Program'],
        body: [
          'On long-course treatment? See the support programmes that can help with the cost.',
          'Nasa pangmatagalang gamutan? Tingnan ang mga programang makakatulong sa gastos.',
        ],
      },
      {
        key: 'categories',
        title: ['Browse by condition', 'Mag-browse ayon sa kondisyon'],
        body: [
          'Swipe through medicines grouped by condition, from cancer to heart care.',
          'I-swipe ang mga gamot na nakagrupo ayon sa kondisyon, mula cancer hanggang puso.',
        ],
      },
      {
        key: 'chat',
        title: ['Talk to our team', 'Kausapin ang aming team'],
        body: [
          'Questions about a medicine or your request? Chat with us anytime.',
          'May tanong tungkol sa gamot o sa request mo? Mag-chat sa amin anumang oras.',
        ],
      },
      {
        key: 'requests',
        title: ['Your request list', 'Ang iyong request list'],
        body: [
          'Medicines you add land here. Send the list when you are ready and we will prepare a quote.',
          'Dito napupunta ang mga gamot na idinagdag mo. Ipadala ang listahan kapag handa ka na at maghahanda kami ng quote.',
        ],
      },
    ],
  },
  {
    id: 'account',
    doneKey: 'getmeds:toured:account',
    matches: (p) => ['/profile', '/account'].includes(clean(p)),
    // A guest's one-step tour does not use up the signed-in one: after signing
    // up they still get points, invites and the rest on their next visit.
    variant: (shown) => (shown.some((s) => s.key === 'guest') ? ':guest' : ''),
    steps: [
      // A guest sees only this one: everything below needs an account.
      {
        key: 'guest',
        title: ['Create your free account', 'Gumawa ng libreng account'],
        body: [
          'Sign in to keep your details, follow your requests and earn points on every one.',
          'Mag-log in para ma-save ang detalye mo, masundan ang mga request mo at kumita ng points sa bawat isa.',
        ],
      },
      {
        key: 'profile-edit',
        title: ['Edit your profile', 'I-edit ang profile mo'],
        body: [
          'Add your name, photo and details here. The ring around your picture shows how complete your profile is.',
          'Ilagay dito ang pangalan, litrato at detalye mo. Ipinapakita ng bilog sa litrato mo kung gaano kakumpleto ang profile mo.',
        ],
      },
      {
        key: 'profile-stats',
        title: ['Your numbers at a glance', 'Ang mga numero mo'],
        body: [
          'Your points and the friends you have invited. Tap one to jump to it.',
          'Ang points mo at ang mga naimbitahan mong kaibigan. I-tap ang isa para puntahan ito.',
        ],
      },
      {
        key: 'points',
        title: ['Getmeds Points', 'Getmeds Points'],
        body: [
          'You earn points on every request you send from the app. Your balance and history show here.',
          'Kumikita ka ng points sa bawat request na ipinapadala mo mula sa app. Makikita rito ang balance at history mo.',
        ],
      },
      {
        key: 'referral',
        title: ['Invite friends, both earn', 'Mag-imbita, pareho kayong kikita'],
        body: [
          'Share your code. When a friend adds it and sends their first request, you both get points.',
          'Ibahagi ang code mo. Kapag inilagay ito ng kaibigan at nagpadala siya ng unang request, pareho kayong may points.',
        ],
      },
      {
        key: 'account-list',
        title: ['Everything in one place', 'Lahat sa iisang lugar'],
        body: [
          'Your details, patients, delivery addresses and prescription wallet live here, ready for your next request.',
          'Nandito ang detalye mo, mga pasyente, delivery address at wallet ng reseta, handa para sa susunod mong request.',
        ],
      },
    ],
  },
];

const read = (k: string) => {
  try { return window.localStorage.getItem(k); } catch { return '1'; }
};
const isDone = (key: string) => read(key) === '1';
const markDone = (key: string) => {
  try { window.localStorage.setItem(key, '1'); } catch { /* nothing to keep it in */ }
};
const onboarded = () => read('getmeds:onboarded') === '1';

/** Clears every tour's "seen" flag and starts home's again (the More sheet's "App tour"). */
export function replayTour() {
  try {
    TOURS.forEach((t) => {
      window.localStorage.removeItem(t.doneKey);
      window.localStorage.removeItem(`${t.doneKey}:guest`);
    });
  } catch { /* ignore */ }
  window.dispatchEvent(new Event(TOUR_START_EVENT));
}

type Box = { top: number; left: number; width: number; height: number; radius: number };

const targetOf = (key: string) => document.querySelector<HTMLElement>(`[data-tour="${key}"]`);

const visible = (el: HTMLElement | null) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
};

export default function GuidedTour() {
  const { tr } = useLang();
  const path = usePathname() || '/';
  const [tour, setTour] = useState<Tour | null>(null);
  const [doneKey, setDoneKey] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [card, setCard] = useState({ top: 0, left: 0, arrowX: 0, below: true, ready: false });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const active = !!tour && steps.length > 0;

  // Start: on a screen with a tour, after onboarding, once. It waits for the
  // screen's content (account data arrives after the page) and then keeps
  // only the steps whose targets are there.
  useEffect(() => {
    const t = TOURS.find((x) => x.matches(path));
    if (!t) return;
    let timer = 0;
    let tries = 0;
    const settle = () => {
      if (!t.matches(window.location.pathname)) return;
      const found = t.steps.filter((s) => visible(targetOf(s.key)));
      // Give late content a moment: up to ~3s for the screen to fill in.
      if ((found.length < t.steps.length && tries < 10) || found.length === 0) {
        if (tries++ < 10) timer = window.setTimeout(settle, 300);
        return;
      }
      const key = t.doneKey + (t.variant ? t.variant(found) : '');
      if (isDone(key)) return;
      setDoneKey(key);
      setSteps(found);
      setI(0);
      setTour(t);
    };
    const begin = () => {
      if (!t.variant && isDone(t.doneKey)) return;
      window.clearTimeout(timer);
      tries = 0;
      timer = window.setTimeout(settle, 700);
    };
    if (onboarded()) begin();
    window.addEventListener(TOUR_START_EVENT, begin);
    return () => { window.removeEventListener(TOUR_START_EVENT, begin); window.clearTimeout(timer); };
  }, [path]);

  // Leaving the screen ends its tour without marking it seen; it resumes next time.
  useEffect(() => {
    if (tour && !tour.matches(path)) { setTour(null); setSteps([]); setBox(null); }
  }, [path, tour]);

  const end = useCallback(() => {
    if (doneKey) markDone(doneKey);
    setTour(null);
    setSteps([]);
    setBox(null);
  }, [doneKey]);

  const measure = useCallback(() => {
    const el = steps[i] && targetOf(steps[i].key);
    if (!el || !visible(el)) return null;
    const r = el.getBoundingClientRect();
    const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 12;
    return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2, radius: radius + PAD };
  }, [steps, i]);

  // Point at step i, scrolling it into view unless it lives in a fixed bar.
  useEffect(() => {
    if (!active) return;
    const el = targetOf(steps[i].key);
    if (!visible(el)) {
      if (i < steps.length - 1) setI(i + 1); else end();
      return;
    }
    let fixed = false;
    for (let p: HTMLElement | null = el!; p; p = p.parentElement) {
      if (getComputedStyle(p).position === 'fixed') { fixed = true; break; }
    }
    if (!fixed) {
      const r = el!.getBoundingClientRect();
      // Room above for the sticky search bar, and below for the card.
      const y = window.scrollY + r.top - Math.max(90, (window.innerHeight - r.height) / 2 - 80);
      window.scrollTo({ top: Math.max(0, y), behavior: 'instant' as ScrollBehavior });
    }
    setCard((c) => ({ ...c, ready: false }));
    const id = requestAnimationFrame(() => setBox(measure()));
    return () => cancelAnimationFrame(id);
  }, [active, i, steps, measure, end]);

  // Follow the target if the screen changes size or scrolls.
  useEffect(() => {
    if (!active) return;
    const re = () => setBox(measure());
    window.addEventListener('resize', re);
    window.addEventListener('scroll', re, { passive: true });
    return () => { window.removeEventListener('resize', re); window.removeEventListener('scroll', re); };
  }, [active, measure]);

  // Card under the target, or over it when there is no room below.
  useLayoutEffect(() => {
    if (!active || !box || !cardRef.current) return;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const c = cardRef.current.getBoundingClientRect();
    const below = box.top + box.height + 14 + c.height <= vh - GUTTER;
    const top = below ? box.top + box.height + 14 : Math.max(GUTTER, box.top - 14 - c.height);
    const cx = box.left + box.width / 2;
    const left = Math.min(Math.max(cx - c.width / 2, GUTTER), vw - GUTTER - c.width);
    const arrowX = Math.min(Math.max(cx - left, 22), c.width - 22);
    setCard({ top, left, arrowX, below, ready: true });
  }, [active, box, i]);

  // While it is up: no scrolling underneath, Escape skips.
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') end(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [active, end]);

  useEffect(() => { if (active && card.ready) nextRef.current?.focus({ preventScroll: true }); }, [active, card.ready, i]);

  if (!active || !box) return null;

  const step = steps[i];
  const last = i === steps.length - 1;
  const next = () => (last ? end() : setI(i + 1));

  return (
    <div className="fixed inset-0 z-[10090]" role="dialog" aria-modal="true" aria-label={tr('App tour', 'Tour ng app')}>
      <style>{`
        .gm-tour-move{transition:top .32s ease,left .32s ease,width .32s ease,height .32s ease,border-radius .32s ease,opacity .2s ease}
        @keyframes gmTourPulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,.55)}100%{box-shadow:0 0 0 12px rgba(255,255,255,0)}}
        .gm-tour-ring{animation:gmTourPulse 1.6s ease-out infinite}
        @media (prefers-reduced-motion: reduce){.gm-tour-move{transition:none}.gm-tour-ring{animation:none}}
      `}</style>

      {/* Catches taps everywhere, so the lit control is shown, not pressed. */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      {/* The lit cut-out: one huge shadow dims everything around it. */}
      <div
        aria-hidden="true"
        className="gm-tour-move pointer-events-none fixed"
        style={{
          top: box.top, left: box.left, width: box.width, height: box.height, borderRadius: box.radius,
          boxShadow: '0 0 0 4px #FFFFFF, 0 0 0 9999px rgba(15,23,42,.58)',
        }}
      >
        <span className="gm-tour-ring absolute inset-0" style={{ borderRadius: box.radius }} />
      </div>

      <div
        ref={cardRef}
        className="gm-tour-move fixed rounded-[20px] bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,.25)]"
        style={{ top: card.top, left: card.left, width: `min(340px, calc(100vw - ${GUTTER * 2}px))`, opacity: card.ready ? 1 : 0 }}
        aria-live="polite"
      >
        {/* Pointer to the lit control. */}
        <span
          aria-hidden="true"
          className="absolute h-3.5 w-3.5 rotate-45 bg-white"
          style={card.below ? { top: -7, left: card.arrowX - 7 } : { bottom: -7, left: card.arrowX - 7 }}
        />
        <p className="text-[16px] font-semibold leading-snug text-gray-900">{tr(...step.title)}</p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-gray-500">{tr(...step.body)}</p>

        <div className="mt-4 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1.5" aria-label={tr(`Step ${i + 1} of ${steps.length}`, `Hakbang ${i + 1} sa ${steps.length}`)}>
            {steps.length > 1 && steps.map((s, k) => (
              <span
                key={s.key}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{ width: k === i ? 20 : 6, background: k === i ? BRAND : '#D7DEE7' }}
              />
            ))}
          </div>
          {!last && (
            <button type="button" onClick={end} className="px-3 py-2 text-[13.5px] font-semibold text-gray-500">
              {tr('Skip', 'Laktawan')}
            </button>
          )}
          <button
            ref={nextRef}
            type="button"
            onClick={next}
            className="rounded-full px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_6px_16px_rgba(29,159,218,.35)]"
            style={{ background: BRAND }}
          >
            {last ? tr('Got it', 'Sige') : tr('Next', 'Susunod')}
          </button>
        </div>
      </div>
    </div>
  );
}
