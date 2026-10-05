'use client';

import React, { useEffect, useRef } from 'react';
import { useLang } from '@/lib/i18n';

/**
 * Screen.tsx
 * ─────────────────────────────────────────────
 * The building blocks for the app's full-screen pages (My details, Patients,
 * Rewards…): a header with a back arrow, a scrolling body on the tinted
 * ground, an optional bar pinned to the bottom, and the grouped white cards
 * everything sits in. Same look as DetailsScreen.tsx.
 *
 * The phone's back button closes a screen rather than leaving the page: each
 * screen pushes a history entry when it opens and pops it when closed.
 */

export const BRAND = '#1D9FDA';
export const GROUND = '#F3F6FB';
export const GRADIENT = 'linear-gradient(135deg,#1D9FDA,#61A644)';

/** The thin open chevron used as the back button on the Categories page. */
export function BackChevron() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true">
      <path d="M15.5 4 7.5 12l8 8" />
    </svg>
  );
}

/** Plain input inside a Row. */
export const inputClass = 'mt-1 w-full bg-transparent text-[15px] text-gray-900 outline-none placeholder:text-gray-300';

interface ScreenProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Pinned under the body, e.g. a Save button. */
  footer?: React.ReactNode;
  /** A small action at the right of the header. */
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  /** Stack order when one screen opens another. */
  level?: number;
  /** Body background; the tinted ground unless a screen asks for another. */
  ground?: string;
  /** 'chevron' is the thin back chevron from the Categories page. */
  backIcon?: 'arrow' | 'chevron';
}

