'use client';

import React, { useState } from 'react';
import { isSignedIn } from '../rewards';
import { slugOf, useAccountData } from '../accountApi';
import { PrimaryButton, Sheet, Toast, useToast, BRAND } from '../ui/Screen';
import { errorText, saveProduct, unsaveProduct, type ProductRef } from './listActions';
import { AddReminderSheet } from './RemindersScreen';

/**
 * ProductActions.tsx
 * ─────────────────────────────────────────────
 * The account actions on a product page in the app: the bookmark in the
 * header, "Text me when it's back in stock" for an out-of-stock product, and
 * "Remind me to refill". All three keep data with the customer's account, so
 * a signed-out tap opens a short sheet pointing at sign-in on /profile
 * instead of failing.
 *
 * Kept out of product-detail.tsx so the website never loads account data:
 * the page renders these only in app mode.
 */

type Feature = 'save' | 'stock' | 'refill';

const SIGN_IN_COPY: Record<Feature, { title: string; text: string }> = {
  save: {
    title: 'Sign in to save medicines',
    text: 'Saved medicines are kept with your account, so you find them again on any phone.',
  },
  stock: {
    title: 'Sign in for stock alerts',
    text: "We text the mobile number you sign in with when this medicine is back in stock.",
  },
  refill: {
    title: 'Sign in for refill reminders',
    text: 'We text you the day before a medicine runs out, and you earn bonus points when you request it on time.',
  },
};

function SignInSheet({ feature, onClose }: { feature: Feature; onClose: () => void }) {
  const copy = SIGN_IN_COPY[feature];
  return (
    <Sheet title={copy.title} onClose={onClose}>
      <p className="px-1 text-[13px] leading-relaxed text-gray-600">{copy.text}</p>
      <p className="px-1 text-[12px] leading-relaxed text-gray-500">Sign in with your mobile number. It takes a minute.</p>
      <PrimaryButton onClick={() => { window.location.href = '/profile'; }}>Sign in</PrimaryButton>
      <button type="button" onClick={onClose} className="w-full rounded-full py-2 text-[13px] font-semibold text-gray-500">
        Not now
      </button>
    </Sheet>
  );
}

/** The saved copy of this product, if any, kept current. */
function useSavedEntry(product: ProductRef) {
  const { data } = useAccountData();
  const slug = slugOf(product.url);
  return { data, saved: data?.savedProducts.find((s) => slug && slugOf(s.url) === slug) };
}

/** The bookmark button for the app header, styled like the share button beside it. */
export function SaveProductButton({ product }: { product: ProductRef }) {
  const { data, saved } = useSavedEntry(product);
  const [signIn, setSignIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast();

  const toggle = async () => {
    if (!isSignedIn()) return setSignIn(true);
    if (!data) return showToast('Your account is still loading. Try again in a moment.');
    setBusy(true);
    try {
      if (saved) {
        await unsaveProduct(saved.url);
        showToast('Removed from saved medicines.');
      } else {
        await saveProduct(product);
        showToast('Saved. Find it under Account, Saved medicines.');
      }
    } catch (e) {
      showToast(errorText(e, 'Could not save it. Check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={Boolean(saved)}
        aria-label={saved ? 'Remove from saved medicines' : 'Save this medicine'}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F6FB] text-gray-700"
      >
        <i className={`fa-${saved ? 'solid' : 'regular'} fa-bookmark text-[14px]`} style={saved ? { color: BRAND } : undefined} />
      </button>
      {signIn && <SignInSheet feature="save" onClose={() => setSignIn(false)} />}
      <Toast text={toast} />
    </>
  );
}

/**
 * The stock alert (only when out of stock) and the refill reminder link, for
 * the app hero under the badges.
 */
export function ProductAccountPanel({ product, outOfStock }: { product: ProductRef; outOfStock: boolean }) {
  const { data, saved } = useSavedEntry(product);
  const [signIn, setSignIn] = useState<Feature | null>(null);
  const [remind, setRemind] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast();
  const watching = Boolean(saved?.watchStock);

  const toggleWatch = async () => {
    if (!isSignedIn()) return setSignIn('stock');
    if (!data) return showToast('Your account is still loading. Try again in a moment.');
    setBusy(true);
    try {
      await saveProduct(product, !watching);
      showToast(watching ? 'Stock alert turned off.' : "We'll text you when it's back in stock.");
    } catch (e) {
      showToast(errorText(e, 'Could not set the stock alert. Check your connection and try again.'));
    } finally {
      setBusy(false);
    }
  };

  const openRemind = () => {
    if (!isSignedIn()) return setSignIn('refill');
    setRemind(true);
  };

  return (
    <>
      {outOfStock && (
        <div className="mt-4 rounded-[16px] border border-[#EEF1F5] bg-white p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-gray-900">
            <i className="fa-solid fa-box-open text-[12px] text-amber-500" />
            Out of stock for now
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-gray-500">
            {watching
              ? 'We text you once when it comes back. Tap again to turn this off.'
              : 'We can text you once when it comes back.'}
          </p>
          <button
            type="button"
            onClick={toggleWatch}
            disabled={busy}
            aria-pressed={watching}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full border py-3 text-[13px] font-semibold disabled:opacity-60"
            style={
              watching
                ? { borderColor: '#61A644', color: '#61A644', background: '#f4faf1' }
                : { borderColor: BRAND, color: BRAND, background: '#fff' }
            }
          >
            <i className={`fa-solid ${watching ? 'fa-check' : 'fa-bell'} text-[12px]`} />
            {watching ? "We'll text you" : "Text me when it's back in stock"}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={openRemind}
        className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold"
        style={{ color: BRAND }}
      >
        <i className="fa-regular fa-bell text-[11px]" />
        Remind me to refill
      </button>

      {signIn && <SignInSheet feature={signIn} onClose={() => setSignIn(null)} />}
      {remind && <AddReminderSheet initial={product} onClose={() => setRemind(false)} onSaved={showToast} />}
      <Toast text={toast} />
    </>
  );
}
