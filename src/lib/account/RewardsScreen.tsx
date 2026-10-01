'use client';

import React, { useState } from 'react';
import { BRAND, Card, Empty, ErrorNote, ListRow, PrimaryButton, Screen, Sheet, SmallButton, GRADIENT } from '../ui/Screen';
import { redeemReward, shortDate, useAccountData, type Redemption, type Reward } from '../accountApi';
import { usePoints } from '../PointsCard';

/**
 * RewardsScreen.tsx
 * ─────────────────────────────────────────────
 * What Getmeds Points buy. The catalogue is kept in Sanity Studio and only
 * active rewards reach the app. Redeeming takes the points at once and hands
 * back a code (RW-XXXXXX) the customer quotes with their next request; our
 * team then marks it Given, or Cancelled, which returns the points overnight.
 *
 * There is no checkout and no money here: a reward is applied by our team to
 * a request, never paid for in the app.
 */

const pts = (n: number) => `${n.toLocaleString('en-PH')} ${n === 1 ? 'point' : 'points'}`;

const STATUS: Record<Redemption['status'], { label: string; cls: string }> = {
  requested: { label: 'Requested', cls: 'bg-[#F1F8FE] text-[#1D9FDA]' },
  applied: { label: 'Given', cls: 'bg-[#ECFAF0] text-[#357A3F]' },
  cancelled: { label: 'Cancelled: points returned', cls: 'bg-gray-100 text-gray-500' },
};

