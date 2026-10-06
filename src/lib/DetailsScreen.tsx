'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { SavedDetails } from './accountStore';
import { USER_TYPES, typeByValue } from './audienceTypes';
import { useLang } from '@/lib/i18n';

/**
 * DetailsScreen.tsx
 * ─────────────────────────────────────────────
 * "My details" in the app: a full screen of its own, laid out the way a
 * shopping app lays out account details, grouped into cards with one Save
 * bar at the bottom. There is no checkout and no money here, so no cards,
 * wallets or saved payment methods: just who is asking, how to reach them
 * and, for patients, where the medicine goes.
 *
 * Everything is saved on the phone (see accountStore) and used to fill in
 * the inquiry forms. The website keeps its inline Details tab.
 */

const BRAND = '#1D9FDA';
const GROUND = '#FFFFFF';
const GRADIENT = 'linear-gradient(135deg,#1D9FDA,#61A644)';

type Errors = Partial<Record<keyof SavedDetails, string>>;

interface Props {
  details: SavedDetails;
  setDetails: React.Dispatch<React.SetStateAction<SavedDetails>>;
  avatar?: string;
  onPickAvatar: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveAvatar: () => void;
  /** False until the customer has allowed saving on this phone. */
  consented: boolean | null;
  /** Saves (asking for consent first when needed). Resolves true when saved. */
  onSave: () => Promise<boolean>;
  onClose: () => void;
  busy: boolean;
}

const PH_MOBILE = /^(\+?63|0)?9\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(d: SavedDetails, tr: (en: string, tl: string) => string): Errors {
  const e: Errors = {};
  if (!d.name?.trim()) e.name = tr('Enter your full name.', 'Ilagay ang buong pangalan mo.');
  const phone = (d.phone || '').replace(/[\s\-()]/g, '');
  if (!phone) e.phone = tr('Enter a mobile number so our team can reply.', 'Maglagay ng mobile number para makasagot ang team namin.');
  else if (!PH_MOBILE.test(phone)) e.phone = tr('Use a Philippine mobile number, like 0917 123 4567.', 'Gumamit ng Philippine mobile number, gaya ng 0917 123 4567.');
  if (d.email && !EMAIL.test(d.email.trim())) e.email = tr('Check the email address.', 'Pakisuri ang email address.');
  const audience = typeByValue(d.userType);
  for (const f of audience?.fields ?? []) {
    if (f.required && !String(d[f.key] ?? '').trim())
      e[f.key] = tr(`Enter your ${f.label.toLowerCase()}.`, `Ilagay ang ${(f.labelTl ?? f.label).toLowerCase()} mo.`);
  }
  if (d.age && !/^\d{1,3}$/.test(d.age)) e.age = tr('Age in years, numbers only.', 'Edad sa taon, numero lang.');
  return e;
}

/** One labelled input row inside a grouped card. */
function Row({
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

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="px-1">
        <h2 className="text-[13px] font-semibold text-gray-900">{title}</h2>
        {note && <p className="mt-0.5 text-[11.5px] leading-relaxed text-gray-500">{note}</p>}
      </div>
      <div className="overflow-hidden rounded-[20px] border border-[#EEF1F5] bg-white">{children}</div>
    </section>
  );
}

const input =
  'mt-1 w-full bg-transparent text-[15px] text-gray-900 outline-none placeholder:text-gray-300';

