import { useEffect, useState } from 'react';
import { call } from '@/lib/rewards';
import { getBlogListingImageUrl } from '@/lib/sanity';
import { useLang } from '@/lib/i18n';

/**
 * HomeSections.tsx
 * ─────────────────────────────────────────────
 * Two home-screen rows:
 *
 * - QuickActions, under the promo slider: four one-tap shortcuts to the
 *   errands people come for, each a white card like the PAP card (which is
 *   one of them now, rather than sitting at the bottom of the page).
 * - HealthArticles, under the featured products: the latest Getmeds blog
 *   articles (the same source as Health guides) in a left-right slider. Each
 *   opens at /blog/<slug>; "See all" opens Health guides. The row hides
 *   itself if the blog cannot be reached, rather than showing an error on home.
 */

const BRAND = '#1D9FDA';

const CARD_SHADOW = '0 2px 10px rgba(23,43,77,.055)';

type Action = { href: string; title: string; titleTl: string; sub: string; subTl: string } & (
  | { icon: string; logo?: undefined }
  | { logo: string; icon?: undefined }
);

const ACTIONS: Action[] = [
  {
    href: '/order-medicines/patients',
    icon: 'fa-file-prescription',
    title: 'Upload Rx',
    titleTl: 'Mag-upload ng Rx',
    sub: 'Send a photo of your prescription for a quote',
    subTl: 'Magpadala ng litrato ng reseta para sa quote',
  },
  {
    // The programme's own logo rather than an icon: it is a named thing people
    // are told to ask for, and the mark already says "Patient Assistance
    // Program", so the name lives in alt text instead of a heading.
    href: '/patient-assistance-program',
    logo: '/assets/pap-logo-sm.png',
    title: 'Patient Assistance Program',
    titleTl: 'Patient Assistance Program',
    sub: 'Support programmes for long-course treatment',
    subTl: 'Tulong para sa pangmatagalang gamutan',
  },
  {
    href: '/chat',
    icon: 'fa-comment-medical',
    title: 'Chat with us',
    titleTl: 'Mag-chat sa amin',
    sub: 'Ask our team about a medicine or your request',
    subTl: 'Magtanong sa team tungkol sa gamot o request mo',
  },
  {
    href: '/profile#guides',
    icon: 'fa-book-medical',
    title: 'Health guides',
    titleTl: 'Mga gabay sa kalusugan',
    sub: 'Articles on conditions and treatments',
    subTl: 'Mga artikulo tungkol sa sakit at gamutan',
  },
];

/** Each action is a white card in the style of the PAP card: mark, words, chevron. */
export function QuickActions() {
  const { tr } = useLang();
  return (
    <nav className="mb-6 flex flex-col gap-2.5" aria-label={tr('Quick actions', 'Mabilisang aksyon')}>
      {ACTIONS.map((a) => (
        <a
          key={a.href}
          href={a.href}
          className="flex items-center gap-3.5 rounded-[18px] bg-white p-4 transition active:scale-[0.99]"
          style={{ boxShadow: CARD_SHADOW }}
        >
          {a.logo ? (
            <img src={a.logo} alt={a.title} width={400} height={183} className="h-[46px] w-auto shrink-0" />
          ) : (
            <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px] bg-[#EAF5FC]">
              <i className={`fa-solid ${a.icon} text-[17px]`} style={{ color: BRAND }} />
            </span>
          )}
          <span className="min-w-0 flex-1">
            {!a.logo && <span className="block text-[13.5px] font-medium leading-tight text-gray-900">{tr(a.title, a.titleTl)}</span>}
            <span className={`block text-[11.5px] leading-snug text-gray-500 ${a.logo ? '' : 'mt-0.5'}`}>{tr(a.sub, a.subTl)}</span>
          </span>
          <i className="fa-solid fa-chevron-right shrink-0 text-[12px] text-gray-300" />
        </a>
      ))}
    </nav>
  );
}

interface Article {
  _id: string;
  title: string;
  slug: string;
  readTime?: string | number;
  image?: string | { url?: string };
}

const imageOf = (image: Article['image']) => (typeof image === 'string' ? image : image?.url || '');

function ArticleSlide({ a }: { a: Article }) {
  const { tr } = useLang();
  const [broken, setBroken] = useState(false);
  const img = imageOf(a.image);
  const read =
    a.readTime === undefined || a.readTime === null || a.readTime === ''
      ? ''
      : /^\d+$/.test(String(a.readTime))
        ? tr(`${a.readTime} min read`, `${a.readTime} min basahin`)
        : String(a.readTime);
  return (
    <a
      href={`/blog/${encodeURIComponent(a.slug)}`}
      className="block w-[72%] max-w-[280px] shrink-0 snap-start overflow-hidden rounded-[20px] border border-[#EEF1F5] bg-white"
    >
      <span className="flex h-[132px] w-full items-center justify-center overflow-hidden bg-[#F3F7FB]">
        {img && !broken ? (
          <img
            src={getBlogListingImageUrl(img, 560, 264)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setBroken(true)}
          />
        ) : (
          <i className="fa-solid fa-book-medical text-[26px] text-[#BFD9EA]" />
        )}
      </span>
      <span className="block p-3.5">
        <span className="line-clamp-2 block text-[13.5px] font-medium leading-snug text-gray-900">{a.title}</span>
        {read && (
          <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-gray-400">
            <i className="fa-regular fa-clock text-[10px]" />
            {read}
          </span>
        )}
      </span>
    </a>
  );
}

export function HealthArticles() {
  const { tr } = useLang();
  const [items, setItems] = useState<Article[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    call<{ items?: Article[] }>('/blog/posts?per_page=8')
      .then((body) => { if (live) setItems((body.items || []).filter((a) => a.slug && a.title)); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  if (failed || (items && items.length === 0)) return null;

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[17px] font-semibold tracking-tight text-gray-900">{tr('Health articles', 'Mga artikulo sa kalusugan')}</h2>
        <a href="/profile#guides" className="text-[12px] font-semibold" style={{ color: BRAND }}>
          {tr('See all', 'Tingnan lahat')}
        </a>
      </div>
      <div className="gm-hscroll -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1">
        {items === null
          ? Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-[214px] w-[72%] max-w-[280px] shrink-0 animate-pulse rounded-[20px] bg-white" />
            ))
          : items.map((a) => <ArticleSlide key={a._id || a.slug} a={a} />)}
      </div>
    </section>
  );
}
