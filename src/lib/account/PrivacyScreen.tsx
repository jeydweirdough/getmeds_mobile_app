'use client';

import React, { useState } from 'react';
import { BRAND, Card, ErrorNote, Field, ListRow, PrimaryButton, Screen, Sheet, Toast, inputClass, useToast } from '../ui/Screen';
import { deleteAccount, exportAccount, manilaToday } from '../accountApi';
import { signOut } from '../rewards';
import { useLang } from '../i18n';

/**
 * PrivacyScreen.tsx
 * ─────────────────────────────────────────────
 * Privacy and data: what Getmeds keeps for a signed-in customer, what stays
 * on the phone, and the three things a customer can do about it: download a
 * copy, sign out, or delete the account for good.
 *
 * Deleting erases everything on the server at once, after which the session
 * token no longer works, so the screen signs out straight after and hands
 * control back through onSignedOut.
 */

const KEPT = [
  {
    icon: 'fa-mobile-screen-button',
    text: 'Your email or mobile number, used to log in (your password is stored only as a scrambled hash)',
    textTl: 'Ang email o mobile number mo na ginagamit sa pag-log in (naka-store lang ang password mo bilang scrambled hash)',
  },
  { icon: 'fa-id-card', text: 'My details: name, email and delivery details', textTl: 'Mga detalye ko: pangalan, email at detalye ng delivery' },
  { icon: 'fa-user-group', text: 'Patients and delivery addresses you add', textTl: 'Mga pasyente at delivery address na idinagdag mo' },
  { icon: 'fa-heart', text: 'Saved medicines, saved guides and refill reminders', textTl: 'Mga naka-save na gamot, guide at refill reminder' },
  { icon: 'fa-file-prescription', text: 'Prescriptions in your wallet', textTl: 'Mga reseta sa wallet mo' },
  { icon: 'fa-clock-rotate-left', text: 'Requests you have sent', textTl: 'Mga request na naipadala mo' },
  {
    icon: 'fa-star',
    text: 'Getmeds Points, rewards and Patient Assistance applications',
    textTl: 'Getmeds Points, rewards at mga Patient Assistance application',
  },
];

const ON_PHONE = [
  { icon: 'fa-image', text: 'Your profile picture', textTl: 'Ang profile picture mo' },
  { icon: 'fa-list-check', text: 'Your request list, until you send it', textTl: 'Ang request list mo, hanggang maipadala mo ito' },
];

