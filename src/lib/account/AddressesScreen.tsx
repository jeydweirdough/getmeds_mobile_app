'use client';

import React, { useEffect, useState } from 'react';
import { Card, Empty, ErrorNote, Field, PrimaryButton, Screen, Sheet, SmallButton, Toast, inputClass, useToast } from '../ui/Screen';
import { newKey, saveList, useAccountData, type Address } from '../accountApi';

/**
 * AddressesScreen.tsx
 * ─────────────────────────────────────────────
 * Delivery addresses, laid out like a shopping app's address book: one card
 * per place, a label chip, who receives it, and a Default badge on the one
 * the request list picks first.
 *
 * Like patients, the list is saved whole. The server enforces exactly one
 * default, and this screen keeps to the same rule before it sends, so what
 * shows straight away matches what comes back: the first address becomes the
 * default, and removing the default hands it to the next one.
 */

const MAX_ADDRESSES = 10;
const PH_MOBILE = /^(\+?63|0)?9\d{9}$/;

const LABELS: Array<{ value: string; icon: string }> = [
  { value: 'Home', icon: 'fa-house' },
  { value: 'Work', icon: 'fa-briefcase' },
  { value: 'Hospital', icon: 'fa-hospital' },
  { value: 'Other', icon: 'fa-location-dot' },
];

const iconFor = (label: string) =>
  LABELS.find((l) => l.value.toLowerCase() === label.trim().toLowerCase())?.icon ?? 'fa-location-dot';

type Draft = Omit<Address, '_key'> & { _key?: string };
type Errors = Partial<Record<'address' | 'phone', string>>;

const BLANK: Draft = { label: 'Home', address: '', recipient: '', phone: '', isDefault: false };

function validate(d: Draft): Errors {
  const e: Errors = {};
  if (!d.address.trim()) e.address = 'Enter the full delivery address.';
  const phone = (d.phone || '').replace(/[\s\-()]/g, '');
  if (phone && !PH_MOBILE.test(phone)) e.phone = 'Use a Philippine mobile number, like 0917 123 4567.';
  return e;
}

/** Exactly one default: the one asked for, else the current one, else the first. */
function withOneDefault(list: Address[], preferKey?: string): Address[] {
  if (list.length === 0) return list;
  const key = preferKey ?? list.find((a) => a.isDefault)?._key ?? list[0]._key;
  return list.map((a) => ({ ...a, isDefault: a._key === key }));
}

