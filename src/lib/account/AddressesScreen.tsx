'use client';

import React, { useEffect, useState } from 'react';
import { Card, Empty, ErrorNote, Field, PrimaryButton, Screen, Sheet, SmallButton, Toast, inputClass, useToast } from '../ui/Screen';
import { newKey, saveList, useAccountData, type Address } from '../accountApi';
import { useLang } from '../i18n';

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

const LABELS: Array<{ value: string; labelTl: string; icon: string }> = [
  { value: 'Home', labelTl: 'Bahay', icon: 'fa-house' },
  { value: 'Work', labelTl: 'Trabaho', icon: 'fa-briefcase' },
  { value: 'Hospital', labelTl: 'Ospital', icon: 'fa-hospital' },
  { value: 'Other', labelTl: 'Iba pa', icon: 'fa-location-dot' },
];

const iconFor = (label: string) =>
  LABELS.find((l) => l.value.toLowerCase() === label.trim().toLowerCase())?.icon ?? 'fa-location-dot';

/** A preset label in the chosen language; a label the customer typed stays as typed. */
const labelText = (label: string, tr: (en: string, tl: string) => string) => {
  const preset = LABELS.find((l) => l.value.toLowerCase() === label.trim().toLowerCase());
  return preset ? tr(preset.value, preset.labelTl) : label;
};

type Draft = Omit<Address, '_key'> & { _key?: string };
type Errors = Partial<Record<'address' | 'phone', string>>;

const BLANK: Draft = { label: 'Home', address: '', recipient: '', phone: '', isDefault: false };

