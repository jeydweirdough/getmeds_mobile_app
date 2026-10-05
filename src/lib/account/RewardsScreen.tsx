'use client';

import React, { useState } from 'react';
import { BRAND, Card, Empty, ErrorNote, ListRow, PrimaryButton, Screen, Sheet, SmallButton, GRADIENT } from '../ui/Screen';
import { redeemReward, shortDate, useAccountData, type Redemption, type Reward } from '../accountApi';
import { usePoints } from '../PointsCard';
import { useLang } from '../i18n';

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

const STATUS: Record<Redemption['status'], { label: string; labelTl: string; cls: string }> = {
  requested: { label: 'Requested', labelTl: 'Na-request', cls: 'bg-[#F1F8FE] text-[#1D9FDA]' },
  applied: { label: 'Given', labelTl: 'Naibigay', cls: 'bg-[#ECFAF0] text-[#357A3F]' },
  cancelled: { label: 'Cancelled: points returned', labelTl: 'Kinansela: ibinalik ang points', cls: 'bg-gray-100 text-gray-500' },
};

export default function RewardsScreen({ onClose }: { onClose: () => void }) {
  const { tr } = useLang();
  const { summary, loadError: pointsError } = usePoints();
  const { data, error: loadError, reload } = useAccountData();
  const [picked, setPicked] = useState<Reward | null>(null);

  const balance = summary?.account.pointsBalance;
  const rewards = [...(data?.rewards ?? [])].sort((a, b) => a.pointsCost - b.pointsCost);
  const redemptions = data?.redemptions ?? [];

  // Ways to earn, from what the backend says is switched on. A 0 means off.
  const ways = summary
    ? [
        {
          key: 'request',
          icon: 'fa-paper-plane',
          title: tr('Send a request', 'Magpadala ng request'),
          detail: tr('For every request you send from this app', 'Sa bawat request na ipapadala mo mula sa app na ito'),
          points: summary.pointsPerRequest,
        },
        {
          key: 'referral',
          icon: 'fa-user-plus',
          title: tr('Invite friends', 'Mag-imbita ng kaibigan'),
          detail: tr(
            'When a friend adds your code and sends their first request',
            'Kapag inilagay ng kaibigan ang code mo at nagpadala ng una niyang request'
          ),
          points: summary.referral?.enabled ? summary.referral.referrerPoints : 0,
        },
        {
          key: 'profile',
          icon: 'fa-id-card',
          title: tr('Complete My details', 'Kumpletuhin ang Mga detalye ko'),
          detail: tr('Once, when your details are filled in', 'Isang beses, kapag kumpleto na ang detalye mo'),
          points: summary.bonuses?.profile ?? 0,
        },
        {
          key: 'refill',
          icon: 'fa-clock-rotate-left',
          title: tr('Refill on time', 'Mag-refill sa tamang oras'),
          detail: tr('When you request a refill by its reminder date', 'Kapag nag-request ka ng refill hanggang sa petsa ng reminder'),
          points: summary.bonuses?.refill ?? 0,
        },
      ].filter((w) => w.points > 0)
    : [];

  return (
    <Screen title={tr('Rewards', 'Rewards')} subtitle={tr('Use your Getmeds Points', 'Gamitin ang iyong Getmeds Points')} onClose={onClose}>
      {/* Balance */}
      <div className="rounded-[20px] p-4 text-white" style={{ background: GRADIENT }}>
        <p className="text-[12px] font-medium text-white/80">{tr('Your balance', 'Ang balance mo')}</p>
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
            <ErrorNote text={tr(`${loadError} Check your connection and try again.`, `${loadError} Tingnan ang iyong connection at subukan ulit.`)} />
            <SmallButton onClick={() => reload()}>{tr('Try again', 'Subukan ulit')}</SmallButton>
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
              title={tr('Rewards are coming soon', 'Malapit na ang rewards')}
              text={tr(
                'Keep earning points with your requests. Your balance is kept, and rewards will show here when they are ready.',
                'Patuloy na mag-ipon ng points sa iyong mga request. Nakatabi ang balance mo, at lalabas dito ang rewards kapag handa na.'
              )}
            />
          ) : (
            <section className="space-y-2">
              <h2 className="px-1 text-[13px] font-semibold text-gray-900">{tr('Rewards you can get', 'Mga reward na puwede mong makuha')}</h2>
              <div className="space-y-2.5">
                {rewards.map((r) => (
                  <RewardCard key={r._id} reward={r} balance={balance} onRedeem={() => setPicked(r)} />
                ))}
              </div>
            </section>
          )}

          {/* Redemptions */}
          {redemptions.length > 0 && (
            <Card
              title={tr('My rewards', 'Mga reward ko')}
              note={tr('Show the code to our team when you send your next request.', 'Ipakita ang code sa aming team sa susunod mong request.')}
            >
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
                      {STATUS[r.status] ? tr(STATUS[r.status].label, STATUS[r.status].labelTl) : tr('Requested', 'Na-request')}
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
        <Card title={tr('Ways to earn', 'Paano kumita ng points')}>
          {ways.map((w) => (
            <ListRow key={w.key} icon={w.icon} title={w.title} detail={w.detail} hint={<span className="font-semibold text-[#357A3F]">+{w.points}</span>} />
          ))}
        </Card>
      )}

      {/* History */}
      {summary && (
        <Card title={tr('Points history', 'History ng points')}>
          {summary.history.length === 0 ? (
            <p className="px-4 py-3.5 text-[12.5px] text-gray-500">{tr(
                'No points yet. Send a request for a medicine and they will show up here.',
                'Wala ka pang points. Magpadala ng request para sa gamot at lalabas ang mga ito rito.'
              )}
            </p>
          ) : (
            summary.history.map((h, i) => (
              <div key={i} className="flex items-center justify-between gap-3 border-t border-[#EEF1F5] px-4 py-3 first:border-t-0">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-gray-800">{h.reason || tr('Points', 'Points')}</p>
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
  const { tr } = useLang();
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
            aria-label={tr(`${reward.title} progress`, `Progress sa ${reward.title}`)}
          >
            <div className="h-full rounded-full" style={{ width: `${progress}%`, background: GRADIENT }} />
          </div>
          <p className="mt-1.5 text-[11.5px] text-gray-500">{tr(`${pts(reward.pointsCost - have)} to go`, `${pts(reward.pointsCost - have)} pa`)}</p>
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
        {tr('Redeem', 'I-redeem')}
      </button>
    </div>
  );
}

/** Confirm, then show the code big enough to read out. */
function RedeemSheet({ reward, balance, onClose }: { reward: Reward; balance: number; onClose: () => void }) {
  const { tr } = useLang();
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
      setFailure((e as Error)?.message || tr('Could not redeem. Try again in a moment.', 'Hindi ma-redeem. Subukan ulit maya-maya.'));
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
      setFailure(tr('This phone did not allow copying. Write the code down instead.', 'Hindi pinayagan ng phone na ito ang pag-copy. Isulat na lang ang code.'));
    }
  };

  if (result) {
    return (
      <Sheet title={tr('Reward ready', 'Handa na ang reward')} onClose={onClose}>
        <div className="rounded-[20px] border border-[#EEF1F5] bg-white p-5 text-center">
          <p className="text-[13px] font-semibold text-gray-900">{reward.title}</p>
          <p className="mt-3 select-all text-[30px] font-bold tracking-[0.18em] text-gray-900" aria-label={tr(`Your code is ${result.code}`, `Ang code mo ay ${result.code}`)}>
            {result.code}
          </p>
          <p className="mx-auto mt-2 max-w-[280px] text-[12.5px] leading-relaxed text-gray-500">
            {tr('Show this code to our team when you send your next request.', 'Ipakita ang code na ito sa aming team sa susunod mong request.')}
          </p>
          <button
            id="reward-copy-code"
            type="button"
            onClick={copy}
            className="mt-4 rounded-full bg-[#F1F8FE] px-4 py-2 text-[12.5px] font-semibold text-[#1D9FDA]"
          >
            <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'} mr-1.5 text-[11px]`} />
            {copied ? tr('Copied', 'Nakopya') : tr('Copy code', 'Kopyahin ang code')}
          </button>
          <p className="mt-3 text-[11.5px] text-gray-400">{tr(`New balance: ${pts(result.balance)}`, `Bagong balance: ${pts(result.balance)}`)}</p>
        </div>
        <ErrorNote text={failure} />
        <PrimaryButton onClick={onClose}>{tr('Done', 'Tapos na')}</PrimaryButton>
      </Sheet>
    );
  }

  return (
    <Sheet title={tr('Redeem this reward?', 'I-redeem ang reward na ito?')} onClose={busy ? () => undefined : onClose}>
      <div className="rounded-[20px] border border-[#EEF1F5] bg-white p-4">
        <p className="text-[14px] font-semibold text-gray-900">{reward.title}</p>
        {reward.description && <p className="mt-1 text-[12.5px] leading-snug text-gray-500">{reward.description}</p>}
        <div className="mt-3 space-y-1.5 border-t border-[#EEF1F5] pt-3 text-[12.5px]">
          <p className="flex justify-between text-gray-600">
            <span>{tr('Cost', 'Halaga')}</span>
            <span className="font-semibold text-gray-900">{pts(reward.pointsCost)}</span>
          </p>
          <p className="flex justify-between text-gray-600">
            <span>{tr('Balance after', 'Matitirang balance')}</span>
            <span className="font-semibold text-gray-900">{pts(Math.max(0, balance - reward.pointsCost))}</span>
          </p>
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-gray-500">
          {tr(
            'The points come off now and you get a code. If our team cancels it, the points come back overnight.',
            'Ibabawas na ngayon ang points at bibigyan ka ng code. Kapag kinansela ito ng aming team, babalik ang points kinabukasan.'
          )}
        </p>
      </div>
      <ErrorNote text={failure} />
      <PrimaryButton onClick={redeem} disabled={busy}>
        {busy ? tr('Redeeming…', 'Nire-redeem…') : tr(`Redeem for ${pts(reward.pointsCost)}`, `I-redeem sa ${pts(reward.pointsCost)}`)}
      </PrimaryButton>
      <button id="redeem-cancel" type="button" disabled={busy} onClick={onClose} className="w-full py-2 text-[13px] font-semibold text-gray-500 disabled:opacity-50">
        {tr('Not now', 'Hindi muna')}
      </button>
    </Sheet>
  );
}
