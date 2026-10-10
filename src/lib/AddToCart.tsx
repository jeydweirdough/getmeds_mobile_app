'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  addToCart,
  hasConsent,
  inCart,
  isAppMode,
  removeFromCart,
  setConsent,
  CART_CHANGED_EVENT,
  type CartItem,
} from './cart';
import { useLang } from './i18n';

/**
 * AddToCart.tsx
 * ─────────────────────────────────────────────
 * The add-to-list control and the consent step in front of it.
 *
 * Renders nothing outside the installed app: on the website there is no cart
 * tab to put anything in, so a button that saved to a list nobody can reach
 * would only confuse.
 *
 * The consent sheet appears once, on the first attempt to save something —
 * not on launch. It is drawn at the page level (a portal), not inside the
 * button: the button usually sits inside a product card that is a link, and
 * a sheet inside that link turned every tap on it, "Allow and save"
 * included, into a trip to the product page, cutting the save short. Asking before anyone has shown interest is a dialog people
 * dismiss without reading; asking at the moment they tap "add" makes the
 * question concrete and the answer meaningful.
 */

function ConsentSheet({
  onDecide,
}: {
  onDecide: (granted: boolean) => void;
}) {
  const { tr } = useLang();
  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/50 p-0"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
      // The phone's Back taps this (see closeTopSheet): the same as tapping outside, "not now".
      data-sheet-close=""
      // React still bubbles portal events up to the card; stop them here.
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onDecide(false);
      }}
    >
      <div className="w-full max-w-lg rounded-t-3xl bg-white p-6" style={{ paddingBottom: 'calc(32px + var(--gm-safe-bottom))' }}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-gray-200" />
        <h2 id="consent-title" className="text-[17px] font-semibold text-gray-900">{tr('Save your list on this phone?', 'I-save ang list mo sa phone na ito?')}</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-gray-600">
          {tr(
            'To keep a request list, Getmeds needs to store the products you choose on this device.',
            'Para magkaroon ka ng request list, kailangang i-save ng Getmeds sa device na ito ang mga produktong pinili mo.',
          )}
        </p>

        <ul className="mt-4 space-y-2.5 text-[13px] text-gray-600">
          <li className="flex gap-2.5">
            <i className="fa-solid fa-mobile-screen mt-0.5 text-[12px]" style={{ color: '#1D9FDA' }} />
            <span>{tr(
              'It stays on this phone. It is not sent to us and will not appear on your other devices.',
              'Mananatili ito sa phone na ito. Hindi ito ipinapadala sa amin at hindi lalabas sa iba mong device.',
            )}</span>
          </li>
          <li className="flex gap-2.5">
            <i className="fa-solid fa-paper-plane mt-0.5 text-[12px]" style={{ color: '#1D9FDA' }} />
            <span>{tr(
              'Nothing reaches Getmeds until you choose to request a quote.',
              "Walang makakarating sa Getmeds hangga't hindi ka humihingi ng quote.",
            )}</span>
          </li>
          <li className="flex gap-2.5">
            <i className="fa-solid fa-trash-can mt-0.5 text-[12px]" style={{ color: '#1D9FDA' }} />
            <span>{tr('You can clear it any time under ', 'Puwede mo itong burahin anumang oras sa ')}<strong>{tr('More → Clear saved data', 'Iba pa → Burahin ang naka-save na data')}</strong>.</span>
          </li>
        </ul>

        <p className="mt-4 text-[11.5px] leading-relaxed text-gray-400">
          {tr(
            'Processed in accordance with the Data Privacy Act of 2012. See our',
            'Pinoproseso alinsunod sa Data Privacy Act of 2012. Tingnan ang aming',
          )}{' '}
          <a href="/privacy-policy" className="underline">Privacy Policy</a>.
        </p>

        <button
          type="button"
          onClick={() => onDecide(true)}
          className="mt-5 w-full rounded-full py-3.5 text-[14px] font-semibold text-white"
          style={{ background: 'linear-gradient(135deg,#1D9FDA,#61A644)' }}
        >
          {tr('Allow and save', 'Payagan at i-save')}
        </button>
        <button
          type="button"
          onClick={() => onDecide(false)}
          className="mt-2 w-full rounded-full py-3 text-[13px] font-semibold text-gray-500"
        >
          {tr('Not now', 'Hindi muna')}
        </button>
      </div>
    </div>,
    document.body
  );
}

/**
 * "Fly to the list": on add, a ghost of the whole product card lifts off and
 * flies into the Requests tab, shrinking steadily along the way until it
 * disappears into the icon — the storefront cue, at full size. Skipped under
 * prefers-reduced-motion, and a missing tab bar (web, desktop) simply means
 * no animation.
 */
