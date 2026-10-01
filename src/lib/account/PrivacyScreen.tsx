'use client';

import React, { useState } from 'react';
import { BRAND, Card, ErrorNote, Field, ListRow, PrimaryButton, Screen, Sheet, Toast, inputClass, useToast } from '../ui/Screen';
import { deleteAccount, exportAccount, manilaToday } from '../accountApi';
import { signOut } from '../rewards';

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
  { icon: 'fa-mobile-screen-button', text: 'Your mobile number, used to sign in' },
  { icon: 'fa-id-card', text: 'My details: name, email and delivery details' },
  { icon: 'fa-user-group', text: 'Patients and delivery addresses you add' },
  { icon: 'fa-heart', text: 'Saved medicines, saved guides and refill reminders' },
  { icon: 'fa-file-prescription', text: 'Prescriptions in your wallet' },
  { icon: 'fa-clock-rotate-left', text: 'Requests you have sent' },
  { icon: 'fa-star', text: 'Getmeds Points, rewards and Patient Assistance applications' },
];

const ON_PHONE = [
  { icon: 'fa-image', text: 'Your profile picture' },
  { icon: 'fa-list-check', text: 'Your request list, until you send it' },
];

export default function PrivacyScreen({ onClose, onSignedOut }: { onClose: () => void; onSignedOut: () => void }) {
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
      showToast('Your data is downloading');
    } catch (e) {
      setFailure(`${(e as Error)?.message || 'Could not prepare your data.'} Check your connection and try again.`);
    }
    setBusy(null);
  };

  const leave = () => {
    signOut();
    onSignedOut();
  };

  return (
    <Screen title="Privacy and data" subtitle="What we keep and how to remove it" onClose={onClose}>
      <Card title="Kept with your Getmeds account" note="So it is there on any phone you sign in on.">
        {KEPT.map((k) => (
          <ListRow key={k.text} icon={k.icon} title={<span className="text-[13px] font-normal text-gray-700">{k.text}</span>} />
        ))}
      </Card>

      <Card title="Only on this phone" note="Never sent to Getmeds, and not on your other devices.">
        {ON_PHONE.map((k) => (
          <ListRow key={k.text} icon={k.icon} title={<span className="text-[13px] font-normal text-gray-700">{k.text}</span>} />
        ))}
      </Card>

      <p className="flex gap-2 px-1 text-[11.5px] leading-relaxed text-gray-500">
        <i className="fa-solid fa-scale-balanced mt-[3px] text-[10px] text-gray-400" />
        <span>
          Getmeds processes your data in accordance with the Data Privacy Act of 2012. Read the{' '}
          <a href="/privacy-policy" className="font-semibold underline" style={{ color: BRAND }}>
            Privacy Policy
          </a>
          .
        </span>
      </p>

      <Card title="Your choices">
        <ListRow
          icon="fa-download"
          title="Download my data"
          detail={busy === 'export' ? 'Preparing your file…' : 'A copy of everything above, as a JSON file'}
          onClick={busy ? undefined : download}
        />
        <ListRow icon="fa-arrow-right-from-bracket" title="Sign out" detail="Your account stays. Sign in again any time." onClick={leave} />
        <ListRow
          icon="fa-trash-can"
          tone="danger"
          title="Delete my account"
          detail="Erases your points, prescriptions and history"
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
      setFailure(`${(e as Error)?.message || 'Could not delete your account.'} Nothing was erased. Check your connection and try again.`);
      setBusy(false);
    }
  };

  return (
    <Sheet title="Delete your account?" onClose={busy ? () => undefined : onClose}>
      <div className="rounded-[20px] border border-red-100 bg-white p-4">
        <p className="text-[13px] leading-relaxed text-gray-700">
          This permanently erases your Getmeds account: your points and rewards, the prescriptions in your wallet, your
          patients, addresses, saved medicines, reminders and request history.
        </p>
        <p className="mt-2 text-[13px] font-semibold leading-relaxed text-red-600">It cannot be undone.</p>
        <p className="mt-2 text-[12px] leading-relaxed text-gray-500">
          Download your data first if you want a copy. You will be signed out on this phone.
        </p>
      </div>
      <Card>
        <Field id="delete-confirm" label="Type DELETE to confirm">
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
        {busy ? 'Deleting…' : 'Delete my account'}
      </PrimaryButton>
      <button id="delete-cancel" type="button" disabled={busy} onClick={onClose} className="w-full py-2 text-[13px] font-semibold text-gray-500 disabled:opacity-50">
        Keep my account
      </button>
    </Sheet>
  );
}
