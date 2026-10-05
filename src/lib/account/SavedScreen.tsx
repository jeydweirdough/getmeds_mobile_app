'use client';

import React, { useState } from 'react';
import { saveList, shortDate, useAccountData, type SavedProduct } from '../accountApi';
import { Empty, ErrorNote, PrimaryButton, Screen, SmallButton, Toast, useToast } from '../ui/Screen';
import { addResultMessage, cartItemFor, detailOf, errorText, Switch, Thumb, unsaveProduct, useAddToList } from './listActions';
import { goTo } from '@/platform/navigation';
import { useLang } from '../i18n';

/**
 * SavedScreen.tsx
 * ─────────────────────────────────────────────
 * "Saved medicines" in the app: the products a signed-in customer bookmarked
 * from product pages, kept with their account so they follow them to a new
 * phone. Each one can go straight onto the request list, and an out-of-stock
 * one can carry a stock alert: the backend texts once when it is back.
 */

export default function SavedScreen({ onClose }: { onClose: () => void }) {
  const { tr } = useLang();
  const { data, error: loadError, reload } = useAccountData();
  const [error, setError] = useState('');
  const [toast, showToast] = useToast();
  const { add, consentSheet } = useAddToList();
  const saved = data?.savedProducts ?? [];

  const setWatch = async (item: SavedProduct, watchStock: boolean) => {
    setError('');
    try {
      await saveList('savedProducts', saved.map((s) => (s._key === item._key ? { ...s, watchStock } : s)));
      showToast(watchStock ? tr("We'll text you when it's back in stock.", 'Ite-text ka namin kapag may stock na ulit.') : tr('Stock alert turned off.', 'Naka-off na ang stock alert.'));
    } catch (e) {
      setError(
        errorText(
          e,
          tr(
            'Could not change the stock alert. Check your connection and try again.',
            'Hindi mapalitan ang stock alert. Tingnan ang iyong connection at subukan ulit.'
          )
        )
      );
    }
  };

  const remove = async (item: SavedProduct) => {
    setError('');
    try {
      await unsaveProduct(item.url);
      showToast(tr(`Removed ${item.name}.`, `Inalis ang ${item.name}.`));
    } catch (e) {
      setError(
        errorText(e, tr('Could not remove it. Check your connection and try again.', 'Hindi ito maalis. Tingnan ang iyong connection at subukan ulit.'))
      );
    }
  };

  const addToList = async (item: SavedProduct) => {
    setError('');
    const r = await add([cartItemFor(item)]);
    if (r === 'added') showToast(tr('Added to your request list.', 'Naidagdag sa iyong request list.'));
    else setError(addResultMessage(r));
  };

  return (
    <Screen
      title={tr('Saved medicines', 'Mga naka-save na gamot')}
      subtitle={tr('Kept with your account', 'Nakatabi sa iyong account')}
      onClose={onClose}
    >
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
          <ErrorNote text={tr(`${loadError} Check your connection and try again.`, `${loadError} Tingnan ang iyong connection at subukan ulit.`)} />
          <PrimaryButton onClick={() => reload()}>{tr('Try again', 'Subukan ulit')}</PrimaryButton>
        </>
      )}

      {data && saved.length === 0 && (
        <Empty
          icon="fa-bookmark"
          title={tr('No saved medicines yet', 'Wala pang naka-save na gamot')}
          text={tr(
            "Tap the bookmark on a medicine's page to keep it here. You can also ask us to text you when it's back in stock.",
            'I-tap ang bookmark sa page ng gamot para itabi ito rito. Puwede mo ring hilinging i-text ka namin kapag may stock na ulit.'
          )}
          action={
            <SmallButton onClick={() => { goTo('/search'); }}>
              {tr('Find a medicine', 'Maghanap ng gamot')}
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
                    aria-label={tr(`Remove ${item.name}`, `Alisin ang ${item.name}`)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400"
                  >
                    <i className="fa-regular fa-trash-can text-[13px]" />
                  </button>
                </div>

                <div className="flex items-center gap-3 border-t border-[#EEF1F5] px-4 py-3">
                  <label htmlFor={watchId} className="min-w-0 flex-1">
                    <span className="block text-[13px] text-gray-800">{tr('Text me when back in stock', 'I-text ako kapag may stock na')}</span>
                    {/* The daily job texts once and stamps notifiedAt; switching
                        off and on again clears it, so say how to hear again. */}
                    {item.watchStock && (
                      <span className="block text-[11.5px] text-gray-500">
                        {item.notifiedAt
                          ? tr(
                              `We texted you on ${shortDate(item.notifiedAt)}. Turn this off and on to hear next time.`,
                              `Na-text ka namin noong ${shortDate(item.notifiedAt)}. I-off at i-on ulit ito para ma-text ka sa susunod.`
                            )
                          : tr('We text you once when it comes back.', 'Ite-text ka namin nang isang beses kapag bumalik ang stock.')}
                      </span>
                    )}
                  </label>
                  <Switch
                    id={watchId}
                    on={Boolean(item.watchStock)}
                    onChange={(on) => setWatch(item, on)}
                    label={tr(`Text me when ${item.name} is back in stock`, `I-text ako kapag may stock na ang ${item.name}`)}
                  />
                </div>

                <div className="border-t border-[#EEF1F5] px-4 py-3">
                  <SmallButton onClick={() => addToList(item)}>
                    <i className="fa-solid fa-cart-plus mr-1.5 text-[11px]" />
                    {tr('Add to request list', 'Idagdag sa request list')}
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