export function Screen({ title, subtitle, onClose, footer, headerAction, children, level = 0, ground = GROUND, backIcon = 'arrow' }: ScreenProps) {
  const { tr } = useLang();
  const pushed = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    window.history.pushState({ gmScreen: title }, '');
    pushed.current = true;
    const onPop = () => {
      if (!pushed.current) return;
      pushed.current = false;
      closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const toTop = document.getElementById('scroll-to-top');
    // Its stylesheet uses !important, so only an inline !important wins.
    if (toTop) toTop.style.setProperty('display', 'none', 'important');
    return () => {
      window.removeEventListener('popstate', onPop);
      if (level === 0) {
        document.body.style.overflow = prev;
        if (toTop) toTop.style.removeProperty('display');
      }
    };
  }, [title, level]);

  const close = () => {
    if (pushed.current) window.history.back();
    else onClose();
  };

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: ground, zIndex: 10040 + level * 2 }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      // Has its own history entry, so the phone's Back closes it like any page.
      data-history-backed=""
    >
      <header
        className="flex items-center gap-2 border-b border-[#E7ECF2] bg-white px-2 pb-2.5"
        style={{ paddingTop: 'calc(10px + var(--gm-safe-top))' }}
      >
        <button
          type="button"
          onClick={close}
          aria-label={tr('Back', 'Bumalik')}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${backIcon === 'chevron' ? 'text-gray-900' : 'text-gray-700'}`}
        >
          {backIcon === 'chevron' ? <BackChevron /> : <i className="fa-solid fa-arrow-left text-[16px]" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold text-gray-900">{title}</p>
          {subtitle && <p className="truncate text-[11.5px] text-gray-500">{subtitle}</p>}
        </div>
        {headerAction && <div className="shrink-0 pr-2">{headerAction}</div>}
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-8 pt-5">{children}</div>

      {footer && (
        <div className="border-t border-[#E7ECF2] bg-white px-4 pt-3" style={{ paddingBottom: 'calc(12px + var(--gm-safe-bottom))' }}>
          {footer}
        </div>
      )}
    </div>
  );
}

/** A titled group of rows in a white card. */
export function Card({ title, note, action, children }: { title?: string; note?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      {(title || action) && (
        <div className="flex items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            {title && <h2 className="text-[13px] font-semibold text-gray-900">{title}</h2>}
            {note && <p className="mt-0.5 text-[11.5px] leading-relaxed text-gray-500">{note}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="overflow-hidden rounded-[20px] border border-[#EEF1F5] bg-white">{children}</div>
    </section>
  );
}

/** A labelled field inside a Card. */
export function Field({
  id,
  label,
  optional,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  const { tr } = useLang();
  return (
    <div className="border-t border-[#EEF1F5] px-4 py-3 first:border-t-0" data-field={id}>
      <label htmlFor={id} className="flex items-baseline justify-between text-[11.5px] font-medium text-gray-500">
        {label}
        {optional && <span className="text-[10.5px] font-normal text-gray-400">{tr('Optional', 'Opsyonal')}</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-red-500">
          <i className="fa-solid fa-circle-exclamation text-[10px]" />
          {error}
        </p>
      )}
    </div>
  );
}

/** A tappable row inside a Card: icon, title, detail, chevron. */
export function ListRow({
  icon,
  title,
  detail,
  hint,
  onClick,
  tone,
  children,
}: {
  icon?: string;
  title: React.ReactNode;
  detail?: React.ReactNode;
  hint?: React.ReactNode;
  onClick?: () => void;
  tone?: 'danger';
  children?: React.ReactNode;
}) {
  const body = (
    <>
      {icon && (
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone === 'danger' ? 'bg-red-50 text-red-500' : 'bg-[#F1F8FE] text-[#1D9FDA]'}`}>
          <i className={`fa-solid ${icon} text-[13px]`} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={`block text-[14px] font-medium ${tone === 'danger' ? 'text-red-500' : 'text-gray-900'}`}>{title}</span>
        {detail && <span className="mt-0.5 block text-[12px] leading-snug text-gray-500">{detail}</span>}
      </span>
      {hint && <span className="shrink-0 text-[12px] text-gray-400">{hint}</span>}
      {children}
      {onClick && <i className="fa-solid fa-chevron-right shrink-0 text-[11px] text-gray-300" />}
    </>
  );
  const cls = 'flex w-full items-center gap-3 border-t border-[#EEF1F5] px-4 py-3.5 text-left first:border-t-0';
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Centered message for an empty list, with an optional action. */
export function Empty({ icon, title, text, action }: { icon: string; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-[20px] border border-[#EEF1F5] bg-white px-6 py-8 text-center">
      <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#F1F6FC]">
        <i className={`fa-solid ${icon} text-[18px]`} style={{ color: BRAND }} />
      </span>
      <p className="text-[14px] font-semibold text-gray-900">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[300px] text-[12.5px] leading-relaxed text-gray-500">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = 'button',
  tone,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  tone?: 'danger';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-full py-3.5 text-[14px] font-semibold text-white disabled:opacity-50"
      style={{ background: tone === 'danger' ? '#DC2626' : GRADIENT }}
    >
      {children}
    </button>
  );
}

export function SmallButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full bg-[#F1F8FE] px-3.5 py-1.5 text-[12.5px] font-semibold text-[#1D9FDA] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** A short confirmation that fades out. */
export function Toast({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 z-[10100] rounded-2xl bg-gray-900 px-4 py-3 text-center text-[13px] text-white shadow-lg"
      style={{ bottom: 'calc(96px + var(--gm-safe-bottom))' }}
    >
      {text}
    </div>
  );
}

/** A red message box for a failed action. */
export function ErrorNote({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="flex gap-2 rounded-2xl bg-red-50 px-3.5 py-3 text-[12.5px] leading-snug text-red-600">
      <i className="fa-solid fa-circle-exclamation mt-[3px] text-[11px]" />
      {text}
    </p>
  );
}

/** A bottom sheet over a Screen, for an add/edit form. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { tr } = useLang();
  return (
    <div className="fixed inset-0 z-[10090] flex items-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label={tr('Close', 'Isara')} onClick={onClose} className="absolute inset-0 bg-[rgba(15,23,42,.45)]" />
      <div
        className="relative max-h-[88vh] w-full overflow-y-auto rounded-t-[28px] px-4 pt-3"
        style={{ background: GROUND, paddingBottom: 'calc(20px + var(--gm-safe-bottom))' }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300" />
        <div className="mb-4 flex items-center justify-between px-1">
          <p className="text-[16px] font-semibold text-gray-900">{title}</p>
          <button type="button" onClick={onClose} aria-label={tr('Close', 'Isara')} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-500">
            <i className="fa-solid fa-xmark text-[13px]" />
          </button>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
}

/** Shows a toast for a few seconds. */
export function useToast(): [string, (text: string) => void] {
  const [text, setText] = React.useState('');
  const timer = useRef<number | undefined>(undefined);
  const show = (t: string) => {
    setText(t);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setText(''), 2600);
  };
  return [text, show];
}
