'use client';

import ProductName from '@/lib/ProductName';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useProducts } from '@/lib/useSanity';
import { AddToCart } from '@/lib/AddToCart';
import { CART_CHANGED_EVENT, countCart } from '@/lib/cart';
import { ACCOUNT_CHANGED_EVENT, loadDetails, type SavedDetails } from '@/lib/accountStore';
import { usePoints } from '@/lib/PointsCard';
import { CategoryCard, useCatalogueCategories } from '@/lib/CategoryCard';
import { typeByValue } from '@/lib/audienceTypes';
import { useLang } from '@/lib/i18n';
import { HealthArticles, QuickActions } from './HomeSections';
import {
  CatalogueRow,
  cartItemFor,
  displayName,
  productImage,
  productUrl,
  rxRequired,
  specLine,
} from '@/lib/catalogueItem';

/**
 * app-home.tsx
 * ─────────────────────────────────────────────
 * The installed app's home screen. Deliberately NOT the website's homepage:
 * that page is a marketing story — hero carousel, statistics, CSR — which is
 * the right thing for a first-time visitor arriving from search, and the wrong
 * thing for someone who has installed the app and wants the catalogue.
 *
 * So this is catalogue-first: a way into search, the categories, featured
 * products, and the errand most people actually arrive with.
 *
 * ── On the visual language ──
 * Laid out as a native storefront rather than a web page: a tinted ground with
 * white cards floating on it, a pill search bar, circular category tiles and a
 * two-up product grid. The tint is what does the work — on a flat white page a
 * white card is invisible, so every section needs a border to exist, and a
 * screen full of hairline boxes is most of what makes a PWA read as a website
 * in a frame.
 *
 * ── On the search bar ──
 * It is a link, not an input. Searching gets its own screen (see search.tsx)
 * the way it does in an app store, so this bar only has to look like a search
 * bar and hand over. Filtering in place here would mean a second, lesser copy
 * of the search UI competing with the real one.
 *
 * No prices anywhere — see the note in lib/catalogueItem.tsx, which is also
 * where naming, linking and the spec line now live.
 */

/**
 * The tinted ground everything else sits on.
 *
 * Also hard-coded on <body> in app-home.html, which is the copy that actually
 * paints the background — it has to be there to survive the gap before
 * hydration. This constant is for the elements that must colour-match it: the
 * sticky header, which would otherwise show a seam, and the ring around the
 * cart badge, which fakes a cut-out.
 */
const GROUND = '#F3F6FB';
const BRAND = '#1D9FDA';
const BRAND_GREEN = '#61A644';

/**
 * Who the greeting is for, from what is on the device: the saved details win
 * over the sign-in entry, the same order the account screen uses. A signed-in
 * customer's account name fills in below when neither has one.
 */
type Greeted = { name: string; avatar?: string; details: SavedDetails | null };

const readGreeted = async (): Promise<Greeted> => {
  let user: { name?: string; avatar?: string } | null = null;
  try {
    const raw = window.localStorage.getItem('getmeds_user');
    user = raw ? JSON.parse(raw) : null;
  } catch { /* no storage: treat as a guest */ }
  const details = await loadDetails().catch(() => null);
  return {
    name: (details?.name || user?.name || '').trim(),
    avatar: details?.avatar || user?.avatar,
    details,
  };
};

/**
 * Share of "My details" filled in, counted exactly as the account screen's
 * ring counts it, so the two rings always agree.
 */
const detailsCompleteness = (d: SavedDetails | null): number => {
  if (!d) return 0;
  const rec = d as Record<string, unknown>;
  const audience = typeByValue(String(rec.userType ?? ''));
  const keys = ['name', 'phone', 'userType', ...(audience?.fields.filter((f) => f.required).map((f) => f.key) ?? [])];
  const filled = keys.filter((k) => String(rec[k] ?? '').trim() !== '').length;
  return (filled / keys.length) * 100;
};

const AVATAR = 44;
const AVATAR_STROKE = 3;