function flyToRequests(from: HTMLElement) {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const target =
      document.querySelector<HTMLElement>('.gm-tabbar a[data-tour="requests"] i') ||
      document.querySelector<HTMLElement>('.gm-tabbar a[data-tour="requests"]');
    if (!target || typeof from.animate !== 'function') return;

    // The whole card the button sits in (the grid/featured/similar cards are
    // links); the pinned bar on the product page has no card, so the button
    // itself flies there.
    const card = (from.closest('a[href]') as HTMLElement | null) || from;
    const a = card.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    if (!a.width || !b.width) return;

    const ghost = card.cloneNode(true) as HTMLElement;
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.cssText =
      `position:fixed;z-index:10002;left:${a.left}px;top:${a.top}px;` +
      `width:${a.width}px;height:${a.height}px;margin:0;pointer-events:none;` +
      `border-radius:${getComputedStyle(card).borderRadius || '14px'};overflow:hidden;` +
      'background:#fff;box-shadow:0 12px 32px rgba(23,43,77,.25);will-change:transform,opacity;';
    document.body.appendChild(ghost);

    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const flight = ghost.animate(
      [
        // A small lift first, so the card visibly leaves its slot...
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: 'translate(0,-14px) scale(1.04)', opacity: 1, offset: 0.16 },
        // ...then it travels, shrinking step by step the whole way down...
        { transform: `translate(${dx * 0.45}px, ${dy * 0.35 - 30}px) scale(.55)`, opacity: 0.95, offset: 0.55 },
        { transform: `translate(${dx * 0.8}px, ${dy * 0.75}px) scale(.22)`, opacity: 0.8, offset: 0.8 },
        // ...until it is icon-sized and gone.
        { transform: `translate(${dx}px, ${dy}px) scale(.04)`, opacity: 0.2 },
      ],
      { duration: 780, easing: 'cubic-bezier(.3,.65,.3,1)' },
    );
    flight.onfinish = () => {
      ghost.remove();
      // The Requests icon gives a little bounce as the card lands in it.
      target.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }],
        { duration: 320, easing: 'ease-out' },
      );
    };
    flight.oncancel = () => ghost.remove();
  } catch {
    /* decoration only — never let it break the add itself */
  }
}

export function AddToCart({
  item,
  variant = 'icon',
}: {
  item: Omit<CartItem, 'addedAt'>;
  /** 'glass' is the frosted pill on the home screen's featured cards. */
  variant?: 'icon' | 'full' | 'glass';
}) {
  const { tr } = useLang();
  const [app, setApp] = useState(false);
  const [saved, setSaved] = useState(false);
  const [asking, setAsking] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setApp(isAppMode());
  }, []);

  useEffect(() => {
    if (!app) return;
    let alive = true;
    const check = () => { inCart(item.id).then((v) => { if (alive) setSaved(v); }); };
    check();
    window.addEventListener(CART_CHANGED_EVENT, check);
    return () => { alive = false; window.removeEventListener(CART_CHANGED_EVENT, check); };
  }, [app, item.id]);

  if (!app) return null;

  const toggle = async (e: React.MouseEvent) => {
    // These buttons sit inside cards that are themselves links.
    e.preventDefault();
    e.stopPropagation();
    // Captured before the awaits: React nulls currentTarget after the handler.
    const button = e.currentTarget as HTMLElement;

    if (saved) { await removeFromCart(item.id); return; }

    const result = await addToCart(item);
    if (result === 'needs-consent') setAsking(true);
    else if (result === 'added') flyToRequests(button);
  };

  const decide = async (granted: boolean) => {
    setAsking(false);
    const stored = await setConsent(granted);
    if (!granted) return;
    const result = await addToCart(item);
    if (result === 'failed' || !stored) {
      setNotice(
        result === 'failed'
          ? tr(
              'This phone is not letting Getmeds save your list. Check that site data is allowed for getmeds.ph, then try again.',
              'Hindi pinapayagan ng phone na ito na i-save ng Getmeds ang list mo. Siguraduhing allowed ang site data para sa getmeds.ph, saka subukan ulit.',
            )
          : tr(
              'Added for now. This phone did not keep your choice, so we may ask again next time.',
              'Naidagdag na muna. Hindi na-save ng phone na ito ang pinili mo, kaya baka magtanong ulit kami sa susunod.',
            )
      );
      window.setTimeout(() => setNotice(''), 6000);
    }
  };

  const label = saved ? tr('Remove from list', 'Alisin sa list') : tr('Add to request list', 'Idagdag sa request list');

  return (
    <>
      {variant === 'glass' ? (
        <button
          type="button"
          onClick={toggle}
          aria-label={label}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border px-4 py-2.5 text-[12.5px] font-semibold transition active:scale-95"
          style={
            saved
              ? { borderColor: 'rgba(97,166,68,.35)', color: '#4E8F35', background: 'rgba(97,166,68,.10)' }
              : { borderColor: 'rgba(29,159,218,.28)', color: '#1D9FDA', background: 'rgba(29,159,218,.08)' }
          }
        >
          <i className={`fa-solid ${saved ? 'fa-check' : 'fa-cart-plus'} text-[12px]`} />
          {saved ? tr('In list', 'Nasa list') : tr('Add to list', 'Idagdag')}
        </button>
      ) : variant === 'full' ? (
        <button
          type="button"
          onClick={toggle}
          aria-label={label}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border py-3 text-[13px] font-semibold transition"
          style={
            saved
              ? { borderColor: '#61A644', color: '#61A644', background: '#f4faf1' }
              : { borderColor: '#1D9FDA', color: '#1D9FDA', background: '#fff' }
          }
        >
          <i className={`fa-solid ${saved ? 'fa-check' : 'fa-cart-plus'} text-[13px]`} />
          {saved ? tr('In your list', 'Nasa list mo') : tr('Add to list', 'Idagdag sa list')}
        </button>
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-label={label}
          title={label}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition"
          style={
            saved
              ? { borderColor: '#61A644', color: '#fff', background: '#61A644' }
              : { borderColor: '#dbeafe', color: '#1D9FDA', background: '#fff' }
          }
        >
          <i className={`fa-solid ${saved ? 'fa-check' : 'fa-cart-plus'} text-[13px]`} />
        </button>
      )}

      {asking && <ConsentSheet onDecide={decide} />}
      {notice &&
        createPortal(
          <div
            role="status"
            className="fixed inset-x-4 z-[10001] rounded-2xl bg-gray-900 px-4 py-3 text-[12.5px] leading-snug text-white shadow-lg"
            style={{ bottom: 'calc(96px + var(--gm-safe-bottom))' }}
          >
            {notice}
          </div>,
          document.body
        )}
    </>
  );
}
