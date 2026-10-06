'use client';

import React from 'react';
import { useLang } from '@/lib/i18n';

/**
 * ProfileCard.tsx
 * ─────────────────────────────────────────────
 * The top of the app's account screen: a sky cover, the customer's picture
 * inside a progress ring, their name, three numbers, and three shortcuts.
 *
 * The ring shows how complete the saved details are. Those details fill in
 * every inquiry form, so a full ring means a request is a few taps; that is
 * the one "progress" on this screen that is real and in the customer's hands.
 *
 * App only; account.tsx keeps the plain identity row for the website.
 */

const BRAND = '#1D9FDA';

export interface ProfileStat {
  label: string;
  value: string;
  onClick?: () => void;
}

export interface ProfileAction {
  icon: string;
  label: string;
  onClick: () => void;
  tone?: 'danger';
}

interface Props {
  name: string;
  subtitle: string;
  avatar?: string;
  /** 0 to 100: share of the saved details that are filled in. */
  completeness: number;
  onEdit: () => void;
  stats: ProfileStat[];
  actions: ProfileAction[];
}

const RING = 108;
const STROKE = 4;

function Ring({ pct }: { pct: number }) {
  const r = (RING - STROKE) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} className="absolute inset-0 -rotate-90" aria-hidden="true">
      <defs>
        <linearGradient id="profile-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1D9FDA" />
          <stop offset="100%" stopColor="#61A644" />
        </linearGradient>
      </defs>
      <circle cx={RING / 2} cy={RING / 2} r={r} fill="none" stroke="#E7ECF2" strokeWidth={STROKE} />
      {/* Round caps would leave a dot at 0%, so draw nothing until there is progress. */}
      {pct > 0 && <circle
        cx={RING / 2}
        cy={RING / 2}
        r={r}
        fill="none"
        stroke="url(#profile-ring)"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={`${(c * pct) / 100} ${c}`}
        style={{ transition: 'stroke-dasharray .6s ease' }}
      />}
    </svg>
  );
}

const SKY =
  'radial-gradient(60% 55% at 30% 70%, rgba(255,255,255,.85), transparent 70%),' +
  'radial-gradient(45% 45% at 62% 45%, rgba(255,255,255,.7), transparent 70%),' +
  'radial-gradient(40% 40% at 88% 80%, rgba(255,255,255,.55), transparent 70%),' +
  'linear-gradient(180deg,#BFD9EE 0%,#D8E8F4 60%,#E6EFF6 100%)';

/**
 * What a guest sees instead of the profile card. A guest has no balance, no
 * code and nothing to log out of, so this says what signing in gives and
 * offers one way in. The sign-in itself opens in a sheet (see SignInSheet).
 */
export function GuestCard({ onSignIn }: { onSignIn: (mode: 'signup' | 'login') => void }) {
  const { tr } = useLang();
  const perks: Array<[string, string]> = [
    ['fa-star', tr('Earn points on every request you send', 'Kumita ng points sa bawat request na ipapadala mo')],
    ['fa-user-plus', tr('Get more when a friend joins with your code', 'Dagdag points kapag may kaibigang sumali gamit ang code mo')],
    ['fa-envelope', tr('Sign up with your email or mobile number', 'Mag-sign up gamit ang email o mobile number mo')],
  ];
  return (
    <section
      className="mb-5 rounded-[28px] bg-white p-2 pb-5"
      aria-label={tr('Sign in', 'Mag-log in')}
    >
      <div className="h-[92px] rounded-[22px]" style={{ background: SKY }} />
      <div className="-mt-[46px] flex justify-center">
        <span className="flex h-[88px] w-[88px] items-center justify-center rounded-full border-[5px] border-white bg-[#EAF4FB]">
          <i className="fa-solid fa-user text-[30px]" style={{ color: BRAND }} />
        </span>
      </div>
      <div className="mt-3 px-5 text-center">
        <h1 className="text-[21px] font-semibold text-gray-900">{tr('Welcome to Getmeds', 'Welcome sa Getmeds')}</h1>
        <p className="mx-auto mt-1 max-w-[290px] text-[13px] leading-relaxed text-gray-500">
          {tr(
            'Create an account to request quotes and start collecting Getmeds Points.',
            'Gumawa ng account para makapag-request ng quote at makaipon ng Getmeds Points.',
          )}
        </p>
      </div>
      <ul className="mx-4 mt-4 space-y-2.5">
        {perks.map(([icon, text]) => (
          <li key={text} className="flex items-center gap-3 text-[13px] text-gray-700">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F1F8FE]">
              <i className={`fa-solid ${icon} text-[12px]`} style={{ color: BRAND }} />
            </span>
            {text}
          </li>
        ))}
      </ul>
      <div className="mx-4 mt-5">
        <button
          type="button"
          onClick={() => onSignIn('signup')}
          className="w-full rounded-full py-3.5 text-[14px] font-semibold text-white"
          style={{ background: 'linear-gradient(135deg,#1D9FDA,#61A644)' }}
        >
          {tr('Create account', 'Gumawa ng account')}
        </button>
        <button
          type="button"
          onClick={() => onSignIn('login')}
          className="mt-2.5 w-full rounded-full border-[1.5px] py-3 text-[14px] font-semibold"
          style={{ borderColor: BRAND, color: BRAND }}
        >
          {tr('Log in', 'Mag-log in')}
        </button>
      </div>
    </section>
  );
}

