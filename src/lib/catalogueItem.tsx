import React from 'react';
import { urlFor } from './sanity';
import { AddToCart } from './AddToCart';

/**
 * catalogueItem.tsx
 * ─────────────────────────────────────────────
 * How a catalogue row is named, linked, pictured and summarised — in one place,
 * because the app home screen and the search screen both draw the same rows and
 * had begun to drift: two copies of "how do we title a product" is how a brand
 * name ends up formatted one way on the home screen and another in results.
 *
 * No prices here, and that is a decision rather than an omission. Getmeds
 * publishes none, much of the range is prescription-only, and advertising Rx
 * pricing to the public is not something to do casually. The slot a storefront
 * gives to price is given to what is actually known and useful: strength, form,
 * stock, and whether a prescription is needed.
 */

export interface CatalogueRow {
  _id?: string;
  name?: string;
  brandName?: string;
  genericName?: string;
  strength?: string;
  form?: string;
  availability?: boolean;
  subCategory?: string;
  categoryFolder?: string;
  productPageUrl?: string;
  slug?: { current?: string };
  Prescription?: string;
  /** Attached in queries.ts by matching the sheet row to a Studio image link. */
  image?: { asset?: unknown };
}

/**
 * The catalogue rows already carry an image — fetchProductsFromExcel() joins
 * each row to the picture a person attached in the Studio. Rendering only text
 * was simply not asking for it.
 */
export const productImage = (p: CatalogueRow, size = 260) => {
  try {
    if (p.image && p.image.asset) return urlFor(p.image).width(size).height(size).url();
  } catch { /* fall through to the placeholder */ }
  return '/assets/no-image.png';
};

export const displayName = (p: CatalogueRow) =>
  p.brandName && p.genericName && p.brandName !== p.genericName
    ? `${p.brandName} (${p.genericName})`
    : p.name || p.brandName || p.genericName || 'Unnamed product';

/** Mirrors the products page: the sheet's own URL wins, else folder + slug. */
export const productUrl = (p: CatalogueRow) => {
  if (p.productPageUrl) {
    const path = p.productPageUrl.replace(/^https?:\/\//, '').replace(/^[^/]*/, '');
    return path || '/product-range';
  }
  return `/${p.categoryFolder || 'product-range'}/${p.slug?.current || ''}`;
};

export const prettyFolder = (folder: string) =>
  folder.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const rxRequired = (p: CatalogueRow) => {
  const rx = String(p.Prescription || '').trim().toLowerCase();
  return rx !== '' && rx !== 'no' && rx !== 'otc' && rx !== 'false';
};

/** The subtitle under a product name — the honest occupant of the price slot. */
export const specLine = (p: CatalogueRow) =>
  [p.strength, p.form].filter(Boolean).join(' · ') || p.subCategory || 'Details on request';

export const cartItemFor = (p: CatalogueRow) => ({
  id: String(p._id || productUrl(p)),
  name: displayName(p),
  strength: p.strength,
  form: p.form,
  url: productUrl(p),
  needsRx: rxRequired(p),
  // Small on purpose: the request list draws these at 56px, and the row is
  // saved to a device that may never be online again before it is read.
  image: p.image?.asset ? productImage(p, 140) : undefined,
});

/**
 * The horizontal row used wherever products appear as a list rather than a
 * grid — search results, and the "did you mean" matches under the box.
 *
 * `highlight` bolds the matched span in the title, which is what makes a long
 * results list scannable: the eye lands on the part that answered the query
 * instead of re-reading twelve near-identical oncology names.
 */
export function ProductRow({ p, highlight }: { p: CatalogueRow; highlight?: string }) {
  const needsRx = rxRequired(p);
  const title = displayName(p);

  return (
    <a
      href={productUrl(p)}
      className="flex items-center gap-3 rounded-[16px] bg-white p-2.5 transition active:scale-[0.99]"
      style={{ boxShadow: '0 2px 10px rgba(23,43,77,.055)' }}
    >
      <div className="h-[58px] w-[58px] shrink-0 overflow-hidden rounded-xl bg-[#F6F8FC] p-1.5">
        <img
          src={productImage(p, 140)}
          alt=""
          loading="lazy"
          className="h-full w-full object-contain mix-blend-multiply"
          onError={(e) => { const i = e.currentTarget; i.onerror = null; i.src = '/assets/no-image.png'; }}
        />
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-gray-900">
          {highlightMatch(title, highlight)}
        </h3>
        <p className="mt-0.5 line-clamp-1 text-[11.5px] text-gray-400">{specLine(p)}</p>
        <div className="mt-1 flex items-center gap-1.5">
          {needsRx && (
            <span className="rounded-full bg-amber-50 px-1.5 py-[2px] text-[9.5px] font-bold text-amber-700">Rx</span>
          )}
          {p.availability !== false && (
            <span className="rounded-full bg-green-50 px-1.5 py-[2px] text-[9.5px] font-bold text-green-700">In stock</span>
          )}
        </div>
      </div>

      <AddToCart item={cartItemFor(p)} />
    </a>
  );
}

/**
 * Wraps the matched span in <mark>. Split rather than regex-replaced so a
 * product name containing regex metacharacters — and "Amloget 10 (5 mg)" is
 * the rule here, not the exception — cannot blow up or silently miss.
 */
export function highlightMatch(text: string, term?: string): React.ReactNode {
  const needle = (term || '').trim().toLowerCase();
  if (!needle) return text;

  const hay = text.toLowerCase();
  const at = hay.indexOf(needle);
  if (at === -1) return text;

  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-bold" style={{ color: '#0D99FF' }}>
        {text.slice(at, at + needle.length)}
      </mark>
      {text.slice(at + needle.length)}
    </>
  );
}
