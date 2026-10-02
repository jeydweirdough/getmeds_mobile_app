'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Turnstile, useTurnstile } from './turnstile';
import {
  REWARDS_CHANGED_EVENT,
  RewardsError,
  applyReferral,
  fetchSummary,
  inviteLink,
  pendingReferral,
  isSignedIn,
  requestCode,
  signOut,
  verifyCode,
  type PointsSummary,
} from './rewards';

/**
 * PointsCard.tsx
 * ─────────────────────────────────────────────
 * Getmeds Points on the app's account screen: sign in by SMS code, then the
 * balance and what earned it, and referral codes. Balance only — there is
 * nothing to spend points on yet, so nothing here suggests there is.
 *
 * Rendered by account.tsx only when isAppMode(); the website never shows it.
 */

const BRAND = '#1D9FDA';
const GRADIENT = 'linear-gradient(135deg,#1D9FDA,#61A644)';
/** Movider will not send a second code sooner than this. */
const RESEND_SECONDS = 60;

type Step = 'number' | 'code';

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const message = (e: unknown) =>
  e instanceof RewardsError ? e.message : 'Something went wrong. Please try again.';

/**
 * Referral codes: share your own, or add a friend's before your first
 * request. Both sides are paid when that first request is sent, which is
 * said plainly so nobody expects points the moment a code is typed.
 */
