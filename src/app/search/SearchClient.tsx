'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProducts } from '@/lib/useSanity';
import { hasConsent } from '@/lib/cart';
import {
  CatalogueRow,
  ProductRow,
  displayName,
  prettyFolder,
  productImage,
  productUrl,
  rxRequired,
  specLine,
} from '@/lib/catalogueItem';
import { goBack } from '@/platform/navigation';
import { useLang } from '@/lib/i18n';

/**
 * search.tsx
 * ─────────────────────────────────────────────
 * The installed app's search screen — its own page rather than a filter on the
 * home screen, which is the pattern every app store uses and for the same
 * reason: searching is a whole task, not a widget. It wants the full screen,
 * the keyboard up on arrival, and a back gesture that returns you to where you
 * were instead of dumping you at the top of a home feed.
 *
 * Three states, in the order a search actually happens:
 *
 *   browse    nothing typed yet — recent searches, then the categories, so
 *             there is always somewhere to go from a blank box.
 *   suggest   typing — completions drawn from the catalogue's own vocabulary
 *             (brands, generics, conditions), plus the first few products that
 *             already match, because often the answer is visible before the
 *             query is finished.
 *   results   committed — the full list.
 *
 * The committed query lives in the URL as ?q=, which is what makes the phone's
 * back button behave: back from results returns to the empty box, and back
 * again leaves the screen. Holding it in component state only would have made
 * back exit the search entirely from the middle of a task.
 */

const BRAND = '#1D9FDA';
const CARD_SHADOW = '0 1px 4px rgba(23,43,77,.04)';
/** The search box: a neutral light grey. */
const FIELD = '#F6F7F9';
const RECENTS_KEY = 'getmeds:recent-searches';
const MAX_RECENTS = 8;

/**
 * Where recent searches are kept.
 *
 * What someone searched for in a pharmacy app is health information about them
 * — a list reading "tamoxifen, letrozole, anastrozole" discloses a diagnosis to
 * anyone who picks up the phone. So this follows the same consent the request
 * list already asks for (see cart.ts) rather than inventing a second, quieter
 * rule for the more sensitive data: persist across sessions only where storage
 * was actually agreed to, and otherwise keep the convenience but let it die
 * with the session.
 */
const store = (persistent: boolean): Storage | null => {
  try {
    return persistent ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};

const readRecents = (persistent: boolean): string[] => {
  try {
    const raw = store(persistent)?.getItem(RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string').slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
};

const writeRecents = (persistent: boolean, list: string[]) => {
  try {
    store(persistent)?.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, MAX_RECENTS)));
  } catch {
    // A full or blocked storage must never take the search box down with it.
  }
};

/** Does this row answer the query at all? One rule, used by every mode. */
const matches = (p: CatalogueRow, q: string) =>
  [p.name, p.brandName, p.genericName, p.subCategory, p.categoryFolder]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(q));

/**
 * One card in the Featured Products strip — packshot on top, name and strength
 * under it, the way a store's "trending" shelf reads. Deliberately smaller than
 * the home screen's featured card: here it is a way into a product, not the
 * product's pitch, and several should fit across before the swipe.
 */
function FeaturedCard({ p }: { p: CatalogueRow }) {
  return (
    <a href={productUrl(p)} className="block w-[124px] shrink-0 snap-start transition active:scale-[0.98]">
      <div className="relative h-[124px] overflow-hidden rounded-[14px] bg-[#F6F8FC] p-3">
        <img
          src={productImage(p)}
          alt=""
          loading="lazy"
          className="h-full w-full object-contain mix-blend-multiply"
          onError={(e) => { const i = e.currentTarget; i.onerror = null; i.src = '/assets/no-image.png'; }}
        />
        {rxRequired(p) && (
          <span className="absolute left-2 top-2 rounded-full bg-[#E8F5FC] px-1.5 py-[1px] text-[9px] font-semibold text-[#1D9FDA]">Rx</span>
        )}
      </div>
      <h3 className="mt-2 line-clamp-1 text-[12.5px] font-semibold text-gray-900">{displayName(p)}</h3>
      <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-400">{specLine(p)}</p>
    </a>
  );
}

