'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getApiUrl } from './api';
import { useLang } from './i18n';
import { flushQueue, deleteQueued, INQUIRY_QUEUED_EVENT, type QueuedInquiry } from './offlineInquiry';

export function QueuedInquiryNotice() {
  const { tr } = useLang();
  const [sent, setSent] = useState(0);
  const [pending, setPending] = useState<QueuedInquiry[]>([]);
  const [waiting, setWaiting] = useState<QueuedInquiry[]>([]);
  const [dismissed, setDismissed] = useState(false);

  const run = useCallback(async () => {
    const result = await flushQueue(getApiUrl());
    if (result.sent > 0) setSent((n) => n + result.sent);
    setPending(result.needsAttention);
    setWaiting(result.waiting);
    setDismissed(false);
  }, []);

  useEffect(() => {
    run();
    window.addEventListener('online', run);
    window.addEventListener(INQUIRY_QUEUED_EVENT, run);
    return () => {
      window.removeEventListener('online', run);
      window.removeEventListener(INQUIRY_QUEUED_EVENT, run);
    };
  }, [run]);

  const discard = async (id: string) => {
    await deleteQueued(id);
    setPending((list) => list.filter((q) => q.id !== id));
    setWaiting((list) => list.filter((q) => q.id !== id));
  };

  const nothingToSay = sent === 0 && pending.length === 0 && waiting.length === 0;
  if (dismissed || nothingToSay) return null;

  return (
    <div className="gm-queued-notice fixed inset-x-0 bottom-0 z-[9998] px-4 pb-4 pointer-events-none">
      <div className="max-w-lg mx-auto pointer-events-auto rounded-2xl bg-white shadow-[0_4px_24px_rgba(0,0,0,0.14)] border border-gray-100 p-4">
        {sent > 0 && (
          <p className="text-sm text-gray-700">
            <span className="font-semibold" style={{ color: '#61A644' }}>{tr('Sent.', 'Naipadala na.')}</span>{' '}
            {tr(
              `${sent === 1 ? 'An inquiry you' : `${sent} inquiries you`} submitted while offline ${sent === 1 ? 'has' : 'have'} now reached us.`,
              `${sent === 1 ? 'Natanggap na namin ang inquiry' : `Natanggap na namin ang ${sent} inquiry`} na ipinadala mo habang offline.`,
            )}
          </p>
        )}

        {waiting.length > 0 && (
          <p className={`text-sm text-gray-700 ${sent > 0 ? 'mt-3 pt-3 border-t border-gray-100' : ''}`}>
            <span className="font-semibold" style={{ color: '#1D9FDA' }}>{tr('Saved on this device.', 'Naka-save sa device na ito.')}</span>{' '}
            {tr(
              `${waiting.length === 1 ? 'Your inquiry' : `${waiting.length} inquiries`} will be sent automatically as soon as you're back online — you can close the page.`,
              `Kusang maipapadala ${waiting.length === 1 ? 'ang inquiry mo' : `ang ${waiting.length} inquiry`} pagbalik mo online — puwede mo nang isara ang page.`,
            )}
          </p>
        )}

        {pending.map((item, i) => (
          <div key={item.id} className={sent > 0 || waiting.length > 0 || i > 0 ? 'mt-3 pt-3 border-t border-gray-100' : ''}>
            <p className="text-sm text-gray-700">
              {tr('An inquiry saved on this device still needs you', 'May inquiry na naka-save sa device na ito na kailangan pa ng aksyon mo')}
              {item.hadAttachments
                ? tr(
                    ' — your file was not kept on the device for privacy, so please attach it again.',
                    ' — hindi itinago ang file mo sa device para sa privacy, kaya pakilakip ulit ito.',
                  )
                : tr(
                    ' — the security check expired while you were offline.',
                    ' — nag-expire ang security check habang offline ka.',
                  )}
            </p>
            <div className="mt-2.5 flex items-center gap-3">
              <Link
                href={item.returnPath}
                className="text-white text-xs font-semibold rounded-full px-4 py-2"
                style={{ background: 'linear-gradient(135deg,#1D9FDA,#61A644)' }}
              >
                {tr('Finish it', 'Tapusin')}
              </Link>
              <button
                type="button"
                onClick={() => discard(item.id)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                {tr('Discard', 'Itapon')}
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="mt-3 text-xs text-gray-400 hover:text-gray-600"
        >
          {tr('Dismiss', 'Isara')}
        </button>
      </div>
    </div>
  );
}
