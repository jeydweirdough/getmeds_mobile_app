'use client';

import React from 'react';
import { useProducts } from './useSanity';
import { productUrl, type CatalogueRow } from './catalogueItem';
import { goTo } from '@/platform/navigation';

/**
 * StrengthPicker.tsx
 * ─────────────────────────────────────────────
 * "Select strength" on the app's product page, where a shop would offer sizes.
 *
 * The catalogue has one row per strength (e.g. PacliGet 100 mg/16.7 mL and
 * PacliGet 300 mg/50 mL are separate products), so strengths of the same
 * medicine are found by grouping rows with the same brand, generic name and
 * form, compared case- and space-insensitively. Tapping another strength
 * opens that product in place of this one (replace, not push), so Back still
 * leads where the visitor came from instead of through every strength tried.
 */

const norm = (s?: string) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const groupKey = (p: CatalogueRow) => `${norm(p.brandName)}|${norm(p.genericName)}|${norm(p.form)}`;
/** First number in the strength, for ordering: "6mg/mL (100 mg…)" sorts by 6, "450 mg" by 450. */
const amount = (s?: string) => {
  const m = (s || '').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : Number.MAX_SAFE_INTEGER;
};
/** Inside brackets is usually the clearer pack size: "6mg/mL (100 mg / 16.7 mL)" -> "100 mg / 16.7 mL". */
const chipLabel = (s?: string) => {
  const inner = (s || '').match(/\(([^)]+)\)/);
  return (inner ? inner[1] : s || '').trim();
};

export default function StrengthPicker({ current }: { current: CatalogueRow }) {
  const { data } = useProducts();
  const rows = (data || []) as CatalogueRow[];
  const key = groupKey(current);
  const siblings = rows
    .filter((p) => p.strength && groupKey(p) === key)
    .sort((a, b) => amount(chipLabel(a.strength)) - amount(chipLabel(b.strength)) || norm(a.strength).localeCompare(norm(b.strength)));
  const options = siblings.length ? siblings : current.strength ? [current] : [];
  if (!options.length) return null;

  const isCurrent = (p: CatalogueRow) =>
    (p._id && current._id && p._id === current._id) || (p.slug?.current && p.slug.current === current.slug?.current);

  return (
    <div className="mt-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        {options.length > 1 ? 'Select strength' : 'Strength'}
      </p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Strength">
        {options.map((p) => {
          const on = isCurrent(p);
          return (
            <button
              key={p._id || p.slug?.current || p.strength}
              type="button"
              role="radio"
              aria-checked={!!on}
              title={p.strength}
              onClick={() => {
                if (!on) goTo(productUrl(p), { replace: true });
              }}
              className={`rounded-[12px] border px-3.5 py-2 text-[12.5px] font-semibold transition ${
                on ? 'border-transparent text-white' : 'border-[#E3E9F1] bg-white text-gray-700'
              } ${p.availability === false && !on ? 'opacity-50' : ''}`}
              style={on ? { background: 'linear-gradient(135deg,#1D9FDA,#61A644)' } : undefined}
            >
              {chipLabel(p.strength)}
              {p.availability === false && <span className="ml-1 text-[10px] font-medium">(out of stock)</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
