'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { SavedDetails } from './accountStore';
import { USER_TYPES, typeByValue } from './audienceTypes';

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
const GROUND = '#F3F6FB';
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

function validate(d: SavedDetails): Errors {
  const e: Errors = {};
  if (!d.name?.trim()) e.name = 'Enter your full name.';
  const phone = (d.phone || '').replace(/[\s\-()]/g, '');
  if (!phone) e.phone = 'Enter a mobile number so our team can reply.';
  else if (!PH_MOBILE.test(phone)) e.phone = 'Use a Philippine mobile number, like 0917 123 4567.';
  if (d.email && !EMAIL.test(d.email.trim())) e.email = 'Check the email address.';
  const audience = typeByValue(d.userType);
  for (const f of audience?.fields ?? []) {
    if (f.required && !String(d[f.key] ?? '').trim()) e[f.key] = `Enter your ${f.label.toLowerCase()}.`;
  }
  if (d.age && !/^\d{1,3}$/.test(d.age)) e.age = 'Age in years, numbers only.';
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
  return (
    <div className="border-t border-[#EEF1F5] px-4 py-3 first:border-t-0" data-field={id}>
      <label htmlFor={id} className="flex items-baseline justify-between text-[11.5px] font-medium text-gray-500">
        {label}
        {optional && <span className="text-[10.5px] font-normal text-gray-400">Optional</span>}
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
    const found = validate(details);
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
    <div className="fixed inset-0 z-[10040] flex flex-col" style={{ background: GROUND }} role="dialog" aria-modal="true" aria-labelledby="details-title">
      {/* Header */}
      <header
        className="flex items-center gap-2 border-b border-[#E7ECF2] bg-white px-2 pb-2.5"
        style={{ paddingTop: 'calc(10px + env(safe-area-inset-top, 0px))' }}
      >
        <button type="button" onClick={close} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full text-gray-700">
          <i className="fa-solid fa-arrow-left text-[16px]" />
        </button>
        <div className="min-w-0 flex-1">
          <p id="details-title" className="text-[16px] font-semibold text-gray-900">My details</p>
          <p className="text-[11.5px] text-gray-500">Used to fill in your requests</p>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-6 pt-5">
        {/* Picture */}
        <div className="flex items-center gap-4 rounded-[20px] border border-[#EEF1F5] bg-white p-4">
          <label className="relative shrink-0 cursor-pointer" aria-label={avatar ? 'Change picture' : 'Add a picture'}>
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
            <p className="truncate text-[15px] font-semibold text-gray-900">{details.name || 'Your name'}</p>
            <p className="text-[12px] text-gray-500">{audience?.label ?? 'Choose who you are below'}</p>
            {avatar && (
              <button type="button" onClick={onRemoveAvatar} className="mt-1 text-[11.5px] font-semibold text-gray-400">
                Remove picture
              </button>
            )}
          </div>
        </div>

        {/* Who */}
        <section className="space-y-2">
          <div className="px-1">
            <h2 className="text-[13px] font-semibold text-gray-900">I&rsquo;m requesting as</h2>
            <p className="mt-0.5 text-[11.5px] text-gray-500">Sends your requests to the right Getmeds team.</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="I'm requesting as">
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
                  <span className="text-[12.5px] font-semibold leading-tight text-gray-800">{t.label}</span>
                  {on && <i className="fa-solid fa-circle-check absolute right-3 top-3 text-[15px]" style={{ color: BRAND }} />}
                </button>
              );
            })}
          </div>
        </section>

        {/* Contact */}
        <Card title="Contact information" note="How our team replies with availability and a quote.">
          <Row id="name" label="Full name" error={errors.name}>
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
            <Card title="Delivery" note="Where the medicine goes once your request is confirmed.">
              <Row id="address" label="Delivery address" error={errors.address}>
                <textarea
                  id="address"
                  rows={3}
                  className={`${input} resize-none leading-snug`}
                  autoComplete="street-address"
                  placeholder="House no., street, barangay, city, province"
                  value={details.address || ''}
                  onChange={set('address')}
                />
              </Row>
              <Row id="age" label="Patient's age" error={errors.age}>
                <input
                  id="age"
                  className={input}
                  inputMode="numeric"
                  placeholder="e.g. 54"
                  value={details.age || ''}
                  onChange={(e) => {
                    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3);
                    set('age')(e);
                  }}
                />
              </Row>
            </Card>
            <Card title="Contact person" note="Someone we can reach if the patient can't answer.">
              <Row id="contactName" label="Name" optional>
                <input id="contactName" className={input} placeholder="Maria Dela Cruz" value={details.contactName || ''} onChange={set('contactName')} />
              </Row>
              <Row id="contactRelationship" label="Relationship to the patient" optional>
                <input id="contactRelationship" className={input} placeholder="e.g. Daughter" value={details.contactRelationship || ''} onChange={set('contactRelationship')} />
              </Row>
            </Card>
          </>
        )}

        {/* Doctors, pharmacies, hospitals: the columns their team's sheet has */}
        {audience && audience.kind !== 'patient' && audience.fields.length > 0 && (
          <Card title="Work details" note="Helps the right team prepare your quote.">
            {audience.fields.map((f) => (
              <Row key={f.key} id={f.key} label={f.label} optional={!f.required} error={errors[f.key]}>
                <input id={f.key} className={input} value={(details[f.key] as string) || ''} onChange={set(f.key)} />
              </Row>
            ))}
          </Card>
        )}

        <p className="flex gap-2 px-1 text-[11.5px] leading-relaxed text-gray-500">
          <i className="fa-solid fa-lock mt-[3px] text-[10px] text-gray-400" />
          Saved only on this phone. Getmeds sees these details only when you send a request.
        </p>
      </div>

      {/* Save bar */}
      <div
        className="border-t border-[#E7ECF2] bg-white px-4 pt-3"
        style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          type="button"
          disabled={busy || saved}
          onClick={save}
          className="w-full rounded-full py-3.5 text-[14px] font-semibold text-white disabled:opacity-70"
          style={{ background: saved ? '#61A644' : GRADIENT }}
        >
          {saved ? '✓ Saved' : busy ? 'Saving…' : consented === false ? 'Allow and save on this phone' : 'Save details'}
        </button>
      </div>
    </div>
  );
}