export default function AddressesScreen({
  onClose,
  startAdding = false,
  level,
}: {
  onClose: () => void;
  /** Opens straight into the add form, e.g. from "+ Add address" on the request list. */
  startAdding?: boolean;
  level?: number;
}) {
  const { data, error: loadError, reload } = useAccountData();
  const addresses = data?.addresses ?? [];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toast, showToast] = useToast();
  const [defaulting, setDefaulting] = useState('');
  const [failure, setFailure] = useState('');

  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    if (!startAdding || autoOpened || !data) return;
    setAutoOpened(true);
    if (data.addresses.length < MAX_ADDRESSES) setDraft({ ...BLANK });
  }, [startAdding, autoOpened, data]);

  const full = addresses.length >= MAX_ADDRESSES;
  const add = () => setDraft({ ...BLANK });

  const makeDefault = async (key: string) => {
    setDefaulting(key);
    setFailure('');
    try {
      await saveList('addresses', withOneDefault(addresses, key));
      showToast('Default address changed');
    } catch (e) {
      setFailure(`${(e as Error)?.message || 'Could not change the default.'} Check your connection and try again.`);
    } finally {
      setDefaulting('');
    }
  };

  // The default first, the rest in the order they were added.
  const ordered = [...addresses].sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)));

  return (
    <Screen
      title="Delivery addresses"
      subtitle="Where your medicines can go"
      onClose={onClose}
      level={level}
      headerAction={
        data && addresses.length > 0 && !full ? (
          <SmallButton onClick={add}>
            <i className="fa-solid fa-plus mr-1 text-[10px]" />
            Add
          </SmallButton>
        ) : undefined
      }
    >
      {!data ? (
        loadError ? (
          <div className="space-y-3">
            <ErrorNote text={`${loadError} Check your connection and try again.`} />
            <SmallButton onClick={() => reload()}>Try again</SmallButton>
          </div>
        ) : (
          <div className="space-y-2.5" aria-busy="true">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-[112px] animate-pulse rounded-[20px] bg-white" />
            ))}
          </div>
        )
      ) : addresses.length === 0 ? (
        <Empty
          icon="fa-location-dot"
          title="No addresses yet"
          text="Save your home, work or a hospital once. Your requests then fill in the delivery address for you."
          action={
            <div className="mx-auto max-w-[240px]">
              <PrimaryButton onClick={add}>Add an address</PrimaryButton>
            </div>
          }
        />
      ) : (
        <div className="space-y-2.5">
          <ErrorNote text={failure} />
          {ordered.map((a) => (
            <article
              key={a._key}
              className="rounded-[20px] border bg-white p-4"
              style={a.isDefault ? { borderColor: '#BFE3F5' } : { borderColor: '#EEF1F5' }}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F8FE] px-2 py-[3px] text-[11px] font-semibold text-[#1D9FDA]">
                      <i className={`fa-solid ${iconFor(a.label)} text-[9.5px]`} />
                      {a.label || 'Address'}
                    </span>
                    {a.isDefault && (
                      <span className="rounded-full bg-green-50 px-2 py-[3px] text-[10.5px] font-semibold text-green-700">Default</span>
                    )}
                  </div>
                  {(a.recipient || a.phone) && (
                    <p className="mt-2 text-[13.5px] font-semibold text-gray-900">
                      {a.recipient}
                      {a.recipient && a.phone && <span className="mx-1.5 font-normal text-gray-300">|</span>}
                      {a.phone && <span className="font-normal text-gray-500">{a.phone}</span>}
                    </p>
                  )}
                  <p className="mt-1 whitespace-pre-line text-[12.5px] leading-snug text-gray-600">{a.address}</p>
                </div>
                <button
                  id={`address-edit-${a._key}`}
                  type="button"
                  onClick={() => setDraft({ ...a })}
                  className="shrink-0 text-[12.5px] font-semibold text-[#1D9FDA]"
                >
                  Edit
                </button>
              </div>
              {!a.isDefault && (
                <div className="mt-3 border-t border-[#EEF1F5] pt-2.5">
                  <button
                    id={`address-default-${a._key}`}
                    type="button"
                    disabled={Boolean(defaulting)}
                    onClick={() => makeDefault(a._key)}
                    className="text-[12px] font-semibold text-gray-500 disabled:opacity-50"
                  >
                    {defaulting === a._key ? 'Setting…' : 'Set as default'}
                  </button>
                </div>
              )}
            </article>
          ))}
          {full && (
            <p className="px-1 text-[11.5px] leading-relaxed text-gray-500">
              You can keep up to {MAX_ADDRESSES} addresses. Remove one to add another.
            </p>
          )}
        </div>
      )}

      <p className="flex gap-2 px-1 text-[11.5px] leading-relaxed text-gray-500">
        <i className="fa-solid fa-lock mt-[3px] text-[10px] text-gray-400" />
        Kept with your Getmeds account. Our team sees an address only when you send a request with it.
      </p>

      {draft && (
        <AddressSheet
          draft={draft}
          addresses={addresses}
          onClose={() => setDraft(null)}
          onSaved={(text) => {
            setDraft(null);
            showToast(text);
          }}
        />
      )}
      <Toast text={toast} />
    </Screen>
  );
}

