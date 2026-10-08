import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLang } from '@/lib/i18n';

/**
 * ConfirmDialog.tsx
 * ─────────────────────────────────────────────
 * The app's "Are you sure?" for anything that cannot be undone: logging out,
 * clearing a half-filled form. One look everywhere — a plain centred card
 * with the question, a line of detail, and two buttons, no icon.
 *
 *   const clear = useConfirm(() => reset(), {
 *     title: ['Clear this form?', '…'],
 *     body: ['Everything you entered will be removed.', '…'],
 *     confirm: ['Clear form', '…'],
 *   });
 *   <button onClick={clear.ask}>Cancel</button>
 *   {clear.dialog}
 *
 * It zooms in over a fading backdrop. The safe button has focus, so Enter
 * never does the destructive thing; it, a tap outside or Escape closes the
 * card, and only the red button runs the action.
 */

type Copy = [en: string, tl: string];

export type ConfirmCopy = {
  title: Copy;
  body: Copy;
  /** The red, destructive button. */
  confirm: Copy;
  /** The safe button. Defaults to Cancel. */
  cancel?: Copy;
};

const CSS = `
@keyframes gmCfBackIn{from{opacity:0}to{opacity:1}}
@keyframes gmCfCardIn{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}
.gm-cf-back{animation:gmCfBackIn .2s ease-out both}
.gm-cf-card{animation:gmCfCardIn .28s cubic-bezier(.2,.9,.3,1.2) both}
@media (prefers-reduced-motion: reduce){.gm-cf-back,.gm-cf-card{animation:none}}
`;

export function useConfirm(action: () => void, copy: ConfirmCopy) {
  const { tr } = useLang();
  const id = useId();
  const [open, setOpen] = useState(false);
  const safeRef = useRef<HTMLButtonElement>(null);

  const ask = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const confirm = () => { setOpen(false); action(); };

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    safeRef.current?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', onKey); };
  }, [open, close]);

  const dialog = open ? (
    <div className="fixed inset-0 z-[10080] flex items-center justify-center p-6">
      <style>{CSS}</style>
      <div className="gm-cf-back absolute inset-0 bg-[rgba(15,23,42,.5)]" onClick={close} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-b`}
        className="gm-cf-card relative w-full max-w-[360px] rounded-[20px] bg-white p-5 text-left"
      >
        <h2 id={`${id}-t`} className="text-[15.5px] font-semibold leading-snug text-gray-900">{tr(...copy.title)}</h2>
        <p id={`${id}-b`} className="mt-1 text-[12.5px] leading-relaxed text-gray-500">{tr(...copy.body)}</p>
        <div className="mt-4 flex gap-2.5">
          <button
            ref={safeRef}
            type="button"
            onClick={close}
            className="h-[42px] flex-1 rounded-full bg-[#F1F4F8] text-[13.5px] font-semibold text-gray-700 transition active:scale-[0.98]"
          >
            {tr(...(copy.cancel ?? ['Cancel', 'Kanselahin']))}
          </button>
          <button
            type="button"
            onClick={confirm}
            className="h-[42px] flex-1 rounded-full bg-[#E5484D] text-[13.5px] font-semibold text-white transition active:scale-[0.98]"
          >
            {tr(...copy.confirm)}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { ask, dialog };
}
