'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BRAND, Empty, ErrorNote, Screen, SmallButton, Toast, useToast } from '../ui/Screen';
import { newKey, saveList, useAccountData, type SavedArticle } from '../accountApi';
import { call, isSignedIn } from '../rewards';
import { getBlogListingImageUrl } from '../sanity';

/**
 * GuidesScreen.tsx
 * ─────────────────────────────────────────────
 * Health guides: the Getmeds blog, found by condition. Choosing a condition
 * searches the blog (GET /api/blog/posts?search=…) and each article opens on
 * its own page at /blog/<slug>.
 *
 * The conditions are a short curated list rather than the catalogue's
 * condition names: the catalogue has hundreds of narrow ones ("HER2-positive
 * breast cancer"), and most would find no article at all. These are the
 * broad topics the blog actually writes about.
 *
 * Signed-in customers can bookmark articles (savedArticles on their account).
 * Guests can browse everything; the bookmark tells them to sign in.
 */

const CONDITIONS = ['Cancer', 'Anemia', 'Diabetes', 'Heart health', 'Kidney health', 'Bone health', 'Pain', 'Allergies', 'Infections'];

/** The server keeps at most this many saved articles. */
const MAX_SAVED = 100;

interface Article {
  _id: string;
  title: string;
  slug: string;
  date?: string;
  description?: string;
  readTime?: string | number;
  image?: string | { url?: string };
}

type Loaded = { state: 'loading' } | { state: 'error'; message: string } | { state: 'done'; items: Article[] };

const imageOf = (image: Article['image']) => (typeof image === 'string' ? image : image?.url || '');

/** "5 min read", whether the API sends 5, "5" or "5 min read". */
const readTimeText = (t: Article['readTime']) => {
  if (t === undefined || t === null || t === '') return '';
  return /^\d+$/.test(String(t)) ? `${t} min read` : String(t);
};

