'use client';

import React, { useState } from 'react';
import { addToCart, setConsent, type CartItem } from '../cart';
import { accountData, newKey, saveList, slugOf, type SavedProduct } from '../accountApi';
import { BRAND, GRADIENT, Sheet } from '../ui/Screen';
import { translate, useLang } from '../i18n';

/**
 * listActions.tsx
 * ─────────────────────────────────────────────
 * What Saved medicines, Refill reminders, Your requests and the product page
 * share: putting medicines on the request list (with the storage consent step
 * in front of it), saving and unsaving a product, and the small product
 * picture with its fallback.
 *
 * The consent step is drawn as a Sheet rather than reusing AddToCart's own
 * sheet: that one sits under the full-screen account pages (z 10000 against
 * 10040+), so from inside a Screen it would open out of sight.
 */

/** The fields every screen has for a product. */
export interface ProductRef {
  name: string;
  url?: string;
  image?: string;
  strength?: string;
  form?: string;
}

/**
 * A request list row for a product. The id comes from the product's slug so
 * adding the same medicine from Saved, a reminder or an old request lands on
 * one row rather than three.
 */
export function cartItemFor(p: ProductRef, prefix = 'saved'): Omit<CartItem, 'addedAt'> {
  const slug = slugOf(p.url) || p.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    id: `${prefix}-${slug}`,
    name: p.name,
    strength: p.strength || undefined,
    form: p.form || undefined,
    // A medicine typed by name has no page of its own; searching for it is
    // the nearest place the list can send someone back to.
    url: p.url || `/search?q=${encodeURIComponent(p.name)}`,
    image: p.image || undefined,
  };
}

type AddResult = 'added' | 'failed' | 'declined';

/**
 * Adds items to the request list, asking for storage consent first when this
 * phone has not given it. `consentSheet` must be rendered by the caller.
 */
export function useAddToList() {
  const { tr } = useLang();
  const [pending, setPending] = useState<{ items: Omit<CartItem, 'addedAt'>[]; done: (r: AddResult) => void } | null>(null);

  const addAll = async (items: Omit<CartItem, 'addedAt'>[]): Promise<AddResult | 'needs-consent'> => {
    for (const item of items) {
      const r = await addToCart(item);
      if (r !== 'added') return r;
    }
    return 'added';
  };

  const add = (items: Omit<CartItem, 'addedAt'>[]): Promise<AddResult> =>
    addAll(items).then(
      (r) =>
        r === 'needs-consent'
          ? new Promise<AddResult>((resolve) => setPending({ items, done: resolve }))
          : r
    );

  const decide = async (granted: boolean) => {
    const p = pending;
    setPending(null);
    if (!p) return;
    await setConsent(granted);
    if (!granted) return p.done('declined');
    const r = await addAll(p.items);
    p.done(r === 'added' ? 'added' : 'failed');
  };

  const consentSheet = pending ? (
    <Sheet title={tr('Save your list on this phone?', 'I-save ang list mo sa phone na ito?')} onClose={() => decide(false)}>
      <div className="rounded-[20px] border border-[#EEF1F5] bg-white p-4">
        <p className="text-[13px] leading-relaxed text-gray-600">
          {tr(
            'To keep a request list, Getmeds needs to store the products you choose on this device.',
            'Para makapagtabi ng request list, kailangang i-store ng Getmeds sa device na ito ang mga produktong pipiliin mo.'
          )}
        </p>
        <ul className="mt-3 space-y-2.5 text-[12.5px] leading-snug text-gray-600">
          <li className="flex gap-2.5">
            <i className="fa-solid fa-mobile-screen mt-0.5 text-[12px]" style={{ color: BRAND }} />
            <span>
              {tr(
                'It stays on this phone. It is not sent to us and will not appear on your other devices.',
                'Mananatili ito sa phone na ito. Hindi ito ipinapadala sa amin at hindi lalabas sa iba mo pang device.'
              )}
            </span>
          </li>
          <li className="flex gap-2.5">
            <i className="fa-solid fa-paper-plane mt-0.5 text-[12px]" style={{ color: BRAND }} />
            <span>
              {tr(
                'Nothing reaches Getmeds until you choose to request a quote.',
                'Walang makakarating sa Getmeds hangga\'t hindi ka humihingi ng quote.'
              )}
            </span>
          </li>
          <li className="flex gap-2.5">
            <i className="fa-solid fa-trash-can mt-0.5 text-[12px]" style={{ color: BRAND }} />
            <span>
              {tr(
                'You can clear it any time under More, Clear saved data.',
                'Puwede mo itong burahin anumang oras sa Iba pa, Burahin ang naka-save na data.'
              )}
            </span>
          </li>
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-gray-400">
          {tr(
            'Processed in accordance with the Data Privacy Act of 2012. See our',
            'Pinoproseso alinsunod sa Data Privacy Act of 2012. Tingnan ang aming'
          )}{' '}
          <a href="/policy" className="underline">{tr('Privacy Policy', 'Privacy Policy')}</a>.
        </p>
      </div>
      <button
        type="button"
        onClick={() => decide(true)}
        className="w-full rounded-full py-3.5 text-[14px] font-semibold text-white"
        style={{ background: GRADIENT }}
      >
        {tr('Allow and save', 'Payagan at i-save')}
      </button>
      <button type="button" onClick={() => decide(false)} className="w-full rounded-full py-2 text-[13px] font-semibold text-gray-500">
        {tr('Not now', 'Hindi muna')}
      </button>
    </Sheet>
  ) : null;

  return { add, consentSheet };
}