export default function PrivacyScreen({ onClose, onSignedOut }: { onClose: () => void; onSignedOut: () => void }) {
  const { tr } = useLang();
  const [busy, setBusy] = useState<'export' | null>(null);
  const [failure, setFailure] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [toast, showToast] = useToast();

  const download = async () => {
    setBusy('export');
    setFailure('');
    try {
      const json = await exportAccount();
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `getmeds-my-data-${manilaToday()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Give the download a moment to start before the link is released.
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
      showToast(tr('Your data is downloading', 'Dina-download na ang data mo'));
    } catch (e) {
      setFailure(
        tr(
          `${(e as Error)?.message || 'Could not prepare your data.'} Check your connection and try again.`,
          `${(e as Error)?.message || 'Hindi maihanda ang data mo.'} Tingnan ang iyong connection at subukan ulit.`
        )
      );
    }
    setBusy(null);
  };

  const leave = () => {
    signOut();
    onSignedOut();
  };

  return (
    <Screen
      title={tr('Privacy and data', 'Privacy at data')}
      subtitle={tr('What we keep and how to remove it', 'Ano ang itinatabi namin at paano ito alisin')}
      onClose={onClose}
    >
      <Card
        title={tr('Kept with your Getmeds account', 'Nakatabi sa iyong Getmeds account')}
        note={tr('So it is there on any phone you sign in on.', 'Para nandiyan ito sa kahit anong phone na pag-sign in-an mo.')}
      >
        {KEPT.map((k) => (
          <ListRow key={k.text} icon={k.icon} title={<span className="text-[13px] font-normal text-gray-700">{tr(k.text, k.textTl)}</span>} />
        ))}
      </Card>

      <Card
        title={tr('Only on this phone', 'Sa phone na ito lang')}
        note={tr('Never sent to Getmeds, and not on your other devices.', 'Hindi ipinapadala sa Getmeds, at wala sa iba mo pang device.')}
      >
        {ON_PHONE.map((k) => (
          <ListRow key={k.text} icon={k.icon} title={<span className="text-[13px] font-normal text-gray-700">{tr(k.text, k.textTl)}</span>} />
        ))}
      </Card>

      <p className="flex gap-2 px-1 text-[11.5px] leading-relaxed text-gray-500">
        <i className="fa-solid fa-scale-balanced mt-[3px] text-[10px] text-gray-400" />
        <span>
          {tr(
            'Getmeds processes your data in accordance with the Data Privacy Act of 2012. Read the',
            'Pinoproseso ng Getmeds ang data mo alinsunod sa Data Privacy Act of 2012. Basahin ang'
          )}{' '}
          <a href="/privacy-policy" className="font-semibold underline" style={{ color: BRAND }}>
            {tr('Privacy Policy', 'Privacy Policy')}
          </a>
          .
        </span>
      </p>

      <Card title={tr('Your choices', 'Mga puwede mong gawin')}>
        <ListRow
          icon="fa-download"
          title={tr('Download my data', 'I-download ang data ko')}
          detail={
            busy === 'export'
              ? tr('Preparing your file…', 'Inihahanda ang file mo…')
              : tr('A copy of everything above, as a JSON file', 'Kopya ng lahat ng nasa itaas, bilang JSON file')
          }
          onClick={busy ? undefined : download}
        />
        <ListRow
          icon="fa-arrow-right-from-bracket"
          title={tr('Sign out', 'Mag-sign out')}
          detail={tr('Your account stays. Sign in again any time.', 'Mananatili ang account mo. Mag-sign in ulit anumang oras.')}
          onClick={leave}
        />
        <ListRow
          icon="fa-trash-can"
          tone="danger"
          title={tr('Delete my account', 'Burahin ang account ko')}
          detail={tr('Erases your points, prescriptions and history', 'Mabubura ang iyong points, reseta at history')}
          onClick={() => setDeleting(true)}
        />
      </Card>

      <ErrorNote text={failure} />

      {deleting && <DeleteSheet onClose={() => setDeleting(false)} onDeleted={leave} />}
      <Toast text={toast} />
    </Screen>
  );
}

/** The customer types DELETE to confirm, so it cannot happen by a stray tap. */
function DeleteSheet({ onClose, onDeleted }: { onClose: () => void; onDeleted: () => void }) {
  const { tr } = useLang();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const ready = typed.trim().toUpperCase() === 'DELETE';

  const confirm = async () => {
    if (!ready) return;
    setBusy(true);
    setFailure('');
    try {
      await deleteAccount();
      onDeleted();
    } catch (e) {
      setFailure(
        tr(
          `${(e as Error)?.message || 'Could not delete your account.'} Nothing was erased. Check your connection and try again.`,
          `${(e as Error)?.message || 'Hindi mabura ang account mo.'} Walang nabura. Tingnan ang iyong connection at subukan ulit.`
        )
      );
      setBusy(false);
    }
  };

  return (
    <Sheet title={tr('Delete your account?', 'Burahin ang account mo?')} onClose={busy ? () => undefined : onClose}>
      <div className="rounded-[20px] border border-red-100 bg-white p-4">
        <p className="text-[13px] leading-relaxed text-gray-700">
          {tr(
            'This permanently erases your Getmeds account: your points and rewards, the prescriptions in your wallet, your patients, addresses, saved medicines, reminders and request history.',
            'Permanente nitong buburahin ang iyong Getmeds account: ang points at rewards mo, ang mga reseta sa wallet mo, ang mga pasyente, address, naka-save na gamot, reminder at history ng request.'
          )}
        </p>
        <p className="mt-2 text-[13px] font-semibold leading-relaxed text-red-600">{tr('It cannot be undone.', 'Hindi na ito maibabalik.')}</p>
        <p className="mt-2 text-[12px] leading-relaxed text-gray-500">
          {tr(
            'Download your data first if you want a copy. You will be signed out on this phone.',
            'I-download muna ang data mo kung gusto mo ng kopya. Masa-sign out ka sa phone na ito.'
          )}
        </p>
      </div>
      <Card>
        <Field id="delete-confirm" label={tr('Type DELETE to confirm', 'I-type ang DELETE para kumpirmahin')}>
          <input
            id="delete-confirm"
            className={`${inputClass} uppercase tracking-wider`}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="DELETE"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </Field>
      </Card>
      <ErrorNote text={failure} />
      <PrimaryButton tone="danger" onClick={confirm} disabled={!ready || busy}>
        {busy ? tr('Deleting…', 'Binubura…') : tr('Delete my account', 'Burahin ang account ko')}
      </PrimaryButton>
      <button id="delete-cancel" type="button" disabled={busy} onClick={onClose} className="w-full py-2 text-[13px] font-semibold text-gray-500 disabled:opacity-50">
        {tr('Keep my account', 'Huwag burahin ang account ko')}
      </button>
    </Sheet>
  );
}
