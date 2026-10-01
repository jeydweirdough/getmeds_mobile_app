'use client';

import React, { useState } from 'react';
import { saveList, shortDate, useAccountData, type SavedProduct } from '../accountApi';
import { Empty, ErrorNote, PrimaryButton, Screen, SmallButton, Toast, useToast } from '../ui/Screen';
import { addResultMessage, cartItemFor, detailOf, errorText, Switch, Thumb, unsaveProduct, useAddToList } from './listActions';

/**
 * SavedScreen.tsx
 * ─────────────────────────────────────────────
 * "Saved medicines" in the app: the products a signed-in customer bookmarked
 * from product pages, kept with their account so they follow them to a new
 * phone. Each one can go straight onto the request list, and an out-of-stock
 * one can carry a stock alert: the backend texts once when it is back.
 */

export default function SavedScreen({ onClose }: { onClose: () => void }) {
  const { data, error: loadError, reload } = useAccountData();
  const [error, setError] = useState('');
  const [toast, showToast] = useToast();
  const { add, consentSheet } = useAddToList();
  const saved = data?.savedProducts ?? [];

  const setWatch = async (item: SavedProduct, watchStock: boolean) => {
    setError('');
    try {
      await saveList('savedProducts', saved.map((s) => (s._key === item._key ? { ...s, watchStock } : s)));
      showToast(watchStock ? "We'll text you when it's back in stock." : 'Stock alert turned off.');
    } catch (e) {
      setError(errorText(e, 'Could not change the stock alert. Check your connection and try again.'));
    }
  };

  const remove = async (item: SavedProduct) => {
    setError('');
    try {
      await unsaveProduct(item.url);
      showToast(`Removed ${item.name}.`);
    } catch (e) {
      setError(errorText(e, 'Could not remove it. Check your connection and try again.'));
    }
  };

  const addToList = async (item: SavedProduct) => {
    setError('');
    const r = await add([cartItemFor(item)]);
    if (r === 'added') showToast('Added to your request list.');
    else setError(addResultMessage(r));
  };

  return (
    <Screen title="Saved medicines" subtitle="Kept with your account" onClose={onClose}>
      <ErrorNote text={error} />

      {!data && !loadError && (
        <div className="space-y-2.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[112px] animate-pulse rounded-[20px] bg-white" />
          ))}
        </div>
      )}

      {!data && loadError && (
        <>
          <ErrorNote text={`${loadError} Check your connection and try again.`} />
          <PrimaryButton onClick={() => reload()}>Try again</PrimaryButton>
        </>
      )}

      {data && saved.length === 0 && (
        <Empty
          icon="fa-bookmark"
          title="No saved medicines yet"
          text="Tap the bookmark on a medicine's page to keep it here. You can also ask us to text you when it's back in stock."
          action={
            <SmallButton onClick={() => { window.location.href = '/search'; }}>
              Find a medicine
            </SmallButton>
          }
        />
      )}

      {saved.length > 0 && (
        <ul className="space-y-2.5">
          {saved.map((item) => {
            const detail = detailOf(item);
            const watchId = `saved-watch-${item._key}`;
            return (
              <li key={item._key} className="overflow-hidden rounded-[20px] border border-[#EEF1F5] bg-white">
                <div className="flex items-start gap-3 px-4 pb-3 pt-3.5">
                  <a href={item.url} className="flex min-w-0 flex-1 items-start gap-3">
                    <Thumb src={item.image} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium leading-snug text-gray-900">{item.name}</span>
                      {detail && <span className="mt-0.5 block text-[12px] text-gray-500">{detail}</span>}
                    </span>
                  </a>
                  <button
                    type="button"
                    onClick={() => remove(item)}
                    aria-label={`Remove ${item.name}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400"
                  >
                    <i className="fa-regular fa-trash-can text-[13px]" />
                  </button>
                </div>

                <div className="flex items-center gap-3 border-t border-[#EEF1F5] px-4 py-3">
                  <label htmlFor={watchId} className="min-w-0 flex-1">
                    <span className="block text-[13px] text-gray-800">Text me when back in stock</span>
                    {/* The daily job texts once and stamps notifiedAt; switching
                        off and on again clears it, so say how to hear again. */}
                    {item.watchStock && (
                      <span className="block text-[11.5px] text-gray-500">
                        {item.notifiedAt
                          ? `We texted you on ${shortDate(item.notifiedAt)}. Turn this off and on to hear next time.`
                          : 'We text you once when it comes back.'}
                      </span>
                    )}
                  </label>
                  <Switch
                    id={watchId}
                    on={Boolean(item.watchStock)}
                    onChange={(on) => setWatch(item, on)}
                    label={`Text me when ${item.name} is back in stock`}
                  />
                </div>

                <div className="border-t border-[#EEF1F5] px-4 py-3">
                  <SmallButton onClick={() => addToList(item)}>
                    <i className="fa-solid fa-cart-plus mr-1.5 text-[11px]" />
                    Add to request list
                  </SmallButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {consentSheet}
      <Toast text={toast} />
    </Screen>
  );
}
