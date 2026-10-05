'use client';

import React, { useState } from 'react';
import { shortDate, useAccountData, type RequestItem, type ServerRequest } from '../accountApi';
import { Empty, ErrorNote, PrimaryButton, Screen, SmallButton, Toast, useToast, BRAND } from '../ui/Screen';
import { addResultMessage, cartItemFor, detailOf, Thumb, useAddToList } from './listActions';
import { AddReminderSheet } from './RemindersScreen';
import { goTo } from '@/platform/navigation';
import { useLang } from '../i18n';

/**
 * RequestsScreen.tsx
 * ─────────────────────────────────────────────
 * "Your requests": what this customer has sent Getmeds while signed in, as
 * the server keeps it, so it survives a new phone. From an old request they
 * can put the same medicines back on the list, ask the team about it in
 * chat, or set a refill reminder for one item.
 *
 * `embedded` draws the list alone, to sit inside the account page.
 */

export default function RequestsScreen({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const { tr } = useLang();
  const { data, error: loadError, reload } = useAccountData();
  const [error, setError] = useState('');
  const [toast, showToast] = useToast();
  const [remind, setRemind] = useState<RequestItem | null>(null);
  const { add, consentSheet } = useAddToList();
  const requests = [...(data?.requests ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const orderAgain = async (r: ServerRequest) => {
    setError('');
    const items = r.items.filter((i) => i.url?.startsWith('/'));
    if (items.length === 0) {
      setError(
        tr(
          'These medicines have no product page to add from. Tap Ask about this and our team will help.',
          'Walang product page ang mga gamot na ito na mapagkukunan. I-tap ang Magtanong tungkol dito at tutulong ang aming team.'
        )
      );
      return;
    }
    const result = await add(items.map((i) => cartItemFor(i)));
    if (result === 'added') goTo('/cart');
    else setError(addResultMessage(result));
  };

  const body = (
    <>
      <ErrorNote text={error} />

      {!data && !loadError && (
        <div className="space-y-2.5" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-[150px] animate-pulse rounded-[20px] bg-white" />
          ))}
        </div>
      )}

      {!data && loadError && (
        <>
          <ErrorNote text={tr(`${loadError} Check your connection and try again.`, `${loadError} Tingnan ang iyong connection at subukan ulit.`)} />
          <PrimaryButton onClick={() => reload()}>{tr('Try again', 'Subukan ulit')}</PrimaryButton>
        </>
      )}

      {data && requests.length === 0 && (
        <Empty
          icon="fa-paper-plane"
          title={tr('No requests yet', 'Wala pang request')}
          text={tr(
            'Requests you send while signed in show here, so you can ask for the same medicines again in one tap.',
            'Lalabas dito ang mga request na ipinadala mo habang naka-log in, para maulit mo ang parehong gamot sa isang tap.'
          )}
          action={<SmallButton onClick={() => { goTo('/search'); }}>{tr('Find a medicine', 'Maghanap ng gamot')}</SmallButton>}
        />
      )}

      {requests.length > 0 && (
        <ul className="space-y-2.5">
          {requests.map((r) => (
            <li key={r._id} className="overflow-hidden rounded-[20px] border border-[#EEF1F5] bg-white">
              <div className="px-4 pb-2 pt-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-[14px] font-semibold text-gray-900">{r.inquiryType || tr('Request', 'Request')}</p>
                  <p className="shrink-0 text-[11.5px] text-gray-400">{shortDate(r.createdAt)}</p>
                </div>
                {r.patientName && <p className="mt-0.5 text-[12px] text-gray-500">{tr('For', 'Para kay')} {r.patientName}</p>}
              </div>

              {r.items.length > 0 && (
                <ul>
                  {r.items.map((item, i) => {
                    const detail = detailOf(item);
                    return (
                      <li key={`${r._id}-${i}`} className="flex items-center gap-3 border-t border-[#EEF1F5] px-4 py-2.5">
                        <Thumb src={item.image} size={40} />
                        <span className="min-w-0 flex-1">
                          {item.url ? (
                            <a href={item.url} className="block truncate text-[13.5px] text-gray-900">{item.name}</a>
                          ) : (
                            <span className="block truncate text-[13.5px] text-gray-900">{item.name}</span>
                          )}
                          {detail && <span className="block truncate text-[11.5px] text-gray-500">{detail}</span>}
                          <button
                            type="button"
                            onClick={() => setRemind(item)}
                            className="mt-1 inline-flex items-center gap-1.5 text-[11.5px] font-semibold"
                            style={{ color: BRAND }}
                          >
                            <i className="fa-regular fa-bell text-[10.5px]" />
                            {tr('Remind me to refill', 'Paalalahanan akong mag-refill')}
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="flex flex-wrap gap-2 border-t border-[#EEF1F5] px-4 py-3">
                <SmallButton onClick={() => orderAgain(r)}>
                  <i className="fa-solid fa-rotate-right mr-1.5 text-[11px]" />
                  {tr('Order again', 'Umorder ulit')}
                </SmallButton>
                <SmallButton onClick={() => { goTo(`/chat?request=${encodeURIComponent(r._id)}`); }}>
                  <i className="fa-regular fa-comment mr-1.5 text-[11px]" />
                  {tr('Ask about this', 'Magtanong tungkol dito')}
                </SmallButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      {remind && (
        <AddReminderSheet
          initial={{ name: remind.name, url: remind.url, image: remind.image, strength: remind.strength, form: remind.form }}
          onClose={() => setRemind(null)}
          onSaved={showToast}
        />
      )}
      {consentSheet}
      <Toast text={toast} />
    </>
  );

  if (embedded) return <div className="space-y-5">{body}</div>;

  return (
    <Screen
      title={tr('Your requests', 'Mga request mo')}
      subtitle={tr("What you've sent Getmeds", 'Ang mga ipinadala mo sa Getmeds')}
      onClose={onClose ?? (() => undefined)}>
      {body}
    </Screen>
  );
}
