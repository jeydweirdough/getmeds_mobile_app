'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useProducts } from '@/lib/useSanity';
import { AddToCart } from '@/lib/AddToCart';
import { CART_CHANGED_EVENT, countCart } from '@/lib/cart';
import {
  CatalogueRow,
  cartItemFor,
  displayName,
  prettyFolder,
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
const CARD_SHADOW = '0 2px 10px rgba(23,43,77,.055)';

/**
 * The promo slider at the top of the screen. A slide is either a brand gradient
 * with a big faded icon, or a photo (`image`) with a dark wash so the words stay
 * readable; `imagePosition` is where the photo is anchored when it is cropped to
 * the slide's shape. Order is the order they show in.
 */
type PromoSlide = {
  href: string;
  title: string;
  sub: string;
  cta: string;
  background: string;
  icon?: string;
  image?: string;
  imagePosition?: string;
};

const PROMO_SLIDES: PromoSlide[] = [
  {
    href: '/order-medicines/patients',
    title: 'Have a prescription?',
    sub: 'Send us a photo and we\u2019ll come back to you with availability.',
    cta: 'Upload now',
    background: 'linear-gradient(118deg,#1D9FDA 0%,#2F8FD6 52%,#61A644 165%)',
    icon: 'fa-file-prescription',
  },
  {
    href: '/patient-assistance-program',
    title: 'Patient Assistance Program',
    sub: 'Libreng chemotherapy at gamot sa cancer sa tulong ng DSWD at PCSO.',
    cta: 'Alamin dito',
    background: '#0A2A43',
    image: '/assets/app-promo-pap.jpg',
    imagePosition: 'center 30%',
  },
  {
    href: '/product-range',
    title: 'Looking for a medicine?',
    sub: 'Browse specialty medicines from oncology to cardiology, all in one catalogue.',
    cta: 'Browse catalogue',
    background: 'linear-gradient(118deg,#61A644 0%,#4E9C4A 55%,#1D9FDA 165%)',
    icon: 'fa-pills',
  },
];

// How long the slider leaves someone alone after they touch it. Long enough to
// read the slide they chose; short enough that the slider does not look broken.
const PROMO_PAUSE_MS = 8000;
const PROMO_INTERVAL_MS = 5000;

const FOLDER_ICON: Record<string, string> = {
  'cancer-medicines': 'fa-ribbon',
  'blood-disorder-medicines': 'fa-droplet',
  'antibiotics': 'fa-shield-virus',
  'heart-medicines': 'fa-heart-pulse',
  'anemia-medicines': 'fa-droplet',
  'diabetes-medicines': 'fa-syringe',
  'bone-health-medicines': 'fa-bone',
  'allergy-medicines': 'fa-hand-dots',
  'pain-management': 'fa-pills',
  'kidney-medicines': 'fa-kit-medical',
  'brain-cancer-medicines': 'fa-brain',
  'hormonal-therapy': 'fa-flask',
  'contrast-media': 'fa-x-ray',
  'anti-inflammatory-medicines': 'fa-fire',
};

/**
 * The two-up grid card. Image on top the way a storefront card reads, because
 * a medicine box is recognisable at a glance in a way its name often is not —
 * people recognise the packaging of something they have taken for months.
 */
function ProductCard({ p }: { p: CatalogueRow }) {
  const needsRx = rxRequired(p);
  return (
    <a
      href={productUrl(p)}
      className="group flex flex-col overflow-hidden rounded-[18px] bg-white transition active:scale-[0.985]"
      style={{ boxShadow: CARD_SHADOW }}
    >
      <div className="relative aspect-square w-full bg-[#F6F8FC] p-3">
        <img
          src={productImage(p)}
          alt=""
          loading="lazy"
          className="h-full w-full object-contain mix-blend-multiply"
          onError={(e) => { const i = e.currentTarget; i.onerror = null; i.src = '/assets/no-image.png'; }}
        />
      </div>

      <div className="flex flex-1 flex-col p-3 pt-2.5">
        <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-gray-900">
          {displayName(p)}
        </h3>
        <p className="mt-1 line-clamp-1 text-[11px] text-gray-400">{specLine(p)}</p>

        <div className="mt-auto pt-2.5">
          {(needsRx || p.availability !== false) && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {needsRx && (
                <span
                  className="rounded-full px-2 py-[3px] text-[9.5px] font-medium uppercase tracking-wide text-white"
                  style={{ background: BRAND }}
                >
                  Rx
                </span>
              )}
              {p.availability !== false && (
                <span
                  className="rounded-full px-2 py-[3px] text-[9.5px] font-medium text-white"
                  style={{ background: BRAND_GREEN }}
                >
                  In stock
                </span>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] font-semibold" style={{ color: BRAND }}>
              Inquire
            </span>
            <AddToCart item={cartItemFor(p)} />
          </div>
        </div>
      </div>
    </a>
  );
}

function SectionHeading({ title, href, cta = 'See all' }: { title: string; href: string; cta?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-[17px] font-semibold tracking-tight text-gray-900">{title}</h2>
      <a href={href} className="text-[12px] font-semibold" style={{ color: BRAND }}>{cta}</a>
    </div>
  );
}

function AppHome() {
  const { data: raw } = useProducts();
  const products = (raw || []) as CatalogueRow[];
  const [cartCount, setCartCount] = useState(0);

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

  // Each tile borrows the first real photo in its folder, so the strip reads as
  // a catalogue rather than a list of icons. Folders whose products have no
  // image attached yet fall back to the icon.
  const categories = useMemo(() => {
    const acc = new Map<string, { count: number; image?: string }>();
    for (const p of products) {
      const f = (p.categoryFolder || '').trim();
      if (!f) continue;
      const cur = acc.get(f) || { count: 0 };
      cur.count += 1;
      if (!cur.image && p.image && p.image.asset) cur.image = productImage(p, 120);
      acc.set(f, cur);
    }
    return [...acc.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10);
  }, [products]);

  const featured = useMemo(
    () => products.filter((p) => p.availability !== false).slice(0, 6),
    [products]
  );

  return (
    <>
      {/* Sticky because this row is the only way back to the whole catalogue —
          scrolling six product cards deep should not mean scrolling back up to
          look something up. */}
      <header
        className="sticky top-0 z-40 px-4 pb-3 pt-4"
        style={{ background: '#FFFFFF' }}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-2.5">
          {/* The camera is a sibling of the search link rather than a child of
              it: one anchor cannot live inside another, and these are two
              genuinely different destinations. */}
          <div className="relative flex-1">
            <a
              href="/search"
              className="flex h-[46px] w-full items-center rounded-full pl-11 pr-12 text-[13.5px] text-gray-400"
              style={{ background: GROUND }}
            >
              Search medicine
            </a>
            <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-gray-400" />
            {/* A visual-search shortcut in spirit: there is no image search to
                point it at, but there is something better — photograph the
                prescription and let a person read it. */}
            <a
              href="/order-medicines/patients"
              aria-label="Send a photo of your prescription"
              title="Send a photo of your prescription"
              className="absolute right-1.5 top-1/2 flex h-[36px] w-[36px] -translate-y-1/2 items-center justify-center rounded-full bg-white"
            >
              <i className="fa-solid fa-camera text-[13px]" style={{ color: BRAND }} />
            </a>
          </div>

          <a
            href="/cart"
            aria-label={`Request list, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
            className="relative flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full"
            style={{ background: GROUND }}
          >
            <i className="fa-solid fa-cart-shopping text-[15px] text-gray-700" />
            {cartCount > 0 && (
              <span
                className="absolute -right-0.5 -top-0.5 flex h-[19px] min-w-[19px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                style={{ background: BRAND, boxShadow: '0 0 0 2px #FFFFFF' }}
              >
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </a>
        </div>
      </header>

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
                aria-label={`${slide.title} ${slide.sub}`}
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
                  <p className="text-[19px] font-medium leading-tight">{slide.title}</p>
                  <p className="mt-1.5 text-[12.5px] leading-snug text-white/85">{slide.sub}</p>
                  <span
                    className="mt-3.5 inline-flex items-center rounded-full bg-white px-4 py-2 text-[12px] font-medium"
                    style={{ color: BRAND }}
                  >
                    {slide.cta}
                  </span>
                </div>
              </a>
            ))}
          </div>

          <div className="mt-2.5 flex justify-center gap-1.5" role="tablist" aria-label="Slides">
            {PROMO_SLIDES.map((slide, i) => (
              <button
                key={slide.href}
                type="button"
                role="tab"
                aria-selected={i === promoIndex}
                aria-label={`Slide ${i + 1} of ${PROMO_SLIDES.length}: ${slide.title}`}
                onClick={() => goToPromo(i)}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{ width: i === promoIndex ? 18 : 6, background: i === promoIndex ? BRAND : '#C9D3E0' }}
              />
            ))}
          </div>
        </div>

        <section className="mb-6">
          <SectionHeading title="Categories" href="/product-range" />
          {categories.length === 0 ? (
            <div className="gm-hscroll flex gap-4 overflow-x-auto pb-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="shrink-0">
                  <div className="h-[62px] w-[62px] animate-pulse rounded-full bg-white" />
                  <div className="mx-auto mt-2 h-2 w-12 animate-pulse rounded-full bg-white" />
                </div>
              ))}
            </div>
          ) : (
            // Horizontal, not a grid: the folder list grows as the catalogue
            // does, and a scroll strip absorbs that without pushing the
            // products below the fold.
            <div className="gm-hscroll -mx-4 flex gap-4 overflow-x-auto px-4 pb-1">
              {categories.map(([folder, info]) => (
                <a key={folder} href={`/${folder}`} className="flex w-[68px] shrink-0 flex-col items-center gap-2">
                  <span
                    className="flex h-[62px] w-[62px] items-center justify-center overflow-hidden rounded-full bg-white"
                    style={{ boxShadow: CARD_SHADOW }}
                  >
                    {info.image ? (
                      <img
                        src={info.image}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-contain p-2.5 mix-blend-multiply"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <i className={`fa-solid ${FOLDER_ICON[folder] || 'fa-pills'} text-[19px]`} style={{ color: BRAND }} />
                    )}
                  </span>
                  <span className="text-center text-[10px] font-semibold leading-tight text-gray-600">
                    {prettyFolder(folder).replace(' Medicines', '')}
                  </span>
                </a>
              ))}
            </div>
          )}
        </section>

        <section className="mb-6">
          <SectionHeading title="Featured products" href="/product-range" cta="Browse all" />
          {featured.length === 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[230px] animate-pulse rounded-[18px] bg-white" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {featured.map((p, i) => <ProductCard key={p._id || i} p={p} />)}
            </div>
          )}
        </section>

        {/* Below the catalogue rather than above it: a real programme people
            come looking for, but not what most sessions are for.

            The programme's own logo rather than a generic icon — it is a
            named thing with its own identity that people are told to ask for
            by name, and the mark is what they will have been shown. It also
            carries the words "Patient Assistance Program" itself, so a
            separate heading would only say it twice; the name lives in alt
            text instead, where a screen reader still reads it out. */}
        <a
          href="/patient-assistance-program"
          className="mb-5 flex items-center gap-3.5 rounded-[18px] bg-white p-4"
          style={{ boxShadow: CARD_SHADOW }}
        >
          <img
            src="/assets/pap-logo-sm.png"
            alt="Patient Assistance Program"
            loading="lazy"
            width={400}
            height={183}
            className="h-[46px] w-auto shrink-0"
          />
          <span className="min-w-0 flex-1 text-[11.5px] leading-snug text-gray-500">
            Support programmes for long-course treatment
          </span>
          <i className="fa-solid fa-chevron-right shrink-0 text-[12px] text-gray-300" />
        </a>

        <p className="mb-2 text-center text-[11px] leading-relaxed text-gray-400">
          Prescription medicines are dispensed only against a valid prescription
          from a licensed physician.
        </p>
      </main>

    </>
  );
}

/** The app's home screen. */
export default function AppHomeClient() {
  return <AppHome />;
}