/** The account shortcut: picture or initial inside the details-completeness ring. */
function AvatarRing({ pct, avatar, initial }: { pct: number; avatar?: string; initial: string }) {
  const r = (AVATAR - AVATAR_STROKE) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative block" style={{ width: AVATAR, height: AVATAR }}>
      <svg width={AVATAR} height={AVATAR} viewBox={`0 0 ${AVATAR} ${AVATAR}`} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id="home-avatar-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={BRAND} />
            <stop offset="100%" stopColor={BRAND_GREEN} />
          </linearGradient>
        </defs>
        <circle cx={AVATAR / 2} cy={AVATAR / 2} r={r} fill="none" stroke="#E7ECF2" strokeWidth={AVATAR_STROKE} />
        {pct > 0 && (
          <circle
            cx={AVATAR / 2}
            cy={AVATAR / 2}
            r={r}
            fill="none"
            stroke="url(#home-avatar-ring)"
            strokeWidth={AVATAR_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${(c * pct) / 100} ${c}`}
          />
        )}
      </svg>
      <span
        className="absolute inset-[5px] flex items-center justify-center overflow-hidden rounded-full text-[14px] font-bold text-white"
        style={{ background: BRAND }}
      >
        {avatar ? (
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        ) : initial ? (
          initial
        ) : (
          <i className="fa-solid fa-user text-[13px]" />
        )}
      </span>
    </span>
  );
}

/**
 * The promo slider at the top of the screen. A slide is either a brand gradient
 * with a big faded icon, or a photo (`image`) with a dark wash so the words stay
 * readable; `imagePosition` is where the photo is anchored when it is cropped to
 * the slide's shape. Order is the order they show in.
 */
type PromoSlide = {
  href: string;
  title: string;
  titleTl: string;
  sub: string;
  subTl: string;
  cta: string;
  ctaTl: string;
  background: string;
  icon?: string;
  image?: string;
  imagePosition?: string;
};

const PROMO_SLIDES: PromoSlide[] = [
  {
    href: '/order-medicines/patients',
    title: 'Have a prescription?',
    titleTl: 'May reseta ka ba?',
    subTl: 'Ipadala ang litrato nito at babalikan ka namin kung available ito.',
    ctaTl: 'I-upload na',
    sub: 'Send us a photo and we\u2019ll come back to you with availability.',
    cta: 'Upload now',
    background: 'linear-gradient(118deg,#1D9FDA 0%,#2F8FD6 52%,#61A644 165%)',
    icon: 'fa-file-prescription',
    image: '/assets/app-promo-contact.webp',
    imagePosition: 'right center',
  },
  {
    href: '/patient-assistance-program',
    title: 'Patient Assistance Program',
    titleTl: 'Patient Assistance Program',
    sub: 'Libreng chemotherapy at gamot sa cancer sa tulong ng DSWD at PCSO.',
    subTl: 'Libreng chemotherapy at gamot sa cancer sa tulong ng DSWD at PCSO.',
    cta: 'Alamin dito',
    ctaTl: 'Alamin dito',
    background: 'linear-gradient(118deg,#0A2A43 0%,#14507A 60%,#1D9FDA 160%)',
    icon: 'fa-hand-holding-medical',
    image: '/assets/app-promo-careers.webp',
    imagePosition: 'right center',
  },
  {
    href: '/product-range',
    title: 'Looking for a medicine?',
    titleTl: 'May hinahanap na gamot?',
    sub: 'Browse specialty medicines from oncology to cardiology, all in one catalogue.',
    subTl: 'Tingnan ang mga specialty na gamot, mula oncology hanggang cardiology, sa iisang catalogue.',
    cta: 'Browse catalogue',
    ctaTl: 'Tingnan ang catalogue',
    background: 'linear-gradient(118deg,#61A644 0%,#4E9C4A 55%,#1D9FDA 165%)',
    icon: 'fa-pills',
    image: '/assets/app-promo-services.webp',
    imagePosition: 'right center',
  },
];

// How long the slider leaves someone alone after they touch it. Long enough to
// read the slide they chose; short enough that the slider does not look broken.
const PROMO_PAUSE_MS = 8000;
const PROMO_INTERVAL_MS = 5000;

/**
 * The featured card, one per row. Image on top the way a storefront card reads,
 * because a medicine box is recognisable at a glance in a way its name often is
 * not — people recognise the packaging of something they have taken for months.
 * Plain white with a hairline border and no shadows; the Rx and In stock
 * pills match the search results.
 */

function ProductCard({ p }: { p: CatalogueRow }) {
  const { tr } = useLang();
  const needsRx = rxRequired(p);
  const inStock = p.availability !== false;
  return (
    <a
      href={productUrl(p)}
      className="group relative block overflow-hidden rounded-[24px] border border-[#EEF1F5] bg-white p-2 transition active:scale-[0.99]"
    >
      <div className="relative h-[200px] overflow-hidden rounded-[18px] bg-white">
        <img
          src={productImage(p)}
          alt=""
          loading="lazy"
          className="relative h-full w-full object-contain p-5 mix-blend-multiply"
          onError={(e) => { const i = e.currentTarget; i.onerror = null; i.src = '/assets/no-image.png'; }}
        />

        {(needsRx || inStock) && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5">
            {needsRx && (
              <span className="rounded-full bg-[#E8F5FC] px-2 py-[2px] text-[9.5px] font-semibold text-[#1D9FDA]">Rx</span>
            )}
            {inStock && (
              <span className="rounded-full bg-[#EEF6EA] px-2 py-[2px] text-[9.5px] font-semibold text-[#4E8F35]">{tr('In stock', 'May stock')}</span>
            )}
          </div>
        )}
      </div>

      <div className="px-2.5 pb-2 pt-3">
        <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-gray-900">
          <ProductName name={displayName(p)} />
        </h3>
        <p className="mt-1 line-clamp-1 text-[12px] text-gray-400">{specLine(p)}</p>

        <div className="mt-3.5 flex items-center gap-2">
          <span
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-[12.5px] font-semibold text-white"
            style={{ background: BRAND }}
          >
            {tr('Inquire', 'Magtanong')}
            <i className="fa-solid fa-arrow-right text-[11px]" />
          </span>
          <AddToCart item={cartItemFor(p)} variant="glass" />
        </div>
      </div>
    </a>
  );
}

function SectionHeading({ title, href, cta }: { title: string; href: string; cta?: string }) {
  const { tr } = useLang();
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-[17px] font-semibold tracking-tight text-gray-900">{title}</h2>
      <a href={href} className="text-[12px] font-semibold" style={{ color: BRAND }}>{cta ?? tr('See all', 'Tingnan lahat')}</a>
    </div>
  );
}

function AppHome() {
  const { tr } = useLang();
  const { data: raw } = useProducts();
  const products = (raw || []) as CatalogueRow[];
  const [cartCount, setCartCount] = useState(0);
  const [greeted, setGreeted] = useState<Greeted>({ name: '', details: null });
  const points = usePoints();

  useEffect(() => {
    document.title = 'Getmeds';

    // The footer the original injected into #footer-container is rendered by
    // the root layout here (and hidden in the installed app by the app CSS).
    // The navbar is deliberately not mounted: the tab bar is this screen's
    // navigation, and the drawer it normally hosts is reachable from "More"
    // on every other page.
  }, []);

  // The header cart badge. Same source of truth as the tab bar's, just read
  // through the typed helper rather than raw IndexedDB, because this screen
  // already bundles cart.ts for AddToCart.
  useEffect(() => {
    const paint = () => { countCart().then(setCartCount).catch(() => setCartCount(0)); };
    paint();
    window.addEventListener(CART_CHANGED_EVENT, paint);
    return () => window.removeEventListener(CART_CHANGED_EVENT, paint);
  }, []);

  useEffect(() => {
    const paint = () => { readGreeted().then(setGreeted); };
    paint();
    window.addEventListener(ACCOUNT_CHANGED_EVENT, paint);
    return () => window.removeEventListener(ACCOUNT_CHANGED_EVENT, paint);
  }, []);
  const fullName = greeted.name || points.summary?.account?.name?.trim() || '';
  const firstName = fullName.split(/\s+/)[0];
  const completeness = Math.round(detailsCompleteness(greeted.details));

  // The promo slider. Native scroll-snap does the swiping, so the state here is
  // only which slide is in view (for the dots) and when the slider was last
  // touched (so autoplay does not yank a slide away from someone reading it).
  const promoRef = useRef<HTMLDivElement>(null);
  const promoTouchedAt = useRef(0);
  const [promoIndex, setPromoIndex] = useState(0);

  const slideInView = (el: HTMLDivElement) => Math.round(el.scrollLeft / el.clientWidth);
  const onPromoScroll = () => { if (promoRef.current) setPromoIndex(slideInView(promoRef.current)); };
  const markPromoTouched = () => { promoTouchedAt.current = Date.now(); };
  const goToPromo = (i: number) => {
    markPromoTouched();
    promoRef.current?.scrollTo({ left: i * promoRef.current.clientWidth, behavior: 'smooth' });
  };

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => {
      const el = promoRef.current;
      if (!el || Date.now() - promoTouchedAt.current < PROMO_PAUSE_MS) return;
      const next = (slideInView(el) + 1) % PROMO_SLIDES.length;
      el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' });
    }, PROMO_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // The strip shows the ten biggest; "See all" opens every one, stacked.
  const categories = useCatalogueCategories(products).slice(0, 10);

  const featured = useMemo(
    () => products.filter((p) => p.availability !== false).slice(0, 6),
    [products]
  );

  return (
    <>
      {/* Brand on the left, the two personal shortcuts on the right — the
          request list and the account. Scrolls away; the search bar below is
          what stays. */}
      <header className="px-4 pt-4" style={{ background: '#FFFFFF' }}>
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <a href="/app-home" aria-label={tr('Getmeds home', 'Home ng Getmeds')} className="shrink-0">
            <img src="/assets/getmeds-logo-sm.png" alt="Getmeds" className="h-[38px] w-auto" />
          </a>

          <div className="flex items-center gap-2.5">
            <a
              href="/cart"
              aria-label={tr(`Request list, ${cartCount} item${cartCount === 1 ? '' : 's'}`, `Request list, ${cartCount} item`)}
              className="relative flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full"
              style={{ background: GROUND }}
            >
              <i className="fa-solid fa-cart-shopping text-[14px] text-gray-700" />
              {cartCount > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-[19px] min-w-[19px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                  style={{ background: BRAND, boxShadow: '0 0 0 2px #FFFFFF' }}
                >
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
            </a>

            <a
              href="/profile"
              aria-label={tr(
                `${fullName ? `My account, ${fullName}` : 'My account'}. Details ${completeness}% complete`,
                `${fullName ? `Aking account, ${fullName}` : 'Aking account'}. ${completeness}% kumpleto ang detalye`,
              )}
              className="shrink-0"
            >
              <AvatarRing pct={completeness} avatar={greeted.avatar} initial={firstName.charAt(0).toUpperCase()} />
            </a>
          </div>
        </div>

        <div className="mx-auto mt-4 max-w-2xl">
          <p className="text-[12.5px] text-gray-500">
            {firstName
              ? tr(`Welcome to Getmeds, ${firstName}`, `Welcome sa Getmeds, ${firstName}`)
              : tr('Welcome to Getmeds', 'Welcome sa Getmeds')}
          </p>
          <h1 className="mt-0.5 text-[21px] font-semibold leading-tight text-gray-900">
            {tr('What medicine are you looking for today?', 'Anong gamot ang hinahanap mo ngayon?')}
          </h1>
        </div>
      </header>

      {/* Sticky because this row is the only way back to the whole catalogue —
          scrolling six product cards deep should not mean scrolling back up to
          look something up. */}
      <div className="sticky top-0 z-40 px-4 pb-3 pt-3" style={{ background: '#FFFFFF' }}>
        <div className="relative mx-auto max-w-2xl">
          {/* The camera is a sibling of the search link rather than a child of
              it: one anchor cannot live inside another, and these are two
              genuinely different destinations. */}
          <a
            href="/search"
            className="flex h-[46px] w-full items-center rounded-full pl-11 pr-12 text-[13.5px] text-gray-400"
            style={{ background: GROUND }}
          >
            {tr('Search medicine', 'Maghanap ng gamot')}
          </a>
          <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-gray-400" />
          {/* A visual-search shortcut in spirit: there is no image search to
              point it at, but there is something better — photograph the
              prescription and let a person read it. */}
          <a
            href="/order-medicines/patients"
            aria-label={tr('Send a photo of your prescription', 'Magpadala ng litrato ng reseta mo')}
            title={tr('Send a photo of your prescription', 'Magpadala ng litrato ng reseta mo')}
            className="absolute right-1.5 top-1/2 flex h-[36px] w-[36px] -translate-y-1/2 items-center justify-center rounded-full bg-white"
          >
            <i className="fa-solid fa-camera text-[13px]" style={{ color: BRAND }} />
          </a>
        </div>
      </div>

      <main className="mx-auto max-w-2xl px-4 pb-2">
        {/* A storefront puts an offer in this slot. The first slide is the errand
            people actually arrive with, because the app's whole job is turning a
            prescription into a quote; the two behind it are the next most-asked-for
            things. Swipeable, and it advances on its own until someone touches it. */}
        <div className="mb-6 mt-4">
          <div
            ref={promoRef}
            onScroll={onPromoScroll}
            onPointerDown={markPromoTouched}
            className="gm-hscroll flex snap-x snap-mandatory overflow-x-auto rounded-[20px]"
            aria-roledescription="carousel"
          >
            {PROMO_SLIDES.map((slide, i) => (
              <a
                key={slide.href}
                href={slide.href}
                className="relative block min-h-[156px] w-full shrink-0 snap-start overflow-hidden rounded-[20px] p-5 text-white"
                style={{ background: slide.background }}
                aria-label={`${tr(slide.title, slide.titleTl)} ${tr(slide.sub, slide.subTl)}`}
              >
                {slide.image ? (
                  <>
                    <img
                      src={slide.image}
                      alt=""
                      loading={i === 0 ? 'eager' : 'lazy'}
                      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                      style={{ objectPosition: slide.imagePosition }}
                    />
                    {/* Dark on the left, where the words are, clear on the right. */}
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0"
                      style={{ background: 'linear-gradient(90deg, rgba(10,42,67,.9) 0%, rgba(10,42,67,.6) 55%, rgba(10,42,67,.15) 100%)' }}
                    />
                  </>
                ) : (
                  <>
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10"
                    />
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute -bottom-16 right-10 h-32 w-32 rounded-full bg-white/[0.07]"
                    />
                    <i
                      aria-hidden="true"
                      className={`fa-solid ${slide.icon} pointer-events-none absolute -right-1 bottom-1 text-[86px] text-white/20`}
                    />
                  </>
                )}
                <div className="relative max-w-[64%]">
                  <p className="text-[16.5px] font-medium leading-tight">{tr(slide.title, slide.titleTl)}</p>
                  <p className="mt-1 text-[11.5px] leading-snug text-white/85">{tr(slide.sub, slide.subTl)}</p>
                  <span
                    className="mt-3 inline-flex items-center rounded-full px-3.5 py-1.5 text-[11px] font-medium text-white"
                    style={{ background: BRAND }}
                  >
                    {tr(slide.cta, slide.ctaTl)}
                  </span>
                </div>
              </a>
            ))}
          </div>

          <div className="mt-2.5 flex justify-center gap-1.5" role="tablist" aria-label={tr('Slides', 'Mga slide')}>
            {PROMO_SLIDES.map((slide, i) => (
              <button
                key={slide.href}
                type="button"
                role="tab"
                aria-selected={i === promoIndex}
                aria-label={tr(
                  `Slide ${i + 1} of ${PROMO_SLIDES.length}: ${slide.title}`,
                  `Slide ${i + 1} sa ${PROMO_SLIDES.length}: ${slide.titleTl}`,
                )}
                onClick={() => goToPromo(i)}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{ width: i === promoIndex ? 18 : 6, background: i === promoIndex ? BRAND : '#C9D3E0' }}
              />
            ))}
          </div>
        </div>

        <QuickActions />

        <section className="mb-6">
          <SectionHeading title={tr('Categories', 'Mga Kategorya')} href="/categories" />
          {categories.length === 0 ? (
            <div className="gm-hscroll -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-[178px] w-[78%] shrink-0 animate-pulse rounded-[22px] bg-white" />
              ))}
            </div>
          ) : (
            // Horizontal, not a grid: the folder list grows as the catalogue
            // does, and a scroll strip absorbs that without pushing the
            // products below the fold. Cards are narrower than the screen so
            // the next one peeks in and says "swipe".
            <div className="gm-hscroll -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1">
              {categories.map(([folder, info], i) => (
                <CategoryCard key={folder} folder={folder} info={info} index={i} className="w-[78%] shrink-0 snap-start" />
              ))}
            </div>
          )}
        </section>

        <section className="mb-6">
          <SectionHeading title={tr('Featured products', 'Mga tampok na produkto')} href="/product-range" cta={tr('Browse all', 'Tingnan lahat')} />
          {featured.length === 0 ? (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-[320px] animate-pulse rounded-[24px] bg-white" />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {featured.map((p, i) => <ProductCard key={p._id || i} p={p} />)}
            </div>
          )}
        </section>

        <HealthArticles />

        <p className="mb-2 text-center text-[11px] leading-relaxed text-gray-400">
          {tr(
            'Prescription medicines are dispensed only against a valid prescription from a licensed physician.',
            'Ang mga gamot na may reseta ay ibinibigay lamang kapag may valid na reseta mula sa lisensyadong doktor.',
          )}
        </p>
      </main>

    </>
  );
}

/** The app's home screen. */
export default function AppHomeClient() {
  return <AppHome />;
}
