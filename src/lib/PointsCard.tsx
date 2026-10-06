'use client';

import React, { useCallback, useEffect, useState } from 'react';
import AuthForm, { type AuthMode } from './AuthForm';
import { translate, useLang } from '@/lib/i18n';
import {
  REWARDS_CHANGED_EVENT,
  RewardsError,
  applyReferral,
  fetchSummary,
  inviteLink,
  pendingReferral,
  isSignedIn,
  signOut,
  type PointsSummary,
} from './rewards';

/**
 * PointsCard.tsx
 * ─────────────────────────────────────────────
 * Getmeds Points on the app's account screen: Log in / Sign up (AuthForm),
 * then the balance and what earned it, and referral codes. Balance only — there is
 * nothing to spend points on yet, so nothing here suggests there is.
 *
 * Rendered by account.tsx only when isAppMode(); the website never shows it.
 */

const BRAND = '#1D9FDA';
const GRADIENT = 'linear-gradient(135deg,#1D9FDA,#61A644)';
const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const message = (e: unknown) =>
  e instanceof RewardsError ? e.message : translate('Something went wrong. Please try again.', 'May nangyaring mali. Pakisubukan ulit.');

/**
 * Referral codes: share your own, or add a friend's before your first
 * request. Both sides are paid when that first request is sent, which is
 * said plainly so nobody expects points the moment a code is typed.
 */
