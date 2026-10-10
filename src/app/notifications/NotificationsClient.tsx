'use client';

import React, { useMemo } from 'react';
import { useAccountData, type AccountData } from '@/lib/accountApi';
import { isSignedIn } from '@/lib/rewards';
import { goBack } from '@/platform/navigation';
import { useLang, translate } from '@/lib/i18n';
import './notifications.css';

/**
 * NotificationsClient.tsx
 * ─────────────────────────────────────────────
 * The bell in the home header opens this. There is no push inbox on the
 * backend, so the feed is derived from what the account already knows and
 * would otherwise only surface deep inside the profile screens: refill
 * reminders coming due, prescriptions about to expire, stock alerts for
 * saved medicines, reward redemptions, PAP application updates and sent
 * requests. Each row links to the account screen that owns it.
 *
 * Signed out (or nothing to show) renders the illustrated empty state —
 * an animated bell, per the design reference.
 */

interface Notice {
  key: string;
  icon: string;       // Font Awesome name
  color: string;      // filled circle background
  title: string;
  sub: string;
  at: Date | null;    // when it happened / is due — sorts the feed
  urgent?: boolean;   // tinted row: something to act on
  href: string;
}

const DAY = 24 * 60 * 60 * 1000;

const parseDate = (v?: string | null): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "7m" / "3h" / "2d" for the recent past (or near future), "22 Jul" beyond a week. */
function when(at: Date | null): string {
  if (!at) return '';
  const diff = Math.abs(Date.now() - at.getTime());
  if (diff < 60 * 1000) return translate('now', 'ngayon');
  if (diff < 60 * 60 * 1000) return `${Math.round(diff / (60 * 1000))}m`;
  if (diff < DAY) return `${Math.round(diff / (60 * 60 * 1000))}h`;
  if (diff < 7 * DAY) return `${Math.round(diff / DAY)}d`;
  return at.toLocaleDateString('en-PH', { day: 'numeric', month: 'short' });
}