/** A plain list of what a guest can still open, one row each. */
export function GuestList({ rows }: { rows: Array<{ icon: string; label: string; hint?: string; onClick: () => void }> }) {
  const { tr } = useLang();
  return (
    <section className="mb-5 overflow-hidden rounded-[22px] bg-white" aria-label={tr('More', 'Iba pa')}>
      <p className="px-4 pb-1 pt-3.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{tr('More', 'Iba pa')}</p>
      {rows.map((r) => (
        <button
          key={r.label}
          type="button"
          onClick={r.onClick}
          className="flex w-full items-center gap-3 border-t border-gray-50 px-4 py-3.5 text-left first-of-type:border-t-0"
        >
          <i className={`fa-solid ${r.icon} w-5 text-center text-[15px] text-gray-400`} />
          <span className="flex-1 text-[13.5px] font-medium text-gray-800">{r.label}</span>
          {r.hint && <span className="text-[12px] text-gray-400">{r.hint}</span>}
          <i className="fa-solid fa-chevron-right text-[11px] text-gray-300" />
        </button>
      ))}
    </section>
  );
}

/** Full-screen sign-up / log-in page above the tab bar (which sits at z-index 9999).
 *  Its child (AuthForm in `screen` layout) draws the tinted header and the card. */
export function SignInSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const { tr } = useLang();
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[10050] overflow-y-auto bg-[#F4F7FA]"
      role="dialog"
      aria-modal="true"
      aria-label={tr('Sign in', 'Mag-log in')}
      style={{ paddingBottom: 'var(--gm-safe-bottom)' }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={tr('Close', 'Isara')}
        className="absolute left-4 z-10 flex h-9 w-9 items-center justify-center rounded-full text-white"
        style={{ top: 'calc(10px + var(--gm-safe-top))', background: 'rgba(10,42,67,.3)', backdropFilter: 'blur(8px)' }}
      >
        <i className="fa-solid fa-chevron-left text-[14px]" />
      </button>
      {children}
    </div>
  );
}

export default function ProfileCard({ name, subtitle, avatar, completeness, onEdit, stats, actions }: Props) {
  const { tr } = useLang();
  const initial = (name || 'G').charAt(0).toUpperCase();
  const pct = Math.max(0, Math.min(100, Math.round(completeness)));

  return (
    <section
      className="mb-5 rounded-[28px] bg-white p-2 pb-3"
      aria-label={tr('Your profile', 'Ang profile mo')}
    >
      {/* Cover: a soft sky, drawn in CSS so it costs no download. */}
      <div
        className="relative h-[112px] overflow-hidden rounded-[22px]"
        style={{
          background:
            'radial-gradient(60% 55% at 30% 70%, rgba(255,255,255,.85), transparent 70%),' +
            'radial-gradient(45% 45% at 62% 45%, rgba(255,255,255,.7), transparent 70%),' +
            'radial-gradient(40% 40% at 88% 80%, rgba(255,255,255,.55), transparent 70%),' +
            'linear-gradient(180deg,#BFD9EE 0%,#D8E8F4 60%,#E6EFF6 100%)',
        }}
      >
        <button
          type="button"
          onClick={onEdit}
          aria-label={tr('Edit profile', 'I-edit ang profile')}
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-gray-700 backdrop-blur"
          style={{ boxShadow: '0 2px 8px rgba(23,43,77,.12)' }}
        >
          <i className="fa-solid fa-pen text-[13px]" />
        </button>
      </div>

      {/* Picture inside the completeness ring, overlapping the cover. */}
      <div className="-mt-[62px] flex flex-col items-center">
        <div className="relative rounded-full bg-white p-[3px]" style={{ width: RING + 6, height: RING + 6 }}>
          <div className="relative" style={{ width: RING, height: RING }}>
            <Ring pct={pct} />
            <span
              className="absolute inset-[8px] flex items-center justify-center overflow-hidden rounded-full text-[32px] font-bold text-white"
              style={{ background: BRAND }}
            >
              {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : initial}
            </span>
          </div>
        </div>
        <button type="button" onClick={onEdit} className="mt-1.5 text-[11.5px] font-medium text-gray-400">
          {pct >= 100
            ? tr('Profile complete', 'Kumpleto na ang profile')
            : tr(`Profile ${pct}% complete · Finish it`, `${pct}% kumpleto ang profile · Tapusin na`)}
        </button>
      </div>

      <div className="mt-2 px-4 text-center">
        <h1 className="truncate text-[21px] font-semibold text-gray-900">{name || tr('Guest', 'Bisita')}</h1>
        <p className="mx-auto mt-1 max-w-[280px] text-[13px] leading-relaxed text-gray-500">{subtitle}</p>
      </div>

      {/* Numbers, in an inset panel. */}
      <div
        className="mx-2 mt-4 grid grid-cols-3 rounded-[20px] bg-[#F7F9FC] py-3.5"
        style={{ boxShadow: 'inset 0 1px 2px rgba(23,43,77,.04)' }}
      >
        {stats.map((s) => {
          const body = (
            <>
              <span className="block text-[18px] font-semibold tabular-nums text-gray-900">{s.value}</span>
              <span className="mt-0.5 block text-[12px] text-gray-500">{s.label}</span>
            </>
          );
          return s.onClick ? (
            <button key={s.label} type="button" onClick={s.onClick} className="text-center">
              {body}
            </button>
          ) : (
            <div key={s.label} className="text-center">
              {body}
            </div>
          );
        })}
      </div>

      {/* Shortcuts. */}
      <div className="mt-3 flex justify-center gap-6">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            className={`flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 ${a.tone === 'danger' ? 'text-red-400' : 'text-gray-600'}`}
          >
            <i className={`fa-solid ${a.icon} text-[16px]`} aria-hidden="true" />
            <span className="text-[11px] font-medium">{a.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