export default function SearchClient() {
  const { tr } = useLang();
  const { data: raw, loading, error: catalogueError } = useProducts();
  const products = (raw || []) as CatalogueRow[];

  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const [persistent, setPersistent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Boot: adopt ?q= if the screen was opened with one ──────────────────────
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q') || '';
    if (q.trim()) {
      setQuery(q);
      setSubmitted(q.trim());
    } else {
      // Arriving at an empty box means the keyboard should already be up —
      // one tap on the tab bar, not one tap and then another on the field.
      inputRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    let alive = true;
    hasConsent()
      .then((granted) => {
        if (!alive) return;
        setPersistent(granted);
        setRecents(readRecents(granted));
      })
      .catch(() => { if (alive) setRecents(readRecents(false)); });
    return () => { alive = false; };
  }, []);

  // Back/forward move between the box and the results, because the query is in
  // the URL rather than only in state.
  useEffect(() => {
    const onPop = () => {
      const q = new URLSearchParams(window.location.search).get('q') || '';
      setQuery(q);
      setSubmitted(q.trim() ? q.trim() : null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const remember = useCallback((term: string) => {
    setRecents((prev) => {
      const next = [term, ...prev.filter((t) => t.toLowerCase() !== term.toLowerCase())].slice(0, MAX_RECENTS);
      writeRecents(persistent, next);
      return next;
    });
  }, [persistent]);

  const commit = useCallback((term: string) => {
    const t = term.trim();
    if (!t) return;
    setQuery(t);
    setSubmitted(t);
    remember(t);
    inputRef.current?.blur();
    const url = `${window.location.pathname}?q=${encodeURIComponent(t)}`;
    if (submitted === null) window.history.pushState({ q: t }, '', url);
    else window.history.replaceState({ q: t }, '', url);
  }, [remember, submitted]);

  const clearBox = () => {
    setQuery('');
    setSubmitted(null);
    window.history.replaceState({}, '', window.location.pathname);
    inputRef.current?.focus();
  };

  const forgetOne = (term: string) => {
    setRecents((prev) => {
      const next = prev.filter((t) => t !== term);
      writeRecents(persistent, next);
      return next;
    });
  };

  const forgetAll = () => {
    setRecents([]);
    writeRecents(persistent, []);
  };

  // ── The catalogue's own vocabulary, which is what completions come from ────
  const vocabulary = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of products) {
      for (const term of [p.brandName, p.genericName, p.subCategory]) {
        const t = String(term || '').trim();
        if (t.length < 2) continue;
        const key = t.toLowerCase();
        if (!seen.has(key)) seen.set(key, t);
      }
    }
    return [...seen.values()];
  }, [products]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 1 || submitted) return [];
    const starts: string[] = [];
    const contains: string[] = [];
    for (const term of vocabulary) {
      const t = term.toLowerCase();
      if (t === q) continue;
      if (t.startsWith(q)) starts.push(term);
      else if (t.includes(q)) contains.push(term);
      if (starts.length >= 8) break;
    }
    // Prefix matches first: someone typing "pacli" means the word that begins
    // that way far more often than one that merely contains it.
    return [...starts, ...contains].slice(0, 6);
  }, [query, vocabulary, submitted]);

  const preview = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2 || submitted) return [];
    return products.filter((p) => matches(p, q)).slice(0, 4);
  }, [query, products, submitted]);

  const results = useMemo(() => {
    if (!submitted) return [];
    const q = submitted.toLowerCase();
    return products.filter((p) => matches(p, q)).slice(0, 60);
  }, [submitted, products]);

  const categories = useMemo(() => {
    const acc = new Map<string, { count: number }>();
    for (const p of products) {
      const f = (p.categoryFolder || '').trim();
      if (!f) continue;
      const cur = acc.get(f) || { count: 0 };
      cur.count += 1;
      acc.set(f, cur);
    }
    return [...acc.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 12);
  }, [products]);

  // In-stock rows, pictured ones first: the strip is a row of packshots, and a
  // run of placeholder boxes at the front of it reads as broken, not featured.
  const featured = useMemo(() => {
    const inStock = products.filter((p) => p.availability !== false);
    const pictured = inStock.filter((p) => p.image?.asset);
    return [...pictured, ...inStock.filter((p) => !p.image?.asset)].slice(0, 10);
  }, [products]);

  const showBrowse = !submitted && query.trim().length === 0;
  const showSuggest = !submitted && query.trim().length > 0;

  return (
    <>
      <style>{`
        /* The clear button the browser draws inside type="search" sits on top
           of ours and cannot be styled to match, so it goes. */
        input[type="search"]::-webkit-search-decoration,
        input[type="search"]::-webkit-search-cancel-button { -webkit-appearance: none; appearance: none; }
        .gm-hscroll { -ms-overflow-style: none; scrollbar-width: none; }
        .gm-hscroll::-webkit-scrollbar { display: none; }
      `}</style>

      <header
        data-page="search"
        className="sticky top-0 z-40 px-3 pb-3 pt-3"
        style={{ background: '#FFFFFF' }}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <button
            type="button"
            aria-label={tr('Back', 'Bumalik')}
            onClick={() => {
              // From results, back returns to the empty box — the same thing
              // the hardware back gesture does, so the two never disagree.
              if (submitted) { window.history.back(); return; }
              goBack('/app-home');
            }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-700"
          >
            <i className="fa-solid fa-arrow-left text-[15px]" />
          </button>

          <form
            className="relative flex-1"
            onSubmit={(e) => { e.preventDefault(); commit(query); }}
          >
            <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[13px] text-gray-400" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                // Editing after a search returns to suggestions, the way an
                // app store does — the old result list under a changed query
                // is just stale.
                if (submitted) setSubmitted(null);
              }}
              enterKeyHint="search"
              autoComplete="off"
              placeholder={tr('Search brand, generic or condition', 'Maghanap ng brand, generic o kondisyon')}
              aria-label={tr('Search the catalogue', 'Maghanap sa catalogue')}
              className="h-[46px] w-full rounded-full border border-transparent pl-11 pr-11 text-[13.5px] text-gray-800 outline-none placeholder:text-gray-400 focus:border-[#1D9FDA]"
              style={{ background: FIELD }}
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={clearBox}
                aria-label={tr('Clear search', 'I-clear ang search')}
                className="absolute right-1.5 top-1/2 flex h-[34px] w-[34px] -translate-y-1/2 items-center justify-center rounded-full text-gray-400"
              >
                <i className="fa-solid fa-xmark text-[14px]" />
              </button>
            )}
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-6">
        {/* ── browse ─────────────────────────────────────────────────────── */}
        {showBrowse && (
          <>
            {recents.length > 0 && (
              <section className="mb-6 pt-2">
                <div className="mb-1 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-[12.5px] font-medium text-gray-400">
                    <i className="fa-solid fa-clock-rotate-left text-[11px]" />
                    {tr('Recent Searches', 'Mga Huling Hinanap')}
                  </h2>
                  <button type="button" onClick={forgetAll} className="text-[11.5px] font-medium" style={{ color: BRAND }}>
                    {tr('Clear all', 'I-clear lahat')}
                  </button>
                </div>
                <ul>
                  {recents.map((term) => (
                    <li key={term} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => commit(term)}
                        className="min-w-0 flex-1 truncate py-2.5 text-left text-[13.5px] text-gray-800"
                      >
                        {term}
                      </button>
                      <button
                        type="button"
                        onClick={() => forgetOne(term)}
                        aria-label={tr(`Remove ${term} from recent searches`, `Alisin ang ${term} sa mga huling hinanap`)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center text-gray-300"
                      >
                        <i className="fa-solid fa-xmark text-[12px]" />
                      </button>
                    </li>
                  ))}
                </ul>
                {!persistent && (
                  <p className="mt-1 text-[10.5px] leading-relaxed text-gray-400">
                    {tr('Kept for this session only. Getmeds does not store what you search.', 'Para lang sa session na ito. Hindi sine-save ng Getmeds ang mga hinahanap mo.')}
                  </p>
                )}
              </section>
            )}

            <section className={recents.length > 0 ? '' : 'pt-2'}>
              <h2 className="mb-3 flex items-center gap-2 text-[12.5px] font-medium text-gray-400">
                <i className="fa-solid fa-arrow-trend-up text-[11px]" />
                {tr('Featured Categories', 'Mga Tampok na Kategorya')}
              </h2>
              {loading && categories.length === 0 ? (
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-[30px] w-24 animate-pulse rounded-lg" style={{ background: FIELD }} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {categories.map(([folder]) => (
                    <a
                      key={folder}
                      href={`/${folder}`}
                      className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-gray-600 transition active:scale-95"
                      style={{ background: '#EEF0F3' }}
                    >
                      {prettyFolder(folder).replace(' Medicines', '')}
                    </a>
                  ))}
                </div>
              )}
            </section>

            {(loading || featured.length > 0) && (
              <section className="mt-6">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-[12.5px] font-medium text-gray-400">
                    <i className="fa-solid fa-star text-[11px]" />
                    {tr('Featured Products', 'Mga Tampok na Produkto')}
                  </h2>
                  <a href="/product-range" className="text-[11.5px] font-medium" style={{ color: BRAND }}>
                    {tr('View all', 'Tingnan lahat')}
                  </a>
                </div>
                {/* Bleeds to the screen edge so the next card peeks in and says "swipe". */}
                <div className="gm-hscroll -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1">
                  {featured.length === 0
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="w-[124px] shrink-0">
                          <div className="h-[124px] animate-pulse rounded-[14px]" style={{ background: FIELD }} />
                          <div className="mt-2 h-3 w-4/5 animate-pulse rounded" style={{ background: FIELD }} />
                          <div className="mt-1.5 h-2.5 w-1/2 animate-pulse rounded" style={{ background: FIELD }} />
                        </div>
                      ))
                    : featured.map((p, i) => <FeaturedCard key={p._id || i} p={p} />)}
                </div>
              </section>
            )}
          </>
        )}

        {/* ── suggest ────────────────────────────────────────────────────── */}
        {showSuggest && (
          <div className="pt-2">
            {suggestions.length > 0 && (
              <div className="mb-4 overflow-hidden rounded-[16px] bg-white" style={{ boxShadow: CARD_SHADOW }}>
                {suggestions.map((term, i) => (
                  <div key={term} className={`flex items-center gap-3 px-3 ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                    <button
                      type="button"
                      onClick={() => commit(term)}
                      className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left"
                    >
                      <i className="fa-solid fa-magnifying-glass shrink-0 text-[12px] text-gray-300" />
                      <span className="truncate text-[13.5px] text-gray-700">{term}</span>
                    </button>
                    {/* Fills the box without searching — the standard way to
                        refine a nearly-right suggestion instead of retyping. */}
                    <button
                      type="button"
                      onClick={() => { setQuery(term); inputRef.current?.focus(); }}
                      aria-label={tr(`Put ${term} in the search box`, `Ilagay ang ${term} sa search box`)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-300"
                    >
                      <i className="fa-solid fa-arrow-up-long -rotate-45 text-[12px]" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {preview.length > 0 && (
              <section>
                <h2 className="mb-2 text-[13px] font-semibold text-gray-900">{tr('Products', 'Mga Produkto')}</h2>
                <div className="space-y-2.5">
                  {preview.map((p, i) => <ProductRow key={p._id || i} p={p} highlight={query.trim()} />)}
                </div>
                <button
                  type="button"
                  onClick={() => commit(query)}
                  className="mt-3 w-full rounded-full bg-white py-3 text-[12.5px] font-semibold"
                  style={{ boxShadow: CARD_SHADOW, color: BRAND }}
                >
                  {tr('See all results for', 'Tingnan lahat ng resulta para sa')} &ldquo;{query.trim()}&rdquo;
                </button>
              </section>
            )}

            {suggestions.length === 0 && preview.length === 0 && !loading && (
              <div className="py-10 text-center">
                <img
                  src="/assets/noproductsfound.png"
                  alt=""
                  loading="lazy"
                  className="mx-auto mb-4 h-auto w-[170px] max-w-full"
                />
                <p className="text-[13px] text-gray-400">
                  {tr('Nothing matches yet. Keep typing, or press search.', 'Wala pang tugma. Ituloy ang pag-type, o pindutin ang search.')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── results ────────────────────────────────────────────────────── */}
        {submitted && (
          <div className="pt-2">
            <p className="mb-3 text-[12.5px] text-gray-500">
              {results.length === 0
                ? tr('No results', 'Walang resulta')
                : tr(
                    `${results.length}${results.length === 60 ? '+' : ''} result${results.length === 1 ? '' : 's'}`,
                    `${results.length}${results.length === 60 ? '+' : ''} resulta`,
                  )}{' '}
              {tr('for', 'para sa')} <span className="font-semibold text-gray-800">&ldquo;{submitted}&rdquo;</span>
            </p>

            {results.length > 0 ? (
              <div className="space-y-2.5">
                {results.map((p, i) => <ProductRow key={p._id || i} p={p} highlight={submitted} />)}
              </div>
            ) : (
              <div className="rounded-[18px] bg-white p-6 text-center" style={{ boxShadow: CARD_SHADOW }}>
                <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#F1F6FC]">
                  <i className="fa-solid fa-magnifying-glass text-[16px]" style={{ color: BRAND }} />
                </span>
                <p className="text-[14px] font-semibold text-gray-900">{tr('Nothing matched that', 'Walang tumugma diyan')}</p>
                <p className="mx-auto mt-1.5 max-w-[280px] text-[12px] leading-relaxed text-gray-500">
                  {tr(
                    'Try the generic name instead of the brand, or check the spelling. If you have a prescription, send us a photo and we will look it up for you.',
                    'Subukan ang generic name sa halip na brand, o i-check ang spelling. Kung may reseta ka, ipadala ang litrato nito at hahanapin namin para sa iyo.',
                  )}
                </p>
                <a
                  href="/order-medicines/patients"
                  className="mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[12.5px] font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg,#1D9FDA,#61A644)' }}
                >
                  <i className="fa-solid fa-camera text-[11px]" /> {tr('Send a prescription', 'Magpadala ng reseta')}
                </a>
              </div>
            )}
          </div>
        )}

        {loading && !submitted && !showSuggest && categories.length === 0 && (
          <p className="py-10 text-center text-[12px] text-gray-400">{tr('Loading the catalogue…', 'Nilo-load ang catalogue…')}</p>
        )}

        {/* The catalogue could not be fetched at all: say so, instead of an empty screen. */}
        {!loading && catalogueError && categories.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-[13px] font-semibold text-gray-800">{tr('We couldn’t load the medicines', 'Hindi namin ma-load ang mga gamot')}</p>
            <p className="mx-auto mt-1 max-w-[260px] text-[12px] leading-relaxed text-gray-500">
              {tr('Check your connection, then try again.', 'I-check ang iyong connection, saka subukan ulit.')}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-full px-5 py-2.5 text-[12.5px] font-semibold text-white"
              style={{ background: 'linear-gradient(135deg,#1D9FDA,#61A644)' }}
            >
              {tr('Try again', 'Subukan ulit')}
            </button>
          </div>
        )}
      </main>
    </>
  );
}