function buildFeed(d: AccountData): Notice[] {
  const now = Date.now();
  const out: Notice[] = [];

  (d.refillReminders || []).forEach((r) => {
    if (r.active === false) return;
    const due = parseDate(r.nextDue);
    if (!due) return;
    const days = Math.ceil((due.getTime() - now) / DAY);
    if (days > 7) return; // quiet until it is close
    const dueNow = days <= 0;
    out.push({
      key: `rem-${r._key}`,
      icon: 'fa-bell',
      color: '#1D9FDA',
      title: dueNow ? translate(`Refill due: ${r.name}`, `Oras na ng refill: ${r.name}`) : translate(`Refill coming up: ${r.name}`, `Malapit na ang refill: ${r.name}`),
      sub: r.patientName
        ? translate(`For ${r.patientName} · every ${r.everyDays} days`, `Para kay ${r.patientName} · tuwing ${r.everyDays} araw`)
        : translate(`Every ${r.everyDays} days`, `Tuwing ${r.everyDays} araw`),
      at: due,
      urgent: dueNow,
      href: '/profile#reminders',
    });
  });

  (d.rx || []).forEach((r) => {
    const exp = parseDate(r.expiresOn);
    if (!exp) return;
    const days = Math.ceil((exp.getTime() - now) / DAY);
    if (days > 30) return;
    out.push({
      key: `rx-${r._id}`,
      icon: 'fa-file-prescription',
      color: '#E8A23D',
      title: days < 0
        ? translate(`Prescription expired: ${r.label}`, `Expired na ang reseta: ${r.label}`)
        : translate(`Prescription expiring: ${r.label}`, `Malapit nang mag-expire ang reseta: ${r.label}`),
      sub: r.medicine || r.patientName || translate('In your prescription wallet', 'Nasa prescription wallet mo'),
      at: exp,
      urgent: days <= 7,
      href: '/profile#wallet',
    });
  });

  (d.savedProducts || []).forEach((p) => {
    const at = parseDate(p.notifiedAt);
    if (!p.watchStock || !at) return;
    out.push({
      key: `stock-${p._key}`,
      icon: 'fa-box-open',
      color: '#61A644',
      title: translate(`Back in stock: ${p.name}`, `May stock na ulit: ${p.name}`),
      sub: [p.strength, p.form].filter(Boolean).join(' · ') || translate('From your saved medicines', 'Mula sa mga naka-save mong gamot'),
      at,
      href: p.url || '/profile#saved',
    });
  });

  (d.redemptions || []).forEach((r) => {
    out.push({
      key: `red-${r._id}`,
      icon: 'fa-gift',
      color: '#8B5CF6',
      title: r.status === 'applied'
        ? translate(`Reward applied: ${r.rewardTitle}`, `Nagamit na ang reward: ${r.rewardTitle}`)
        : r.status === 'cancelled'
          ? translate(`Reward cancelled: ${r.rewardTitle}`, `Na-cancel ang reward: ${r.rewardTitle}`)
          : translate(`Reward requested: ${r.rewardTitle}`, `Na-request ang reward: ${r.rewardTitle}`),
      sub: translate(`${r.pointsCost.toLocaleString('en-PH')} points · code ${r.code}`, `${r.pointsCost.toLocaleString('en-PH')} points · code ${r.code}`),
      at: parseDate(r.createdAt),
      href: '/profile#rewards',
    });
  });

  (d.pap || []).forEach((p) => {
    const labels: Record<string, [string, string]> = {
      submitted: ['PAP application received', 'Natanggap ang PAP application'],
      reviewing: ['PAP application under review', 'Nirereview ang PAP application'],
      needs_info: ['PAP application needs more info', 'Kailangan pa ng info ang PAP application'],
      approved: ['PAP application approved', 'Aprubado ang PAP application'],
      declined: ['PAP application declined', 'Hindi naaprubahan ang PAP application'],
    };
    const [en, tl] = labels[p.status] || labels.submitted;
    out.push({
      key: `pap-${p._id}`,
      icon: 'fa-hand-holding-heart',
      color: p.status === 'needs_info' ? '#E05252' : '#14997A',
      title: translate(en, tl),
      sub: [p.patientName, p.medicine].filter(Boolean).join(' · '),
      at: parseDate(p.createdAt),
      urgent: p.status === 'needs_info',
      href: '/profile#pap',
    });
  });

  (d.requests || []).forEach((r) => {
    const n = r.items?.length || 0;
    out.push({
      key: `req-${r._id}`,
      icon: 'fa-paper-plane',
      color: '#3D7BE8',
      title: translate(
        `Request sent: ${n} ${n === 1 ? 'medicine' : 'medicines'}`,
        `Naipadala ang request: ${n} gamot`,
      ),
      sub: r.items?.map((i) => i.name).slice(0, 2).join(', ') + (n > 2 ? '…' : ''),
      at: parseDate(r.createdAt),
      href: '/profile#requests',
    });
  });

  return out
    .sort((a, b) => (b.at?.getTime() || 0) - (a.at?.getTime() || 0))
    .slice(0, 50);
}