export default function RewardsScreen({ onClose }: { onClose: () => void }) {
  const { summary, loadError: pointsError } = usePoints();
  const { data, error: loadError, reload } = useAccountData();
  const [picked, setPicked] = useState<Reward | null>(null);

  const balance = summary?.account.pointsBalance;
  const rewards = [...(data?.rewards ?? [])].sort((a, b) => a.pointsCost - b.pointsCost);
  const redemptions = data?.redemptions ?? [];

  // Ways to earn, from what the backend says is switched on. A 0 means off.
  const ways = summary
    ? [
        { icon: 'fa-paper-plane', title: 'Send a request', detail: 'For every request you send from this app', points: summary.pointsPerRequest },
        { icon: 'fa-user-plus', title: 'Invite friends', detail: 'When a friend adds your code and sends their first request', points: summary.referral?.enabled ? summary.referral.referrerPoints : 0 },
        { icon: 'fa-id-card', title: 'Complete My details', detail: 'Once, when your details are filled in', points: summary.bonuses?.profile ?? 0 },
        { icon: 'fa-clock-rotate-left', title: 'Refill on time', detail: 'When you request a refill by its reminder date', points: summary.bonuses?.refill ?? 0 },
      ].filter((w) => w.points > 0)
    : [];

  return (
    <Screen title="Rewards" subtitle="Use your Getmeds Points" onClose={onClose}>
      {/* Balance */}
      <div className="rounded-[20px] p-4 text-white" style={{ background: GRADIENT }}>
        <p className="text-[12px] font-medium text-white/80">Your balance</p>
        {balance === undefined ? (
          pointsError ? (
            <p className="mt-1 text-[13px]">{pointsError}</p>
          ) : (
            <div className="mt-2 h-7 w-32 animate-pulse rounded-lg bg-white/30" />
          )
        ) : (
          <p className="mt-0.5 text-[28px] font-bold leading-tight">{pts(balance)}</p>
        )}
      </div>

      {!data ? (
        loadError ? (
          <div className="space-y-3">
            <ErrorNote text={`${loadError} Check your connection and try again.`} />
            <SmallButton onClick={() => reload()}>Try again</SmallButton>
          </div>
        ) : (
          <div className="space-y-2.5" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[96px] animate-pulse rounded-[20px] bg-white" />
            ))}
          </div>
        )
      ) : (
        <>
          {/* Catalogue */}
          {rewards.length === 0 ? (
            <Empty
              icon="fa-gift"
              title="Rewards are coming soon"
              text="Keep earning points with your requests. Your balance is kept, and rewards will show here when they are ready."
            />
          ) : (
            <section className="space-y-2">
              <h2 className="px-1 text-[13px] font-semibold text-gray-900">Rewards you can get</h2>
              <div className="space-y-2.5">
                {rewards.map((r) => (
                  <RewardCard key={r._id} reward={r} balance={balance} onRedeem={() => setPicked(r)} />
                ))}
              </div>
            </section>
          )}

          {/* Redemptions */}
          {redemptions.length > 0 && (
            <Card title="My rewards" note="Show the code to our team when you send your next request.">
              {redemptions.map((r) => (
                <div key={r._id} className="border-t border-[#EEF1F5] px-4 py-3.5 first:border-t-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-gray-900">{r.rewardTitle}</p>
                      <p className="mt-0.5 text-[12px] text-gray-500">
                        {pts(r.pointsCost)} · {shortDate(r.createdAt)}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS[r.status]?.cls ?? STATUS.requested.cls}`}>
                      {STATUS[r.status]?.label ?? 'Requested'}
                    </span>
                  </div>
                  <p className="mt-2 inline-block rounded-lg border border-dashed border-[#1D9FDA] px-2.5 py-1 text-[13px] font-bold tracking-[0.15em] text-gray-900">
                    {r.code}
                  </p>
                  {r.note && <p className="mt-1.5 text-[12px] leading-snug text-gray-500">{r.note}</p>}
                </div>
              ))}
            </Card>
          )}
        </>
      )}

      {/* Ways to earn */}
      {ways.length > 0 && (
        <Card title="Ways to earn">
          {ways.map((w) => (
            <ListRow key={w.title} icon={w.icon} title={w.title} detail={w.detail} hint={<span className="font-semibold text-[#357A3F]">+{w.points}</span>} />
          ))}
        </Card>
      )}

      {/* History */}
      {summary && (
        <Card title="Points history">
          {summary.history.length === 0 ? (
            <p className="px-4 py-3.5 text-[12.5px] text-gray-500">No points yet. Send a request for a medicine and they will show up here.</p>
          ) : (
            summary.history.map((h, i) => (
              <div key={i} className="flex items-center justify-between gap-3 border-t border-[#EEF1F5] px-4 py-3 first:border-t-0">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-gray-800">{h.reason || 'Points'}</p>
                  <p className="text-[11px] text-gray-400">{shortDate(h.date)}</p>
                </div>
                <span className={`shrink-0 text-[13px] font-bold ${h.points >= 0 ? 'text-[#357A3F]' : 'text-red-500'}`}>
                  {h.points > 0 ? '+' : ''}
                  {h.points}
                </span>
              </div>
            ))
          )}
        </Card>
      )}

      {picked && <RedeemSheet reward={picked} balance={balance ?? 0} onClose={() => setPicked(null)} />}
    </Screen>
  );
}

/** One catalogue entry, with how far the balance is from it. */
function RewardCard({ reward, balance, onRedeem }: { reward: Reward; balance?: number; onRedeem: () => void }) {
  const have = balance ?? 0;
  const affordable = balance !== undefined && have >= reward.pointsCost;
  const progress = reward.pointsCost > 0 ? Math.min(100, Math.round((have / reward.pointsCost) * 100)) : 100;

  return (
    <div className="rounded-[20px] border border-[#EEF1F5] bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F8FE]">
          <i className="fa-solid fa-gift text-[14px]" style={{ color: BRAND }} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-gray-900">{reward.title}</p>
          {reward.description && <p className="mt-0.5 text-[12px] leading-snug text-gray-500">{reward.description}</p>}
          <p className="mt-1.5 text-[12.5px] font-bold" style={{ color: BRAND }}>
            {pts(reward.pointsCost)}
          </p>
        </div>
      </div>

      {!affordable && balance !== undefined && (
        <div className="mt-3">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-[#EEF1F5]"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${reward.title} progress`}
          >
            <div className="h-full rounded-full" style={{ width: `${progress}%`, background: GRADIENT }} />
          </div>
          <p className="mt-1.5 text-[11.5px] text-gray-500">{pts(reward.pointsCost - have)} to go</p>
        </div>
      )}

      <button
        id={`redeem-${reward._id}`}
        type="button"
        disabled={!affordable}
        onClick={onRedeem}
        className="mt-3 w-full rounded-full py-2.5 text-[13px] font-semibold disabled:bg-[#F1F5F9] disabled:text-gray-400"
        style={affordable ? { background: GRADIENT, color: '#fff' } : undefined}
      >
        Redeem
      </button>
    </div>
  );
}