function validate(d: Draft, tr: (en: string, tl: string) => string): Errors {
  const e: Errors = {};
  if (!d.address.trim()) e.address = tr('Enter the full delivery address.', 'Ilagay ang buong delivery address.');
  const phone = (d.phone || '').replace(/[\s\-()]/g, '');
  if (phone && !PH_MOBILE.test(phone))
    e.phone = tr('Use a Philippine mobile number, like 0917 123 4567.', 'Gumamit ng Philippine mobile number, tulad ng 0917 123 4567.');
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
  const { tr } = useLang();
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
      showToast(tr('Default address changed', 'Napalitan ang default address'));
    } catch (e) {
      setFailure(
        tr(
          `${(e as Error)?.message || 'Could not change the default.'} Check your connection and try again.`,
          `${(e as Error)?.message || 'Hindi mapalitan ang default.'} Tingnan ang iyong connection at subukan ulit.`
        )
      );
    } finally {
      setDefaulting('');
    }
  };

  // The default first, the rest in the order they were added.
  const ordered = [...addresses].sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)));

  return (
    <Screen
      title={tr('Delivery addresses', 'Mga delivery address')}
      subtitle={tr('Where your medicines can go', 'Kung saan puwedeng ipadala ang gamot mo')}
      onClose={onClose}
      level={level}
      headerAction={
        data && addresses.length > 0 && !full ? (
          <SmallButton onClick={add}>
            <i className="fa-solid fa-plus mr-1 text-[10px]" />
            {tr('Add', 'Magdagdag')}
          </SmallButton>
        ) : undefined
      }
    >
      {!data ? (
        loadError ? (
          <div className="space-y-3">
            <ErrorNote text={tr(`${loadError} Check your connection and try again.`, `${loadError} Tingnan ang iyong connection at subukan ulit.`)} />
            <SmallButton onClick={() => reload()}>{tr('Try again', 'Subukan ulit')}</SmallButton>
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
          title={tr('No addresses yet', 'Wala pang address')}
          text={tr(
            'Save your home, work or a hospital once. Your requests then fill in the delivery address for you.',
            'I-save nang isang beses ang bahay, trabaho o ospital. Kusa nang mapupunan ang delivery address sa iyong mga request.'
          )}
          action={
            <div className="mx-auto max-w-[240px]">
              <PrimaryButton onClick={add}>{tr('Add an address', 'Magdagdag ng address')}</PrimaryButton>
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
                      {a.label ? labelText(a.label, tr) : tr('Address', 'Address')}
                    </span>
                    {a.isDefault && (
                      <span className="rounded-full bg-green-50 px-2 py-[3px] text-[10.5px] font-semibold text-green-700">{tr('Default', 'Default')}</span>
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
                  {tr('Edit', 'I-edit')}
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
                    {defaulting === a._key ? tr('Setting…', 'Sine-set…') : tr('Set as default', 'Gawing default')}
                  </button>
                </div>
              )}
            </article>
          ))}
          {full && (
            <p className="px-1 text-[11.5px] leading-relaxed text-gray-500">
              {tr(
                `You can keep up to ${MAX_ADDRESSES} addresses. Remove one to add another.`,
                `Hanggang ${MAX_ADDRESSES} address lang ang puwedeng i-save. Mag-alis ng isa para makapagdagdag.`
              )}
            </p>
          )}
        </div>
      )}

      <p className="flex gap-2 px-1 text-[11.5px] leading-relaxed text-gray-500">
        <i className="fa-solid fa-lock mt-[3px] text-[10px] text-gray-400" />
        {tr(
          'Kept with your Getmeds account. Our team sees an address only when you send a request with it.',
          'Nakatabi sa iyong Getmeds account. Makikita lang ng aming team ang address kapag ginamit mo ito sa isang request.'
        )}
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
  const { tr } = useLang();
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
    const found = validate(draft, tr);
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
      onSaved(editing ? tr('Address updated', 'Na-update ang address') : tr('Address added', 'Naidagdag ang address'));
    } catch (e) {
      setFailure(
        tr(
          `${(e as Error)?.message || 'Could not save.'} Check your connection and tap Save again.`,
          `${(e as Error)?.message || 'Hindi ma-save.'} Tingnan ang iyong connection at i-tap ulit ang I-save.`
        )
      );
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('delete');
    setFailure('');
    try {
      await saveList('addresses', withOneDefault(addresses.filter((a) => a._key !== initial._key)));
      onSaved(tr('Address removed', 'Inalis ang address'));
    } catch (e) {
      setFailure(
        tr(
          `${(e as Error)?.message || 'Could not remove.'} Check your connection and try again.`,
          `${(e as Error)?.message || 'Hindi maalis.'} Tingnan ang iyong connection at subukan ulit.`
        )
      );
      setBusy(null);
      setConfirming(false);
    }
  };

  const preset = LABELS.some((l) => l.value === draft.label);

  return (
    <Sheet
      title={editing ? tr('Edit address', 'I-edit ang address') : tr('Add an address', 'Magdagdag ng address')}
      onClose={busy ? () => undefined : onClose}
    >
      <Card>
        <Field id="address-label" label={tr('Label', 'Label')}>
          <div className="mt-1.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label={tr('Label', 'Label')}>
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
                  {tr(l.value, l.labelTl)}
                </button>
              );
            })}
          </div>
          <input
            id="address-label"
            className={`${inputClass} mt-2.5 text-[13.5px]`}
            placeholder={tr("Or type your own, like Lola's house", 'O mag-type ng sarili, tulad ng Bahay ni Lola')}
            maxLength={40}
            value={preset ? '' : draft.label}
            onChange={(e) => {
              const value = e.target.value;
              setDraft((d) => ({ ...d, label: value || 'Other' }));
            }}
          />
        </Field>
        <Field id="address-text" label={tr('Full address', 'Buong address')} error={errors.address}>
          <textarea
            id="address-text"
            rows={3}
            className={`${inputClass} resize-none leading-snug`}
            autoComplete="street-address"
            placeholder={tr('House no., street, barangay, city, province', 'Blg. ng bahay, kalye, barangay, lungsod, probinsya')}
            value={draft.address}
            onChange={set('address')}
          />
        </Field>
        <Field id="address-recipient" label={tr('Recipient', 'Tatanggap')} optional>
          <input
            id="address-recipient"
            className={inputClass}
            autoComplete="name"
            placeholder={tr('Who receives the medicine', 'Sino ang tatanggap ng gamot')}
            value={draft.recipient || ''}
            onChange={set('recipient')}
          />
        </Field>
        <Field id="address-phone" label={tr("Recipient's mobile", 'Mobile ng tatanggap')} optional error={errors.phone}>
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
            <span className="text-[14px] text-gray-900">{tr('Use as my default', 'Gawing default ko')}</span>
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
            {tr('Remove the ', 'Alisin ang ')}
            <span className="font-semibold">{initial.label ? labelText(initial.label, tr) : tr('saved', 'naka-save na')}</span>
            {tr(' address?', ' address?')}
            {initial.isDefault && addresses.length > 1
              ? tr(' Your next address becomes the default.', ' Ang susunod mong address ang magiging default.')
              : ''}
          </p>
          <div className="flex gap-2">
            <button
              id="address-delete-cancel"
              type="button"
              disabled={busy === 'delete'}
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-full bg-[#F1F5F9] py-3 text-[13.5px] font-semibold text-gray-600 disabled:opacity-50"
            >
              {tr('Keep', 'Huwag alisin')}
            </button>
            <button
              id="address-delete-confirm"
              type="button"
              disabled={busy === 'delete'}
              onClick={remove}
              className="flex-1 rounded-full bg-red-600 py-3 text-[13.5px] font-semibold text-white disabled:opacity-60"
            >
              {busy === 'delete' ? tr('Removing…', 'Inaalis…') : tr('Remove', 'Alisin')}
            </button>
          </div>
        </div>
      ) : (
        <>
          <PrimaryButton onClick={save} disabled={busy !== null}>
            {busy === 'save'
              ? tr('Saving…', 'Sine-save…')
              : editing
                ? tr('Save changes', 'I-save ang mga pagbabago')
                : tr('Add address', 'Idagdag ang address')}
          </PrimaryButton>
          {editing && (
            <button
              id="address-delete"
              type="button"
              disabled={busy !== null}
              onClick={() => setConfirming(true)}
              className="w-full py-2 text-[13px] font-semibold text-red-500 disabled:opacity-50"
            >
              {tr('Remove address', 'Alisin ang address')}
            </button>
          )}
        </>
      )}
    </Sheet>
  );
}