/** The reference design's bell illustration, drawn live so it can move. */
function EmptyBell() {
  return (
    <div className="gmn-stage" aria-hidden="true">
      <svg viewBox="0 0 220 200" className="h-full w-full">
        {/* soft blob ground */}
        <path
          className="gmn-blob"
          d="M44 108c-8-34 16-66 52-74 38-9 84 2 98 34 13 30-7 64-36 78-30 15-70 14-92-6-12-11-19-18-22-32z"
          fill="#EAF3EC"
        />
        {/* dotted texture */}
        {[[30, 60], [40, 48], [50, 60], [178, 142], [188, 130], [198, 142], [188, 154]].map(([x, y], i) => (
          <circle key={i} className="gmn-dot" style={{ animationDelay: `${i * 0.35}s` }} cx={x} cy={y} r="2.2" fill="#BFDCCB" />
        ))}
        {/* sound arcs, left and right */}
        <path className="gmn-arc" d="M52 86c-6 10-8 22-5 34" fill="none" stroke="#9CCFE3" strokeWidth="5" strokeLinecap="round" />
        <path className="gmn-arc gmn-arc-late" d="M38 78c-9 14-12 32-7 48" fill="none" stroke="#C4E2EF" strokeWidth="5" strokeLinecap="round" />
        <path className="gmn-arc" d="M168 86c6 10 8 22 5 34" fill="none" stroke="#9CCFE3" strokeWidth="5" strokeLinecap="round" />
        <path className="gmn-arc gmn-arc-late" d="M182 78c9 14 12 32 7 48" fill="none" stroke="#C4E2EF" strokeWidth="5" strokeLinecap="round" />
        {/* the bell itself — swings from its crown */}
        <g className="gmn-bell">
          <circle cx="110" cy="40" r="6" fill="none" stroke="#9CCFE3" strokeWidth="5" />
          <path
            d="M110 52c-24 0-37 19-37 41v20c0 10-6 16-12 21h98c-6-5-12-11-12-21V93c0-22-13-41-37-41z"
            fill="#FFFFFF"
            stroke="#9CCFE3"
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <path d="M96 140a14 14 0 0 0 28 0" fill="#FFFFFF" stroke="#9CCFE3" strokeWidth="5" strokeLinecap="round" />
        </g>
        {/* the red badge the reference puts on the bell's shoulder */}
        <circle className="gmn-badge" cx="150" cy="62" r="13" fill="#FFFFFF" stroke="#E05252" strokeWidth="5" />
      </svg>
    </div>
  );
}

export default function NotificationsClient() {
  const { tr } = useLang();
  const { data } = useAccountData();
  const signedIn = isSignedIn();
  const feed = useMemo(() => (data ? buildFeed(data) : []), [data]);

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif" }} className="min-h-screen bg-white text-gray-800 antialiased">
      {/* Header: back, centred title — the reference layout. */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => goBack('/app-home')}
          aria-label={tr('Back', 'Bumalik')}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F6FB] text-gray-700"
        >
          <i className="fa-solid fa-arrow-left text-[14px]" />
        </button>
        <h1 className="text-[16px] font-semibold text-gray-900">{tr('Notifications', 'Mga Notification')}</h1>
        <span className="h-10 w-10" aria-hidden="true" />
      </div>

      {feed.length === 0 ? (
        /* The reference's empty state, with the bell alive. */
        <div className="flex flex-col items-center px-8 pt-10 text-center">
          <EmptyBell />
          <h2 className="mt-6 text-[19px] font-bold text-gray-900">{tr('Nothing to display here!', 'Wala pang laman dito!')}</h2>
          <p className="mt-2 max-w-[260px] text-[12.5px] leading-relaxed text-gray-400">
            {signedIn
              ? tr("We'll notify you once we have new notifications.", 'Aabisuhan ka namin kapag may bago nang notification.')
              : tr('Sign in to get refill reminders, stock alerts and reward updates here.', 'Mag-sign in para makita rito ang mga paalala sa refill, stock alert at reward update.')}
          </p>
          {!signedIn && (
            <a
              href="/profile"
              className="mt-6 rounded-full px-7 py-3 text-[13px] font-semibold text-white"
              style={{ background: 'linear-gradient(135deg,#1D9FDA,#61A644)' }}
            >
              {tr('Sign in', 'Mag-sign in')}
            </a>
          )}
        </div>
      ) : (
        <ul className="pb-8">
          {feed.map((n, i) => (
            <li key={n.key} className="gmn-row" style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }}>
              <a
                href={n.href}
                className={`flex items-center gap-3 px-4 py-3 ${n.urgent ? 'bg-[#F3F6FB]' : ''}`}
              >
                {/* The reference's avatar slot, as a filled colored icon. */}
                <span
                  className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-white"
                  style={{ background: n.color }}
                >
                  <i className={`fa-solid ${n.icon} text-[15px]`} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-gray-900">{n.title}</span>
                  {n.sub && <span className="mt-0.5 block truncate text-[11.5px] text-gray-400">{n.sub}</span>}
                </span>
                <span className="shrink-0 self-start pt-0.5 text-[10.5px] text-gray-400">{when(n.at)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