export default function DetailsScreen({
  details,
  setDetails,
  avatar,
  onPickAvatar,
  onRemoveAvatar,
  consented,
  onSave,
  onClose,
  busy,
}: Props) {
  const { tr } = useLang();
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState(false);
  const pushed = useRef(false);
  const audience = typeByValue(details.userType);
  const set = (key: keyof SavedDetails) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setDetails((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };

  // The phone's back button closes this screen instead of leaving the page.
  useEffect(() => {
    window.history.pushState({ gmDetails: true }, '');
    pushed.current = true;
    const onPop = () => {
      pushed.current = false;
      onClose();
    };
    window.addEventListener('popstate', onPop);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // The site's floating scroll-to-top button sits above everything and
    // would land on the form.
    const toTop = document.getElementById('scroll-to-top');
    // Its stylesheet uses !important, so only an inline !important wins.
    if (toTop) toTop.style.setProperty('display', 'none', 'important');
    return () => {
      window.removeEventListener('popstate', onPop);
      document.body.style.overflow = prev;
      if (toTop) toTop.style.removeProperty('display');
    };
  }, [onClose]);

  const close = () => {
    if (pushed.current) window.history.back();
    else onClose();
  };

  const save = async () => {
    const found = validate(details, tr);
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.querySelector(`[data-field="${first}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (await onSave()) {
      setSaved(true);
      window.setTimeout(close, 900);
    }
  };

  const initial = (details.name || 'U').trim().charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-[10040] flex flex-col" style={{ background: GROUND }} role="dialog" aria-modal="true" aria-labelledby="details-title" data-history-backed="">
      {/* Header */}
      <header
        className="flex items-center gap-2 border-b border-[#E7ECF2] bg-white px-2 pb-2.5"
        style={{ paddingTop: 'calc(10px + var(--gm-safe-top))' }}
      >
        <button type="button" onClick={close} aria-label={tr('Back', 'Bumalik')} className="flex h-10 w-10 items-center justify-center rounded-full text-gray-700">
          <i className="fa-solid fa-arrow-left text-[16px]" />
        </button>
        <div className="min-w-0 flex-1">
          <p id="details-title" className="text-[16px] font-semibold text-gray-900">{tr('My details', 'Mga detalye ko')}</p>
          <p className="text-[11.5px] text-gray-500">{tr('Used to fill in your requests', 'Ginagamit para punan ang mga request mo')}</p>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-6 pt-5">
        {/* Picture */}
        <div className="flex items-center gap-4 rounded-[20px] border border-[#EEF1F5] bg-white p-4">
          <label className="relative shrink-0 cursor-pointer" aria-label={avatar ? tr('Change picture', 'Palitan ang picture') : tr('Add a picture', 'Magdagdag ng picture')}>
            <span
              className="flex h-[64px] w-[64px] items-center justify-center overflow-hidden rounded-full text-[24px] font-bold text-white"
              style={{ background: BRAND }}
            >
              {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : initial}
            </span>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-gray-800 text-white">
              <i className="fa-solid fa-camera text-[9px]" />
            </span>
            <input type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
          </label>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-gray-900">{details.name || tr('Your name', 'Pangalan mo')}</p>
            <p className="text-[12px] text-gray-500">{audience ? tr(audience.label, audience.labelTl ?? audience.label) : tr('Choose who you are below', 'Piliin sa ibaba kung sino ka')}</p>
            {avatar && (
              <button type="button" onClick={onRemoveAvatar} className="mt-1 text-[11.5px] font-semibold text-gray-400">
                {tr('Remove picture', 'Alisin ang picture')}
              </button>
            )}
          </div>
        </div>

        {/* Who */}
        <section className="space-y-2">
          <div className="px-1">
            <h2 className="text-[13px] font-semibold text-gray-900">{tr('I’m requesting as', 'Nagre-request ako bilang')}</h2>
            <p className="mt-0.5 text-[11.5px] text-gray-500">{tr('Sends your requests to the right Getmeds team.', 'Ipinapadala ang mga request mo sa tamang Getmeds team.')}</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label={tr('I’m requesting as', 'Nagre-request ako bilang')}>
            {USER_TYPES.map((t) => {
              const on = details.userType === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setDetails((d) => ({ ...d, userType: t.value }))}
                  className="relative flex min-h-[76px] flex-col items-start justify-between gap-2 rounded-[18px] border bg-white p-3 text-left transition"
                  style={on ? { borderColor: BRAND, boxShadow: `0 0 0 1px ${BRAND}` } : { borderColor: '#EEF1F5' }}
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full"
                    style={{ background: on ? BRAND : '#F1F5F9', color: on ? '#fff' : '#64748B' }}
                  >
                    <i className={`fa-solid ${t.icon} text-[13px]`} />
                  </span>
                  <span className="text-[12.5px] font-semibold leading-tight text-gray-800">{tr(t.label, t.labelTl ?? t.label)}</span>
                  {on && <i className="fa-solid fa-circle-check absolute right-3 top-3 text-[15px]" style={{ color: BRAND }} />}
                </button>
              );
            })}
          </div>
        </section>

        {/* Contact */}
        <Card
          title={tr('Contact information', 'Contact information')}
          note={tr('How our team replies with availability and a quote.', 'Dito sasagot ang team namin tungkol sa availability at quote.')}
        >
          <Row id="name" label={tr('Full name', 'Buong pangalan')} error={errors.name}>
            <input id="name" className={input} autoComplete="name" placeholder="Juan Dela Cruz" value={details.name || ''} onChange={set('name')} />
          </Row>
          <Row id="phone" label="Mobile number" error={errors.phone}>
            <input
              id="phone"
              className={input}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0917 123 4567"
              value={details.phone || ''}
              onChange={(e) => {
                e.target.value = e.target.value.replace(/[^\d+\s\-()]/g, '');
                set('phone')(e);
              }}
            />
          </Row>
          <Row id="email" label="Email address" optional error={errors.email}>
            <input id="email" className={input} type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={details.email || ''} onChange={set('email')} />
          </Row>
        </Card>

        {/* Patients: where it goes, and who to call */}
        {audience?.kind === 'patient' && (
          <>
            <Card
              title={tr('Delivery', 'Delivery')}
              note={tr('Where the medicine goes once your request is confirmed.', 'Kung saan dadalhin ang gamot kapag nakumpirma na ang request mo.')}
            >
              <Row id="address" label={tr('Delivery address', 'Address para sa delivery')} error={errors.address}>
                <textarea
                  id="address"
                  rows={3}
                  className={`${input} resize-none leading-snug`}
                  autoComplete="street-address"
                  placeholder={tr('House no., street, barangay, city, province', 'Blg. ng bahay, kalye, barangay, lungsod, probinsya')}
                  value={details.address || ''}
                  onChange={set('address')}
                />
              </Row>
              <Row id="age" label={tr('Patient’s age', 'Edad ng pasyente')} error={errors.age}>
                <input
                  id="age"
                  className={input}
                  inputMode="numeric"
                  placeholder={tr('e.g. 54', 'hal. 54')}
                  value={details.age || ''}
                  onChange={(e) => {
                    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3);
                    set('age')(e);
                  }}
                />
              </Row>
            </Card>
            <Card
              title={tr('Contact person', 'Contact person')}
              note={tr('Someone we can reach if the patient can’t answer.', 'Taong matatawagan namin kung hindi makasagot ang pasyente.')}
            >
              <Row id="contactName" label={tr('Name', 'Pangalan')} optional>
                <input id="contactName" className={input} placeholder="Maria Dela Cruz" value={details.contactName || ''} onChange={set('contactName')} />
              </Row>
              <Row id="contactRelationship" label={tr('Relationship to the patient', 'Kaugnayan sa pasyente')} optional>
                <input id="contactRelationship" className={input} placeholder={tr('e.g. Daughter', 'hal. Anak')} value={details.contactRelationship || ''} onChange={set('contactRelationship')} />
              </Row>
            </Card>
          </>
        )}

        {/* Doctors, pharmacies, hospitals: the columns their team's sheet has */}
        {audience && audience.kind !== 'patient' && audience.fields.length > 0 && (
          <Card
            title={tr('Work details', 'Detalye ng trabaho')}
            note={tr('Helps the right team prepare your quote.', 'Para maihanda ng tamang team ang quote mo.')}
          >
            {audience.fields.map((f) => (
              <Row key={f.key} id={f.key} label={tr(f.label, f.labelTl ?? f.label)} optional={!f.required} error={errors[f.key]}>
                <input id={f.key} className={input} value={(details[f.key] as string) || ''} onChange={set(f.key)} />
              </Row>
            ))}
          </Card>
        )}

        <p className="flex gap-2 px-1 text-[11.5px] leading-relaxed text-gray-500">
          <i className="fa-solid fa-lock mt-[3px] text-[10px] text-gray-400" />
          {tr(
            'Saved only on this phone. Getmeds sees these details only when you send a request.',
            'Sa phone na ito lang naka-save. Makikita lang ng Getmeds ang mga detalyeng ito kapag nagpadala ka ng request.',
          )}
        </p>
      </div>

      {/* Save bar */}
      <div
        className="border-t border-[#E7ECF2] bg-white px-4 pt-3"
        style={{ paddingBottom: 'calc(12px + var(--gm-safe-bottom))' }}
      >
        <button
          type="button"
          disabled={busy || saved}
          onClick={save}
          className="w-full rounded-full py-3.5 text-[14px] font-semibold text-white disabled:opacity-70"
          style={{ background: saved ? '#61A644' : GRADIENT }}
        >
          {saved
            ? tr('✓ Saved', '✓ Na-save na')
            : busy
              ? tr('Saving…', 'Sine-save…')
              : consented === false
                ? tr('Allow and save on this phone', 'Payagan at i-save sa phone na ito')
                : tr('Save details', 'I-save ang mga detalye')}
        </button>
      </div>
    </div>
  );
}