function AddressSheet({
  draft: initial,
  addresses,
  onClose,
  onSaved,
}: {
  draft: Draft;
  addresses: Address[];
  onClose: () => void;
  onSaved: (toast: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [failure, setFailure] = useState('');
  const [confirming, setConfirming] = useState(false);
  const editing = Boolean(initial._key);
  // The first address is always the default, so the switch would only confuse.
  const firstOne = !editing && addresses.length === 0;

  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setDraft((d) => ({ ...d, [key]: value }));
    if (key in errors) setErrors((x) => ({ ...x, [key]: undefined }));
  };

  const save = async () => {
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy('save');
    setFailure('');
    const clean: Address = {
      _key: draft._key || newKey(),
      label: draft.label.trim() || 'Home',
      address: draft.address.trim(),
      recipient: (draft.recipient || '').trim(),
      phone: (draft.phone || '').trim(),
      isDefault: Boolean(draft.isDefault),
    };
    const list = editing ? addresses.map((a) => (a._key === clean._key ? clean : a)) : [...addresses, clean];
    // Ticking "default" moves it here; unticking the current default hands it on.
    const prefer = clean.isDefault ? clean._key : initial.isDefault ? list.find((a) => a._key !== clean._key)?._key : undefined;
    try {
      await saveList('addresses', withOneDefault(list, prefer));
      onSaved(editing ? 'Address updated' : 'Address added');
    } catch (e) {
      setFailure(`${(e as Error)?.message || 'Could not save.'} Check your connection and tap Save again.`);
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('delete');
    setFailure('');
    try {
      await saveList('addresses', withOneDefault(addresses.filter((a) => a._key !== initial._key)));
      onSaved('Address removed');
    } catch (e) {
      setFailure(`${(e as Error)?.message || 'Could not remove.'} Check your connection and try again.`);
      setBusy(null);
      setConfirming(false);
    }
  };

  const preset = LABELS.some((l) => l.value === draft.label);

  return (
    <Sheet title={editing ? 'Edit address' : 'Add an address'} onClose={busy ? () => undefined : onClose}>
      <Card>
        <Field id="address-label" label="Label">
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Label">
            {LABELS.map((l) => {
              const on = draft.label === l.value;
              return (
                <button
                  key={l.value}
                  id={`address-label-${l.value.toLowerCase()}`}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setDraft((d) => ({ ...d, label: l.value }))}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ${on ? 'bg-[#1D9FDA] text-white' : 'bg-[#F1F5F9] text-gray-600'}`}
                >
                  <i className={`fa-solid ${l.icon} text-[10px]`} />
                  {l.value}
                </button>
              );
            })}
          </div>
          <input
            id="address-label"
            className={`${inputClass} mt-2.5 text-[13.5px]`}
            placeholder="Or type your own, like Lola's house"
            maxLength={40}
            value={preset ? '' : draft.label}
            onChange={(e) => {
              const value = e.target.value;
              setDraft((d) => ({ ...d, label: value || 'Other' }));
            }}
          />
        </Field>
        <Field id="address-text" label="Full address" error={errors.address}>
          <textarea
            id="address-text"
            rows={3}
            className={`${inputClass} resize-none leading-snug`}
            autoComplete="street-address"
            placeholder="House no., street, barangay, city, province"
            value={draft.address}
            onChange={set('address')}
          />
        </Field>
        <Field id="address-recipient" label="Recipient" optional>
          <input
            id="address-recipient"
            className={inputClass}
            autoComplete="name"
            placeholder="Who receives the medicine"
            value={draft.recipient || ''}
            onChange={set('recipient')}
          />
        </Field>
        <Field id="address-phone" label="Recipient's mobile" optional error={errors.phone}>
          <input
            id="address-phone"
            className={inputClass}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0917 123 4567"
            value={draft.phone || ''}
            onChange={(e) => {
              e.target.value = e.target.value.replace(/[^\d+\s\-()]/g, '');
              set('phone')(e);
            }}
          />
        </Field>
        {!firstOne && !(editing && initial.isDefault) && (
          <label htmlFor="address-default" className="flex items-center justify-between gap-3 border-t border-[#EEF1F5] px-4 py-3.5">
            <span className="text-[14px] text-gray-900">Use as my default</span>
            <input
              id="address-default"
              type="checkbox"
              checked={Boolean(draft.isDefault)}
              onChange={(e) => setDraft((d) => ({ ...d, isDefault: e.target.checked }))}
              className="h-[18px] w-[18px] rounded"
              style={{ accentColor: '#1D9FDA' }}
            />
          </label>
        )}
      </Card>

      <ErrorNote text={failure} />

      {confirming ? (
        <div className="space-y-3 rounded-[20px] border border-red-100 bg-white p-4">
          <p className="text-[13px] leading-snug text-gray-700">
            Remove the <span className="font-semibold">{initial.label || 'saved'}</span> address?
            {initial.isDefault && addresses.length > 1 ? ' Your next address becomes the default.' : ''}
          </p>
          <div className="flex gap-2">
            <button
              id="address-delete-cancel"
              type="button"
              disabled={busy === 'delete'}
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-full bg-[#F1F5F9] py-3 text-[13.5px] font-semibold text-gray-600 disabled:opacity-50"
            >
              Keep
            </button>
            <button
              id="address-delete-confirm"
              type="button"
              disabled={busy === 'delete'}
              onClick={remove}
              className="flex-1 rounded-full bg-red-600 py-3 text-[13.5px] font-semibold text-white disabled:opacity-60"
            >
              {busy === 'delete' ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <PrimaryButton onClick={save} disabled={busy !== null}>
            {busy === 'save' ? 'Saving…' : editing ? 'Save changes' : 'Add address'}
          </PrimaryButton>
          {editing && (
            <button
              id="address-delete"
              type="button"
              disabled={busy !== null}
              onClick={() => setConfirming(true)}
              className="w-full py-2 text-[13px] font-semibold text-red-500 disabled:opacity-50"
            >
              Remove address
            </button>
          )}
        </>
      )}
    </Sheet>
  );
}
