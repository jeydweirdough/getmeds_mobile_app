'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { shortDate, useAccountData, type ServerRequest } from '@/lib/accountApi';
import { usePoints } from '@/lib/PointsCard';
import { BRAND, GRADIENT, GROUND } from '@/lib/ui/Screen';
import { goTo } from '@/platform/navigation';

/**
 * chat.tsx
 * ─────────────────────────────────────────────
 * /chat: the Getmeds chatbot on a page of its own. The bot is Tawk.to's AI
 * agent, the same property and widget the website loads from
 * public/components/components.js; a pharmacist picks the conversation up
 * from there.
 *
 * The installed app never loads Tawk on its other pages (it collided with the
 * tab bar), so this page loads it itself and opens it maximized straight
 * away. The floating bubble is never left behind: minimizing the chat hides
 * the widget and goes back to where the customer came from.
 *
 * A signed-in customer's name and number are handed to Tawk so the team does
 * not have to ask. With ?request=<id>, the page shows that request above the
 * chat with a Copy details button, and sends the same summary to the agent as
 * a Tawk event. Every Tawk call is wrapped: it fails quietly on a slow or
 * blocked widget, and the chat itself must still work.
 */

// Same IDs components.js falls back to, overridable the same way.
const TAWK_PROPERTY_ID = '6a8f969fb56df5344af1f3a0';
const TAWK_WIDGET_ID = '1k134u1kt';
const SCRIPT_ID = 'tawk-script-sdk';
/** After this long without Tawk, the page offers the contact form instead. */
const LOAD_TIMEOUT_MS = 12000;

interface TawkApi {
  onLoad?: () => void;
  onChatMinimized?: () => void;
  onChatMaximized?: () => void;
  maximize?: () => void;
  hideWidget?: () => void;
  showWidget?: () => void;
  setAttributes?: (attrs: Record<string, string>, cb?: (error?: unknown) => void) => void;
  addEvent?: (name: string, meta: Record<string, string>, cb?: (error?: unknown) => void) => void;
  visitor?: { name?: string; email?: string };
}

declare global {
  interface Window {
    Tawk_API?: TawkApi;
    Tawk_LoadStart?: Date;
    TAWK_PROPERTY_ID?: string;
    TAWK_WIDGET_ID?: string;
  }
}

/** Runs a Tawk call, ignoring any failure: the widget is not ours to fix. */
const tawk = (fn: (api: TawkApi) => void) => {
  try {
    if (window.Tawk_API) fn(window.Tawk_API);
  } catch {
    /* Tawk not ready or blocked; the chat still works without it */
  }
};

/** Tawk's methods only exist once its script has run. */
const tawkReady = () => typeof window.Tawk_API?.maximize === 'function';

/** Back to the previous page when it was ours, otherwise to the app's home. */
function goBack() {
  let sameSite = false;
  try {
    sameSite = Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin;
  } catch {
    /* unreadable referrer: treat as arriving from outside */
  }
  if (sameSite && window.history.length > 1) window.history.back();
  else goTo('/app-home');
}