/** Confirm, then show the code big enough to read out. */
function RedeemSheet({ reward, balance, onClose }: { reward: Reward; balance: number; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [result, setResult] = useState<{ code: string; balance: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const redeem = async () => {
    setBusy(true);
    setFailure('');
    try {
      setResult(await redeemReward(reward._id));
    } catch (e) {
      // The server's own words ("You need 30 points for this. You have 5.")
      // and the offline message from rewards.ts both already say what to do.
      setFailure((e as Error)?.message || 'Could not redeem. Try again in a moment.');
    }
    setBusy(false);
  };

  // writeText runs straight from the tap, which is what browsers require.
  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailure('This phone did not allow copying. Write the code down instead.');
    }
  };

  if (result) {
    return (
      <Sheet title="Reward ready" onClose={onClose}>
        <div className="rounded-[20px] border border-[#EEF1F5] bg-white p-5 text-center">
          <p className="text-[13px] font-semibold text-gray-900">{reward.title}</p>
          <p className="mt-3 select-all text-[30px] font-bold tracking-[0.18em] text-gray-900" aria-label={`Your code is ${result.code}`}>
            {result.code}
          </p>
          <p className="mx-auto mt-2 max-w-[280px] text-[12.5px] leading-relaxed text-gray-500">
            Show this code to our team when you send your next request.
          </p>
          <button
            id="reward-copy-code"
            type="button"
            onClick={copy}
            className="mt-4 rounded-full bg-[#F1F8FE] px-4 py-2 text-[12.5px] font-semibold text-[#1D9FDA]"
          >
            <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'} mr-1.5 text-[11px]`} />
            {copied ? 'Copied' : 'Copy code'}
          </button>
          <p className="mt-3 text-[11.5px] text-gray-400">New balance: {pts(result.balance)}</p>
        </div>
        <ErrorNote text={failure} />
        <PrimaryButton onClick={onClose}>Done</PrimaryButton>
      </Sheet>
    );
  }

  return (
    <Sheet title="Redeem this reward?" onClose={busy ? () => undefined : onClose}>
      <div className="rounded-[20px] border border-[#EEF1F5] bg-white p-4">
        <p className="text-[14px] font-semibold text-gray-900">{reward.title}</p>
        {reward.description && <p className="mt-1 text-[12.5px] leading-snug text-gray-500">{reward.description}</p>}
        <div className="mt-3 space-y-1.5 border-t border-[#EEF1F5] pt-3 text-[12.5px]">
          <p className="flex justify-between text-gray-600">
            <span>Cost</span>
            <span className="font-semibold text-gray-900">{pts(reward.pointsCost)}</span>
          </p>
          <p className="flex justify-between text-gray-600">
            <span>Balance after</span>
            <span className="font-semibold text-gray-900">{pts(Math.max(0, balance - reward.pointsCost))}</span>
          </p>
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-gray-500">
          The points come off now and you get a code. If our team cancels it, the points come back overnight.
        </p>
      </div>
      <ErrorNote text={failure} />
      <PrimaryButton onClick={redeem} disabled={busy}>
        {busy ? 'Redeeming…' : `Redeem for ${pts(reward.pointsCost)}`}
      </PrimaryButton>
      <button id="redeem-cancel" type="button" disabled={busy} onClick={onClose} className="w-full py-2 text-[13px] font-semibold text-gray-500 disabled:opacity-50">
        Not now
      </button>
    </Sheet>
  );
}