function Referral({ summary }: { summary: PointsSummary }) {
  const { tr } = useLang();
  const r = summary.referral;
  const code = summary.account.referralCode;
  const [friendCode, setFriendCode] = useState(pendingReferral);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!r?.enabled) return null;

  const share = async () => {
    const link = inviteLink(code);
    const text = tr(
      `Get the Getmeds app and add my code ${code} under My account > Getmeds Points. You get ${r.refereePoints} points with your first request.`,
      `I-download ang Getmeds app at ilagay ang code kong ${code} sa My account > Getmeds Points. Makakakuha ka ng ${r.refereePoints} points sa una mong request.`,
    );
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
        <p className="text-[12.5px] font-medium text-gray-900">
          {tr(`Invite friends, earn ${r.referrerPoints} points`, `Mag-imbita ng kaibigan, kumita ng ${r.referrerPoints} points`)}
        </p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-gray-500">
          {tr(
            `When a friend adds your code and sends their first request, you get ${r.referrerPoints} points and they get ${r.refereePoints}.`,
            `Kapag inilagay ng kaibigan mo ang code mo at nagpadala siya ng unang request, makakakuha ka ng ${r.referrerPoints} points at siya ng ${r.refereePoints}.`,
          )}
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="flex-1 rounded-lg border border-dashed border-[#1D9FDA] bg-white py-2 text-center text-[16px] font-medium tracking-[0.2em] text-gray-900">
            {code}
          </span>
          <button
            type="button"
            onClick={share}
            className="rounded-full px-4 py-2.5 text-[12.5px] font-medium text-white"
            style={{ background: GRADIENT }}
          >
            <i className="fa-solid fa-share-nodes mr-1.5 text-[11px]" />
            {copied ? tr('Copied', 'Nakopya na') : tr('Share', 'I-share')}
          </button>
        </div>
        {r.friendsJoined > 0 && (
          <p className="mt-2 text-[11.5px] text-gray-500">
            {tr(
              `${r.friendsJoined} ${r.friendsJoined === 1 ? 'friend has' : 'friends have'} joined with your code.`,
              `${r.friendsJoined} kaibigan na ang sumali gamit ang code mo.`,
            )}
          </p>
        )}
      </div>

      {r.canEnterCode && (
        <form
          className="rounded-xl bg-[#F7F9FC] p-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <label htmlFor="friend-code" className="text-[12.5px] font-medium text-gray-900">
            {tr('Have a friend’s code?', 'May code ka ba ng kaibigan?')}
          </label>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-gray-500">
            {tr(
              `Add it before your first request and get ${r.refereePoints} welcome points when you send it.`,
              `Ilagay ito bago ang una mong request at makakuha ng ${r.refereePoints} welcome points pagkapadala mo.`,
            )}
          </p>
          <div className="mt-2.5 flex gap-2">
            <input
              id="friend-code"
              className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] uppercase tracking-wider outline-none focus:border-[#1D9FDA]"
              placeholder="GM······"
              autoCapitalize="characters"
              maxLength={12}
              value={friendCode}
              onChange={(e) => setFriendCode(e.target.value.toUpperCase())}
            />
            <button
              type="submit"
              disabled={busy || friendCode.replace(/[^A-Za-z0-9]/g, '').length < 8}
              className="rounded-full px-4 text-[12.5px] font-medium text-white disabled:opacity-50"
              style={{ background: BRAND }}
            >
              {busy ? tr('Adding…', 'Idinadagdag…') : tr('Add', 'Idagdag')}
            </button>
          </div>
          {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
        </form>
      )}

      {r.welcomePending && (
        <p className="rounded-xl bg-[#ECFAF0] px-3.5 py-2.5 text-[11.5px] text-[#357A3F]">
          <i className="fa-solid fa-gift mr-1.5" />
          {tr(
            `Friend’s code added. Your ${r.refereePoints} welcome points arrive with your first request.`,
            `Naidagdag na ang code ng kaibigan. Darating ang ${r.refereePoints} welcome points mo kasabay ng una mong request.`,
          )}
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
 * `bare` drops the card around the sign-in form and lays it out as a full
 * page, for when it is shown inside SignInSheet rather than on the page.
 */
export default function PointsCard({
  points,
  bare = false,
  initialMode = 'signup',
  intro,
  onGuest,
}: {
  points: PointsState;
  bare?: boolean;
  /** Which form a logged-out visitor sees first. */
  initialMode?: AuthMode;
  /** Replaces the sign-up form's opening line, e.g. to say why an account is needed here. */
  intro?: string;
  /** Shows "Continue as guest" under the Log in button. */
  onGuest?: () => void;
}) {
  const { tr } = useLang();
  const { signedIn, summary, loadError } = points;

  // ── Signed in ──────────────────────────────────────────────────────────────
  if (signedIn) {
    const account = summary?.account;
    return (
      <section id="points" className="mb-5 scroll-mt-4 rounded-[24px] bg-white p-4" aria-label="Getmeds Points">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ background: GRADIENT }}>
            <i className="fa-solid fa-star text-[13px]" />
          </span>
          <p className="flex-1 text-[14px] font-medium text-gray-900">Getmeds Points</p>
          <span className="rounded-full bg-[#F1F8FE] px-3 py-1 text-[12.5px] font-medium" style={{ color: BRAND }}>
            {account ? account.pointsBalance.toLocaleString('en-PH') : '–'} pts
          </span>
        </div>

        <div>
          {loadError && !summary && <p className="text-[12px] text-red-500">{loadError}</p>}
          {!summary && !loadError && <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />}
          {account && (
            <p className="text-[12px] leading-relaxed text-gray-500">
              {summary.pointsPerRequest > 0
                ? tr(
                    `You earn ${summary.pointsPerRequest} points for every request you send from this app.`,
                    `Kumikita ka ng ${summary.pointsPerRequest} points sa bawat request na ipinapadala mo mula sa app na ito.`,
                  )
                : tr('Points are paused for now. Your balance is kept.', 'Naka-pause muna ang points. Nananatili ang balance mo.')}
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
                  <span className={`shrink-0 text-[13px] font-medium ${h.points >= 0 ? 'text-[#357A3F]' : 'text-red-500'}`}>
                    {h.points > 0 ? '+' : ''}
                    {h.points}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {summary && summary.history.length === 0 && (
            <p className="mt-3 rounded-xl bg-[#F1F6FC] px-3.5 py-3 text-[12px] text-gray-500">
              {tr(
                'No points yet. Send a request for a medicine and they will show up here.',
                'Wala ka pang points. Magpadala ng request para sa gamot at lalabas sila rito.',
              )}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between border-t border-gray-50 pt-3">
            <span className="text-[11.5px] text-gray-400">{account?.login || account?.mobile}</span>
            <button type="button" onClick={signOut} className="text-[12px] font-medium text-gray-400">
              {tr('Log out', 'Mag-log out')}
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ── Logged out: Log in / Sign up / Forgot password ──────────────────────────
  return (
    <section
      id={bare ? undefined : 'points'}
      className={bare ? '' : 'mb-5 scroll-mt-4 rounded-[24px] bg-white p-4'}
      aria-label="Getmeds account"
    >
      <AuthForm initialMode={initialMode} intro={intro} screen={bare} onGuest={onGuest} />
    </section>
  );
}