/** What to tell someone when adding did not work. Empty when it did. */
export const addResultMessage = (r: AddResult) =>
  r === 'failed'
    ? translate(
        'This phone did not let Getmeds save your list. Check that site data is allowed for getmeds.ph, then try again.',
        'Hindi pinayagan ng phone na ito ang Getmeds na i-save ang list mo. Siguraduhing allowed ang site data para sa getmeds.ph, saka subukan ulit.'
      )
    : r === 'declined'
      ? translate(
          'Allow saving the list on this phone to add medicines to it.',
          'Payagan ang pag-save ng list sa phone na ito para makapagdagdag ng gamot.'
        )
      : '';

// ── Saved medicines ─────────────────────────────────────────────────────────

export const findSaved = (url?: string): SavedProduct | undefined => {
  const slug = slugOf(url);
  if (!slug) return undefined;
  return accountData()?.savedProducts.find((s) => slugOf(s.url) === slug);
};

/**
 * The saved list as the server has it. Saving before it has loaded would
 * replace the whole list with one item, so that is refused instead.
 */
function loadedList(): SavedProduct[] {
  const d = accountData();
  if (!d) throw new Error(translate('Your account is still loading. Try again in a moment.', 'Naglo-load pa ang account mo. Subukan ulit maya-maya.'));
  return d.savedProducts;
}

/**
 * Saves a product, or updates its stock alert when it is already saved.
 * Rejects with the server's message; the shared copy is rolled back by then.
 */
export async function saveProduct(p: ProductRef, watchStock?: boolean): Promise<void> {
  const list = loadedList();
  if (!p.url?.startsWith('/')) throw new Error(
      translate(
        'This medicine cannot be saved. Open it from search and try again.',
        'Hindi ma-save ang gamot na ito. Buksan ito mula sa search at subukan ulit.'
      )
    );
  const slug = slugOf(p.url);
  const existing = list.find((s) => slugOf(s.url) === slug);
  if (existing) {
    if (watchStock === undefined || Boolean(existing.watchStock) === watchStock) return;
    await saveList('savedProducts', list.map((s) => (s === existing ? { ...s, watchStock } : s)));
    return;
  }
  if (list.length >= 100) throw new Error(
      translate(
        'You have 100 saved medicines, the most we keep. Remove one to save another.',
        'May 100 ka nang naka-save na gamot, ang pinakamarami na puwede. Mag-alis ng isa para makapag-save ng bago.'
      )
    );
  const item: SavedProduct = {
    _key: newKey(),
    name: p.name,
    url: p.url,
    image: p.image || '',
    strength: p.strength || '',
    form: p.form || '',
    watchStock: Boolean(watchStock),
  };
  await saveList('savedProducts', [item, ...list]);
}

export async function unsaveProduct(url: string): Promise<void> {
  const list = loadedList();
  const slug = slugOf(url);
  await saveList('savedProducts', list.filter((s) => slugOf(s.url) !== slug));
}

export const errorText = (e: unknown, fallback: string) =>
  (e instanceof Error && e.message) || fallback;

// ── Controls ────────────────────────────────────────────────────────────────

/** An on/off switch. `id` labels it for the row text beside it. */
export function Switch({ id, on, onChange, label }: { id: string; on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors"
      style={{ background: on ? BRAND : '#D7DEE7' }}
    >
      <span
        className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all"
        style={{ left: on ? 21 : 3 }}
      />
    </button>
  );
}

/** A product photo on a soft tile, or a capsule icon when there is none. */
export function Thumb({ src, size = 48 }: { src?: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-[#F6F8FC]"
      style={{ width: size, height: size }}
    >
      {src && !broken ? (
        <img src={src} alt="" className="h-full w-full object-contain p-1 mix-blend-multiply" onError={() => setBroken(true)} />
      ) : (
        <i className="fa-solid fa-capsules text-[15px] text-gray-300" />
      )}
    </span>
  );
}

/** "500 mg · Tablet", skipping whichever is missing. */
export const detailOf = (p: { strength?: string; form?: string }) =>
  [p.strength, p.form].filter((x) => x && x.trim()).join(' · ');