function Referral({ summary }: { summary: PointsSummary }) {
  const r = summary.referral;
  const code = summary.account.referralCode;
  const [friendCode, setFriendCode] = useState(pendingReferral);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!r?.enabled) return null;

  const share = async () => {
    const link = inviteLink(code);
    const text = `Get the Getmeds app and add my code ${code} under My account > Getmeds Points. You get ${r.refereePoints} points with your first request.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Getmeds', text, url: link });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${link}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* share sheet closed */
    }
  };

  const add = async () => {
    setError('');
    setBusy(true);
    try {
      await applyReferral(friendCode);
    } catch (e) {
      setError(message(e));
    }
    setBusy(false);
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-xl bg-[#F1F6FC] p-3.5">
        <p className="text-[12.5px] font-semibold text-gray-900">Invite friends, earn {r.referrerPoints} points</p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-gray-500">
          When a friend adds your code and sends their first request, you get {r.referrerPoints} points and they get{' '}
          {r.refereePoints}.
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="flex-1 rounded-lg border border-dashed border-[#1D9FDA] bg-white py-2 text-center text-[16px] font-bold tracking-[0.2em] text-gray-900">
            {code}
          </span>
          <button
            type="button"
            onClick={share}
            className="rounded-full px-4 py-2.5 text-[12.5px] font-semibold text-white"
            style={{ background: GRADIENT }}
          >
            <i className="fa-solid fa-share-nodes mr-1.5 text-[11px]" />
            {copied ? 'Copied' : 'Share'}
          </button>
        </div>
        {r.friendsJoined > 0 && (
          <p className="mt-2 text-[11.5px] text-gray-500">
            {r.friendsJoined} {r.friendsJoined === 1 ? 'friend has' : 'friends have'} joined with your code.
          </p>
        )}
      </div>

      {r.canEnterCode && (
        <form
          className="rounded-xl border border-gray-100 p-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <label htmlFor="friend-code" className="text-[12.5px] font-semibold text-gray-900">
            Have a friend&rsquo;s code?
          </label>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-gray-500">
            Add it before your first request and get {r.refereePoints} welcome points when you send it.
          </p>
          <div className="mt-2.5 flex gap-2">
            <input
              id="friend-code"
              className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-[13px] uppercase tracking-wider outline-none focus:border-[#1D9FDA]"
              placeholder="GM······"
              autoCapitalize="characters"
              maxLength={12}
              value={friendCode}
              onChange={(e) => setFriendCode(e.target.value.toUpperCase())}
            />
            <button
              type="submit"
              disabled={busy || friendCode.replace(/[^A-Za-z0-9]/g, '').length < 8}
              className="rounded-full px-4 text-[12.5px] font-semibold text-white disabled:opacity-50"
              style={{ background: BRAND }}
            >
              {busy ? 'Adding…' : 'Add'}
            </button>
          </div>
          {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
        </form>
      )}

      {r.welcomePending && (
        <p className="rounded-xl bg-[#ECFAF0] px-3.5 py-2.5 text-[11.5px] text-[#357A3F]">
          <i className="fa-solid fa-gift mr-1.5" />
          Friend&rsquo;s code added. Your {r.refereePoints} welcome points arrive with your first request.
        </p>
      )}
    </div>
  );
}

export interface PointsState {
  signedIn: boolean;
  summary: PointsSummary | null;
  loadError: string;
}

/**
 * The signed-in customer's points, kept fresh on REWARDS_CHANGED_EVENT. The
 * account screen calls this once and hands it to both the profile card and
 * this card, so the balance is fetched once per change, not twice.
 */
export function usePoints(): PointsState {
  const [signedIn, setSignedIn] = useState(isSignedIn);
  const [summary, setSummary] = useState<PointsSummary | null>(null);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    const now = isSignedIn();
    setSignedIn(now);
    if (!now) {
      setSummary(null);
      return;
    }
    try {
      setSummary(await fetchSummary());
      setLoadError('');
    } catch (e) {
      setLoadError(message(e));
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener(REWARDS_CHANGED_EVENT, load);
    return () => window.removeEventListener(REWARDS_CHANGED_EVENT, load);
  }, [load]);

  return { signedIn, summary, loadError };
}

/**
 * `bare` drops the card around the sign-in form, for when it is shown inside
 * the account screen's sign-in sheet rather than on the page.
 */
export default function PointsCard({ points, bare = false }: { points: PointsState; bare?: boolean }) {
  const { signedIn, summary, loadError } = points;

  const [step, setStep] = useState<Step>('number');
  const [mobile, setMobile] = useState('');
  const [ticket, setTicket] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

  const turnstile = useTurnstile(!signedIn && step === 'number');

  // The profile page does not ship Cloudflare's script (it has no other
  // form), so fetch it only once someone is actually signing in. The hook
  // above keeps polling until it arrives.
  useEffect(() => {
    if (signedIn || !turnstile.enabled || window.turnstile) return;
    const src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    if (document.querySelector(`script[src="${src}"]`)) return;
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    document.head.appendChild(s);
  }, [signedIn, turnstile.enabled]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  useEffect(() => {
    if (step === 'code') codeInput.current?.focus();
  }, [step]);

  const sendCode = async () => {
    setError('');
    setBusy(true);
    try {
      const r = await requestCode(mobile, turnstile.token);
      setTicket(r.ticket);
      setSentTo(r.mobile);
      setCode('');
      setStep('code');
      setWait(RESEND_SECONDS);
    } catch (e) {
      setError(message(e));
      turnstile.reset();
    }
    setBusy(false);
  };

  const confirm = async (value = code) => {
    if (value.length !== 6 || busy) return;
    setError('');
    setBusy(true);
    try {
      await verifyCode(ticket, value);
      setStep('number');
      setMobile('');
      setCode('');
    } catch (e) {
      setError(message(e));
      setCode('');
    }
    setBusy(false);
  };

  const field =
    'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[13px] text-gray-800 outline-none focus:border-[#1D9FDA]';

  // ── Signed in ──────────────────────────────────────────────────────────────
  if (signedIn) {
    const account = summary?.account;
    return (
      <section id="points" className="mb-5 scroll-mt-4 rounded-[24px] border border-[#EEF1F5] bg-white p-4" aria-label="Getmeds Points">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ background: GRADIENT }}>
            <i className="fa-solid fa-star text-[13px]" />
          </span>
          <p className="flex-1 text-[14px] font-semibold text-gray-900">Getmeds Points</p>
          <span className="rounded-full bg-[#F1F8FE] px-3 py-1 text-[12.5px] font-bold" style={{ color: BRAND }}>
            {account ? account.pointsBalance.toLocaleString('en-PH') : '–'} pts
          </span>
        </div>

        <div>
          {loadError && !summary && <p className="text-[12px] text-red-500">{loadError}</p>}
          {!summary && !loadError && <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />}
          {account && (
            <p className="text-[12px] leading-relaxed text-gray-500">
              {summary.pointsPerRequest > 0
                ? `You earn ${summary.pointsPerRequest} points for every request you send from this app.`
                : 'Points are paused for now. Your balance is kept.'}
            </p>
          )}

          {summary && <Referral summary={summary} />}

          {summary && summary.history.length > 0 && (
            <ul className="mt-3 divide-y divide-gray-50 border-t border-gray-50">
              {summary.history.map((h, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-medium text-gray-800">{h.reason || 'Points'}</p>
                    <p className="text-[11px] text-gray-400">{when(h.date)}</p>
                  </div>
                  <span className={`shrink-0 text-[13px] font-bold ${h.points >= 0 ? 'text-[#357A3F]' : 'text-red-500'}`}>
                    {h.points > 0 ? '+' : ''}
                    {h.points}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {summary && summary.history.length === 0 && (
            <p className="mt-3 rounded-xl bg-[#F1F6FC] px-3.5 py-3 text-[12px] text-gray-500">
              No points yet. Send a request for a medicine and they will show up here.
            </p>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-3">
            <span className="text-[11.5px] text-gray-400">{account?.mobile}</span>
            <button type="button" onClick={signOut} className="text-[12px] font-semibold text-gray-400">
              Sign out of points
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ── Signing in ─────────────────────────────────────────────────────────────
  return (
    <section
      id={bare ? undefined : 'points'}
      className={bare ? '' : 'mb-5 scroll-mt-4 rounded-[24px] border border-[#EEF1F5] bg-white p-4'}
      aria-label="Getmeds Points"
    >
      <div className="flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: '#F1F8FE' }}>
          <i className="fa-solid fa-star text-[16px]" style={{ color: BRAND }} />
        </span>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-gray-900">Getmeds Points</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-gray-500">
            {step === 'number'
              ? 'Earn points for every request you send from the app. Sign in with your mobile number to start.'
              : `Enter the 6-digit code we sent to ${sentTo}.`}
          </p>
        </div>
      </div>

      {step === 'number' ? (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            sendCode();
          }}
        >
          <label className="mb-1.5 block text-[12px] font-medium text-gray-500" htmlFor="points-mobile">
            Mobile number
          </label>
          <input
            id="points-mobile"
            className={field}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0917 123 4567"
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/[^\d+\s\-()]/g, ''))}
          />
          <Turnstile turnstile={turnstile} className="mt-3 w-full max-w-full overflow-x-auto" />
          {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={busy || mobile.replace(/\D/g, '').length < 10 || (turnstile.enabled && !turnstile.token)}
            className="mt-3 w-full rounded-full py-3 text-[13.5px] font-semibold text-white disabled:opacity-50"
            style={{ background: GRADIENT }}
          >
            {busy ? 'Sending…' : 'Send code by SMS'}
          </button>
        </form>
      ) : (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
        >
          <input
            ref={codeInput}
            className={`${field} text-center text-[20px] font-semibold tracking-[0.5em]`}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="6-digit code"
            maxLength={6}
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 6);
              setCode(v);
              // A code filled in from the SMS goes straight through.
              if (v.length === 6) confirm(v);
            }}
          />
          {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="mt-3 w-full rounded-full py-3 text-[13.5px] font-semibold text-white disabled:opacity-50"
            style={{ background: GRADIENT }}
          >
            {busy ? 'Checking…' : 'Confirm'}
          </button>
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setStep('number');
                setError('');
              }}
              className="text-[12px] font-semibold text-gray-400"
            >
              Change number
            </button>
            <button
              type="button"
              disabled={wait > 0}
              onClick={() => {
                // A new code needs a fresh bot check, which lives on the first step.
                setStep('number');
                setError('');
              }}
              className="text-[12px] font-semibold disabled:text-gray-300"
              style={wait > 0 ? undefined : { color: BRAND }}
            >
              {wait > 0 ? `Resend in ${wait}s` : 'Send a new code'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
