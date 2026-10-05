'use client';

import React, { useState } from 'react';
import { isSignedIn } from '../rewards';
import { slugOf, useAccountData } from '../accountApi';
import { PrimaryButton, Sheet, Toast, useToast, BRAND } from '../ui/Screen';
import { errorText, saveProduct, unsaveProduct, type ProductRef } from './listActions';
import { AddReminderSheet } from './RemindersScreen';
import { goTo } from '@/platform/navigation';
import { useLang } from '../i18n';

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

const SIGN_IN_COPY: Record<Feature, { title: string; titleTl: string; text: string; textTl: string }> = {
  save: {
    title: 'Log in to save medicines',
    titleTl: 'Mag-log in para mag-save ng gamot',
    text: 'Saved medicines are kept with your account, so you find them again on any phone.',
    textTl: 'Nakatabi sa iyong account ang mga naka-save na gamot, kaya makikita mo ulit ang mga ito sa kahit anong phone.',
  },
  stock: {
    title: 'Log in for stock alerts',
    titleTl: 'Mag-log in para sa stock alerts',
    text: "We text your mobile number when this medicine is back in stock.",
    textTl: 'Ite-text namin ang mobile number mo kapag may stock na ulit ang gamot na ito.',
  },
  refill: {
    title: 'Log in for refill reminders',
    titleTl: 'Mag-log in para sa refill reminders',
    text: 'We text you the day before a medicine runs out, and you earn bonus points when you request it on time.',
    textTl: 'Ite-text ka namin isang araw bago maubos ang gamot, at may bonus points ka kapag nag-request ka sa tamang oras.',
  },
};

function SignInSheet({ feature, onClose }: { feature: Feature; onClose: () => void }) {
  const { tr } = useLang();
  const copy = SIGN_IN_COPY[feature];
  return (
    <Sheet title={tr(copy.title, copy.titleTl)} onClose={onClose}>
      <p className="px-1 text-[13px] leading-relaxed text-gray-600">{tr(copy.text, copy.textTl)}</p>
      <p className="px-1 text-[12px] leading-relaxed text-gray-500">
        {tr(
          'Log in, or create an account with your email or mobile number. It takes a minute.',
          'Mag-log in, o gumawa ng account gamit ang email o mobile number mo. Isang minuto lang ito.'
        )}
      </p>
      <PrimaryButton onClick={() => { goTo('/profile'); }}>{tr('Log in or sign up', 'Mag-log in o mag-sign up')}</PrimaryButton>
      <button type="button" onClick={onClose} className="w-full rounded-full py-2 text-[13px] font-semibold text-gray-500">
        {tr('Not now', 'Hindi muna')}
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
  const { tr } = useLang();
  const { data, saved } = useSavedEntry(product);
  const [signIn, setSignIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast();

  const toggle = async () => {
    if (!isSignedIn()) return setSignIn(true);
    if (!data) return showToast(tr('Your account is still loading. Try again in a moment.', 'Naglo-load pa ang account mo. Subukan ulit maya-maya.'));
    setBusy(true);
    try {
      if (saved) {
        await unsaveProduct(saved.url);
        showToast(tr('Removed from saved medicines.', 'Inalis sa mga naka-save na gamot.'));
      } else {
        await saveProduct(product);
        showToast(tr('Saved. Find it under Account, Saved medicines.', 'Na-save. Makikita ito sa Account, Mga naka-save na gamot.'));
      }
    } catch (e) {
      showToast(errorText(e, tr('Could not save it. Check your connection and try again.', 'Hindi ito ma-save. Tingnan ang iyong connection at subukan ulit.')));
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
        aria-label={saved ? tr('Remove from saved medicines', 'Alisin sa mga naka-save na gamot') : tr('Save this medicine', 'I-save ang gamot na ito')}
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
  const { tr } = useLang();
  const { data, saved } = useSavedEntry(product);
  const [signIn, setSignIn] = useState<Feature | null>(null);
  const [remind, setRemind] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useToast();
  const watching = Boolean(saved?.watchStock);

  const toggleWatch = async () => {
    if (!isSignedIn()) return setSignIn('stock');
    if (!data) return showToast(tr('Your account is still loading. Try again in a moment.', 'Naglo-load pa ang account mo. Subukan ulit maya-maya.'));
    setBusy(true);
    try {
      await saveProduct(product, !watching);
      showToast(watching ? tr('Stock alert turned off.', 'Naka-off na ang stock alert.') : tr("We'll text you when it's back in stock.", 'Ite-text ka namin kapag may stock na ulit.'));
    } catch (e) {
      showToast(
        errorText(
          e,
          tr(
            'Could not set the stock alert. Check your connection and try again.',
            'Hindi ma-set ang stock alert. Tingnan ang iyong connection at subukan ulit.'
          )
        )
      );
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
            {tr('Out of stock for now', 'Walang stock sa ngayon')}
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-gray-500">
            {watching
              ? tr(
                  'We text you once when it comes back. Tap again to turn this off.',
                  'Ite-text ka namin nang isang beses kapag bumalik ang stock. I-tap ulit para i-off ito.'
                )
              : tr('We can text you once when it comes back.', 'Puwede ka naming i-text nang isang beses kapag bumalik ang stock.')}
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
            {watching ? tr("We'll text you", 'Ite-text ka namin') : tr("Text me when it's back in stock", 'I-text ako kapag may stock na')}
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
        {tr('Remind me to refill', 'Paalalahanan akong mag-refill')}
      </button>

      {signIn && <SignInSheet feature={signIn} onClose={() => setSignIn(null)} />}
      {remind && <AddReminderSheet initial={product} onClose={() => setRemind(false)} onSaved={showToast} />}
      <Toast text={toast} />
    </>
  );
}