export default function GuidesScreen({ onClose }: { onClose: () => void }) {
  const signedIn = isSignedIn();
  const { data } = useAccountData();
  const saved = data?.savedArticles ?? [];
  const [tab, setTab] = useState<'browse' | 'saved'>('browse');
  const [condition, setCondition] = useState(CONDITIONS[0]);
  const [results, setResults] = useState<Record<string, Loaded>>({});
  const [note, setNote] = useState('');
  const [toast, showToast] = useToast();
  // Results already fetched, so switching back to a condition is instant.
  const fetched = useRef<Set<string>>(new Set());

  const load = (term: string, force = false) => {
    if (fetched.current.has(term) && !force) return;
    fetched.current.add(term);
    setResults((r) => ({ ...r, [term]: { state: 'loading' } }));
    call<{ items?: Article[] }>(`/blog/posts?search=${encodeURIComponent(term)}&per_page=10`)
      .then((body) => setResults((r) => ({ ...r, [term]: { state: 'done', items: (body.items || []).filter((a) => a.slug) } })))
      .catch((e) => {
        fetched.current.delete(term);
        setResults((r) => ({ ...r, [term]: { state: 'error', message: (e as Error)?.message || 'Could not load guides.' } }));
      });
  };

  useEffect(() => {
    load(condition);
    // load only reads refs and setters, so it does not need to be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condition]);

  const isSaved = (slug: string) => saved.some((s) => s.slug === slug);

  const toggle = async (a: { slug: string; title: string; image?: string }) => {
    if (!signedIn) {
      setNote('Sign in under My account to save guides and read them later on any phone.');
      return;
    }
    if (!data) {
      setNote('Your account is still loading. Try again in a moment.');
      return;
    }
    setNote('');
    const was = isSaved(a.slug);
    if (!was && saved.length >= MAX_SAVED) {
      setNote(`You have ${MAX_SAVED} saved guides, the most we keep. Remove one to save another.`);
      return;
    }
    const next: SavedArticle[] = was
      ? saved.filter((s) => s.slug !== a.slug)
      : [{ _key: newKey(), slug: a.slug, title: a.title, image: a.image || '' }, ...saved];
    try {
      await saveList('savedArticles', next);
      showToast(was ? 'Removed from saved' : 'Saved');
    } catch (e) {
      setNote(`${(e as Error)?.message || 'Could not save.'} Check your connection and try again.`);
    }
  };

  const current = results[condition];

  return (
    <Screen title="Health guides" subtitle="Plain answers about your condition" onClose={onClose}>
      {/* Browse / Saved */}
      <div className="grid grid-cols-2 gap-1 rounded-full bg-white p-1" role="tablist" aria-label="Health guides">
        {(['browse', 'saved'] as const).map((t) => (
          <button
            key={t}
            id={`guides-tab-${t}`}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-full py-2 text-[13px] font-semibold ${tab === t ? 'text-white' : 'text-gray-500'}`}
            style={tab === t ? { background: BRAND } : undefined}
          >
            {t === 'browse' ? 'Browse' : `Saved${signedIn && saved.length ? ` (${saved.length})` : ''}`}
          </button>
        ))}
      </div>

      {note && (
        <p className="flex gap-2 rounded-2xl bg-[#F1F8FE] px-3.5 py-3 text-[12.5px] leading-snug text-gray-600" role="status">
          <i className="fa-solid fa-circle-info mt-[3px] text-[11px]" style={{ color: BRAND }} />
          <span className="flex-1">{note}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNote('')} className="text-gray-400">
            <i className="fa-solid fa-xmark text-[11px]" />
          </button>
        </p>
      )}

      {tab === 'browse' ? (
        <>
          {/* Conditions scroll sideways; the -mx/px pair lets them run to the edge. */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="radiogroup" aria-label="Condition">
            {CONDITIONS.map((c) => {
              const on = c === condition;
              return (
                <button
                  key={c}
                  id={`guides-condition-${c.toLowerCase().replace(/\s+/g, '-')}`}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setCondition(c)}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium ${on ? 'border-transparent text-white' : 'border-[#E7ECF2] bg-white text-gray-600'}`}
                  style={on ? { background: BRAND } : undefined}
                >
                  {c}
                </button>
              );
            })}
          </div>

          {!current || current.state === 'loading' ? (
            <div className="space-y-2.5" aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3 rounded-[20px] border border-[#EEF1F5] bg-white p-3">
                  <div className="h-[72px] w-[72px] shrink-0 animate-pulse rounded-[14px] bg-gray-100" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-3.5 w-11/12 animate-pulse rounded bg-gray-100" />
                    <div className="h-3.5 w-2/3 animate-pulse rounded bg-gray-100" />
                    <div className="h-3 w-1/4 animate-pulse rounded bg-gray-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : current.state === 'error' ? (
            <div className="space-y-3">
              <ErrorNote text={`${current.message} Tap Try again to reload the guides.`} />
              <SmallButton onClick={() => load(condition, true)}>Try again</SmallButton>
            </div>
          ) : current.items.length === 0 ? (
            <Empty
              icon="fa-book-medical"
              title={`No guides on ${condition.toLowerCase()} yet`}
              text="Try another condition, or browse every article on the blog."
              action={<SmallButton onClick={() => { window.location.href = '/blog'; }}>Open the blog</SmallButton>}
            />
          ) : (
            <div className="space-y-2.5">
              {current.items.map((a) => {
                const image = imageOf(a.image);
                return (
                  <ArticleCard
                    key={a._id || a.slug}
                    slug={a.slug}
                    title={a.title}
                    image={image}
                    meta={readTimeText(a.readTime)}
                    saved={signedIn && isSaved(a.slug)}
                    onToggle={() => toggle({ slug: a.slug, title: a.title, image })}
                  />
                );
              })}
            </div>
          )}
        </>
      ) : !signedIn ? (
        <Empty
          icon="fa-bookmark"
          title="Sign in to save guides"
          text="Sign in under My account to bookmark guides and find them again on any phone."
        />
      ) : saved.length === 0 ? (
        <Empty
          icon="fa-bookmark"
          title="No saved guides yet"
          text="Tap the bookmark on any guide to keep it here."
          action={<SmallButton onClick={() => setTab('browse')}>Browse guides</SmallButton>}
        />
      ) : (
        <div className="space-y-2.5">
          {saved.map((s) => (
            <ArticleCard key={s._key} slug={s.slug} title={s.title} image={s.image} saved onToggle={() => toggle(s)} />
          ))}
        </div>
      )}

      <Toast text={toast} />
    </Screen>
  );
}

/** One article: picture, title, read time; the card opens it, the bookmark saves it. */
function ArticleCard({
  slug,
  title,
  image,
  meta,
  saved,
  onToggle,
}: {
  slug: string;
  title: string;
  image?: string;
  meta?: string;
  saved: boolean;
  onToggle: () => void;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="flex items-start gap-1 rounded-[20px] border border-[#EEF1F5] bg-white p-3">
      <a href={`/blog/${encodeURIComponent(slug)}`} className="flex min-w-0 flex-1 gap-3">
        <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#F6F8FC]">
          {image && !broken ? (
            <img
              src={getBlogListingImageUrl(image, 160, 160)}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
              onError={() => setBroken(true)}
            />
          ) : (
            <i className="fa-solid fa-book-medical text-[18px] text-gray-300" />
          )}
        </span>
        <span className="min-w-0 flex-1 py-0.5">
          <span className="line-clamp-3 block text-[13.5px] font-semibold leading-snug text-gray-900">{title}</span>
          {meta && (
            <span className="mt-1 flex items-center gap-1.5 text-[11.5px] text-gray-400">
              <i className="fa-regular fa-clock text-[10px]" />
              {meta}
            </span>
          )}
        </span>
      </a>
      <button
        id={`guide-save-${slug}`}
        type="button"
        onClick={onToggle}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${title} from saved` : `Save ${title}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
      >
        <i className={`${saved ? 'fa-solid' : 'fa-regular'} fa-bookmark text-[15px]`} style={{ color: saved ? BRAND : '#9CA3AF' }} />
      </button>
    </div>
  );
}