/** The short text a customer pastes into the chat, and the agent's event. */
function describeRequest(r: ServerRequest) {
  const items = r.items.map((i) => [i.name, i.strength, i.form].filter(Boolean).join(' ')).join(', ');
  return {
    type: r.inquiryType || 'Request',
    date: shortDate(r.createdAt),
    items,
    text: [
      `About my request: ${r.inquiryType || 'Request'}, sent ${shortDate(r.createdAt)}`,
      items ? `Items: ${items}` : '',
      r.patientName ? `Patient: ${r.patientName}` : '',
      `Reference: ${r._id}`,
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

type LoadState = 'loading' | 'ready' | 'failed';

function Chat() {
  const requestId = useMemo(() => new URLSearchParams(window.location.search).get('request') || '', []);
  const { data } = useAccountData();
  const { signedIn, summary } = usePoints();
  const [state, setState] = useState<LoadState>(tawkReady() ? 'ready' : 'loading');
  const [chatOpen, setChatOpen] = useState(false);
  const [copied, setCopied] = useState('');

  const request = requestId ? data?.requests.find((r) => r._id === requestId) : undefined;
  const context = request ? describeRequest(request) : null;
  // Read by the Tawk callbacks, which are set once and outlive renders.
  const hasContext = useRef(false);
  hasContext.current = Boolean(requestId);

  // ── Load Tawk and open it ────────────────────────────────────────────────
  useEffect(() => {
    const open = () => {
      setState('ready');
      tawk((api) => {
        api.showWidget?.();
        api.maximize?.();
      });
    };

    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = window.Tawk_LoadStart || new Date();
    const api = window.Tawk_API;
    api.onLoad = open;
    api.onChatMaximized = () => setChatOpen(true);
    api.onChatMinimized = () => {
      setChatOpen(false);
      // Never leave the floating bubble on the page. With a request on
      // screen the customer may want to copy it, so stay; otherwise the chat
      // was the whole point of the page, and closing it means leaving.
      tawk((a) => a.hideWidget?.());
      if (!hasContext.current) goBack();
    };

    if (tawkReady()) {
      // components.js got there first and the widget is already up.
      open();
    } else if (!document.getElementById(SCRIPT_ID)) {
      const propertyId =
        window.TAWK_PROPERTY_ID || document.querySelector<HTMLMetaElement>('meta[name="tawk-property-id"]')?.content || TAWK_PROPERTY_ID;
      const widgetId =
        window.TAWK_WIDGET_ID || document.querySelector<HTMLMetaElement>('meta[name="tawk-widget-id"]')?.content || TAWK_WIDGET_ID;
      const s = document.createElement('script');
      s.id = SCRIPT_ID;
      s.async = true;
      s.src = `https://embed.tawk.to/${propertyId}/${widgetId}`;
      s.charset = 'UTF-8';
      s.setAttribute('crossorigin', '*');
      s.onerror = () => setState('failed');
      document.head.appendChild(s);
    }

    const timer = window.setTimeout(() => {
      if (!tawkReady()) setState('failed');
    }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // ── Tell the agent who this is ───────────────────────────────────────────
  const attributesSent = useRef(false);
  useEffect(() => {
    if (state !== 'ready' || !signedIn || attributesSent.current) return;
    const profile = data?.profile;
    const name = profile?.name || summary?.account.name || '';
    const phone = profile?.phone || '';
    const email = profile?.email || '';
    if (!name && !phone && !email) return;
    attributesSent.current = true;
    const attrs: Record<string, string> = {};
    if (name) attrs.name = name;
    if (email) attrs.email = email;
    if (phone) attrs.phone = phone;
    tawk((api) => api.setAttributes?.(attrs, () => undefined));
  }, [state, signedIn, data, summary]);

  // ── And which request it is about ────────────────────────────────────────
  const eventSent = useRef(false);
  useEffect(() => {
    if (state !== 'ready' || !request || eventSent.current) return;
    eventSent.current = true;
    const c = describeRequest(request);
    tawk((api) =>
      api.addEvent?.('request-context', { request: request._id, type: c.type, date: c.date, items: c.items.slice(0, 250) }, () => undefined)
    );
  }, [state, request]);

  const openChat = () =>
    tawk((api) => {
      api.showWidget?.();
      api.maximize?.();
    });

  // writeText runs straight from the tap, which is what browsers require.
  const copy = async () => {
    if (!context) return;
    try {
      await navigator.clipboard.writeText(context.text);
      setCopied('Copied. Paste it into the chat.');
    } catch {
      setCopied('This phone did not allow copying. Type the request details into the chat instead.');
    }
    window.setTimeout(() => setCopied(''), 3000);
  };

  return (
    <div className="min-h-screen" style={{ background: GROUND }}>
      <header
        className="sticky top-0 z-40 flex items-center gap-2 border-b border-[#E7ECF2] bg-white px-2 pb-2.5"
        style={{ paddingTop: 'calc(10px + env(safe-area-inset-top, 0px))' }}
      >
        <button type="button" onClick={goBack} aria-label="Back" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-700">
          <i className="fa-solid fa-arrow-left text-[16px]" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[16px] font-semibold text-gray-900">Chat with Getmeds</h1>
          <p className="truncate text-[11.5px] text-gray-500">Our assistant answers right away; a pharmacist follows up</p>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 pb-8 pt-5">
        {/* The request this chat is about */}
        {requestId && signedIn && (
          <section className="rounded-[20px] border border-[#EEF1F5] bg-white p-4" aria-label="Request you are asking about">
            {!data ? (
              <div className="space-y-2" aria-busy="true">
                <div className="h-4 w-1/2 animate-pulse rounded bg-gray-100" />
                <div className="h-3.5 w-3/4 animate-pulse rounded bg-gray-100" />
              </div>
            ) : context ? (
              <>
                <p className="text-[11.5px] font-medium text-gray-500">Asking about</p>
                <p className="mt-0.5 text-[14px] font-semibold text-gray-900">
                  {context.type} <span className="font-normal text-gray-500">· {context.date}</span>
                </p>
                {context.items && <p className="mt-1 text-[12.5px] leading-snug text-gray-600">{context.items}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    id="chat-copy-details"
                    type="button"
                    onClick={copy}
                    className="rounded-full bg-[#F1F8FE] px-3.5 py-1.5 text-[12.5px] font-semibold text-[#1D9FDA]"
                  >
                    <i className="fa-solid fa-copy mr-1.5 text-[11px]" />
                    Copy details
                  </button>
                  {state === 'ready' && !chatOpen && (
                    <button
                      id="chat-open-with-request"
                      type="button"
                      onClick={openChat}
                      className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-white"
                      style={{ background: GRADIENT }}
                    >
                      Open chat
                    </button>
                  )}
                </div>
                {copied && (
                  <p className="mt-2 text-[12px] text-gray-500" role="status">
                    {copied}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[12.5px] leading-snug text-gray-500">
                We could not find that request on your account. Tell us in the chat which medicine it was for.
              </p>
            )}
          </section>
        )}

        {/* The chat's own state */}
        {state === 'loading' && (
          <div className="flex items-center gap-3 rounded-[20px] border border-[#EEF1F5] bg-white p-4" aria-busy="true">
            <i className="fa-solid fa-circle-notch fa-spin text-[16px]" style={{ color: BRAND }} />
            <p className="text-[13px] text-gray-600">Opening the chat…</p>
          </div>
        )}

        {state === 'ready' && !chatOpen && (
          <div className="rounded-[20px] border border-[#EEF1F5] bg-white px-6 py-8 text-center">
            <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F6FC]">
              <i className="fa-solid fa-comments text-[18px]" style={{ color: BRAND }} />
            </span>
            <p className="text-[14px] font-semibold text-gray-900">Ask us anything about a medicine</p>
            <p className="mx-auto mt-1.5 max-w-[300px] text-[12.5px] leading-relaxed text-gray-500">
              Availability, strengths, or a request you already sent. Tap below to open the chat again.
            </p>
            <button
              id="chat-open"
              type="button"
              onClick={openChat}
              className="mx-auto mt-4 block w-full max-w-[240px] rounded-full py-3.5 text-[14px] font-semibold text-white"
              style={{ background: GRADIENT }}
            >
              Open chat
            </button>
          </div>
        )}

        {state === 'failed' && (
          <div className="rounded-[20px] border border-[#EEF1F5] bg-white px-6 py-8 text-center">
            <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F6FC]">
              <i className="fa-solid fa-comment-slash text-[18px]" style={{ color: BRAND }} />
            </span>
            <p className="text-[14px] font-semibold text-gray-900">The chat did not load</p>
            <p className="mx-auto mt-1.5 max-w-[300px] text-[12.5px] leading-relaxed text-gray-500">
              Your connection may be slow, or a blocker may be stopping it. Send us a message instead and our team will
              reply.
            </p>
            <a
              href="/contact-us"
              className="mx-auto mt-4 block w-full max-w-[240px] rounded-full py-3.5 text-[14px] font-semibold text-white"
              style={{ background: GRADIENT }}
            >
              Contact us
            </a>
            <button
              id="chat-retry"
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 w-full py-2 text-[13px] font-semibold text-gray-500"
            >
              Try again
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * chat.html mounted this page in the browser only (an empty #root), and it
 * reads the query string and the points session during its first render, so
 * it is mounted after hydration here too.
 */
export default function ChatClient() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // The tinted ground chat.html set on <body>, painted before mount as well.
  return mounted ? <Chat /> : <div className="min-h-screen" style={{ background: GROUND }} />;
}
