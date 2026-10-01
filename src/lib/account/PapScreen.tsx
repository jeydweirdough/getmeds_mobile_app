'use client';

import React, { useState } from 'react';
import {
  BRAND,
  Card,
  Empty,
  ErrorNote,
  Field,
  PrimaryButton,
  Screen,
  Sheet,
  SmallButton,
  Toast,
  inputClass,
  useToast,
} from '../ui/Screen';
import { applyPap, shortDate, useAccountData, type PapApplication } from '../accountApi';

/**
 * PapScreen.tsx
 * ─────────────────────────────────────────────
 * Patient Assistance in the app. Getmeds helps cancer patients get
 * government medical assistance (DSWD AICS and PCSO MAP) for chemotherapy
 * and cancer medicines: our Patient Assistance Officer checks the
 * requirements and issues the official price quotation the agencies ask for.
 * The full steps, in Filipino, are on /patient-assistance-program; this
 * screen only explains it briefly, takes an application and shows where each
 * one stands.
 *
 * Nothing here promises free medicine. Approval is the agency's, and the
 * wording stays with what the programme page says.
 */

/** The server accepts at most this many open applications at once. */
const MAX_OPEN = 3;

const STATUS: Record<PapApplication['status'], { label: string; cls: string }> = {
  submitted: { label: 'Submitted', cls: 'bg-[#F1F8FE] text-[#1D9FDA]' },
  reviewing: { label: 'Being reviewed', cls: 'bg-amber-50 text-amber-700' },
  needs_info: { label: 'Needs more info', cls: 'bg-orange-50 text-orange-700' },
  approved: { label: 'Approved', cls: 'bg-[#ECFAF0] text-[#357A3F]' },
  declined: { label: 'Not approved', cls: 'bg-gray-100 text-gray-500' },
};

const isOpen = (a: PapApplication) => a.status === 'submitted' || a.status === 'reviewing' || a.status === 'needs_info';

interface Draft {
  patientName: string;
  patientAge: string;
  diagnosis: string;
  medicine: string;
  hospital: string;
  doctor: string;
  contactPhone: string;
  notes: string;
}
type Errors = Partial<Record<keyof Draft, string>>;

const PH_MOBILE = /^(\+?63|0)?9\d{9}$/;

function validate(d: Draft): Errors {
  const e: Errors = {};
  if (!d.patientName.trim()) e.patientName = "Enter the patient's full name.";
  if (d.patientAge && !/^\d{1,3}$/.test(d.patientAge)) e.patientAge = 'Age in years, numbers only.';
  if (!d.diagnosis.trim()) e.diagnosis = "Enter the diagnosis, as written by the patient's doctor.";
  const phone = d.contactPhone.replace(/[\s\-()]/g, '');
  if (!phone) e.contactPhone = 'Enter a mobile number so our team can reach you.';
  else if (!PH_MOBILE.test(phone)) e.contactPhone = 'Use a Philippine mobile number, like 0917 123 4567.';
  return e;
}

export default function PapScreen({ onClose }: { onClose: () => void }) {
  const { data, error: loadError, reload } = useAccountData();
  const [applying, setApplying] = useState(false);
  const [toast, showToast] = useToast();

  const apps = data?.pap ?? [];
  const full = apps.filter(isOpen).length >= MAX_OPEN;

  return (
    <Screen
      title="Patient Assistance"
      subtitle="Help with cancer medicines"
      onClose={onClose}
      headerAction={
        data && apps.length > 0 && !full ? (
          <SmallButton onClick={() => setApplying(true)}>
            <i className="fa-solid fa-plus mr-1 text-[10px]" />
            Apply
          </SmallButton>
        ) : undefined
      }
    >
      {/* What it is */}
      <div className="rounded-[20px] border border-[#EEF1F5] bg-white p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F8FE]">
            <i className="fa-solid fa-hand-holding-medical text-[14px]" style={{ color: BRAND }} />
          </span>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-gray-900">Chemotherapy and cancer medicines</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-gray-600">
              Getmeds works with government agencies to help patients fighting cancer get medical assistance for their
              medicines.
            </p>
          </div>
        </div>
        <ul className="mt-3 space-y-2 border-t border-[#EEF1F5] pt-3 text-[12.5px] leading-snug text-gray-600">
          <li className="flex gap-2.5">
            <i className="fa-solid fa-building-columns mt-0.5 text-[11px]" style={{ color: BRAND }} />
            <span>Partner agencies: DSWD (AICS) and PCSO (Medical Assistance Program).</span>
          </li>
          <li className="flex gap-2.5">
            <i className="fa-solid fa-file-invoice mt-0.5 text-[11px]" style={{ color: BRAND }} />
            <span>Our Patient Assistance Officer checks your requirements and gives you the official price quotation for your medicine.</span>
          </li>
          <li className="flex gap-2.5">
            <i className="fa-solid fa-envelope-open-text mt-0.5 text-[11px]" style={{ color: BRAND }} />
            <span>Once the agency approves, bring its Guarantee Letter to the supplier named in it to get the medicine.</span>
          </li>
        </ul>
        <a
          href="/patient-assistance-program"
          className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold"
          style={{ color: BRAND }}
        >
          See the full steps and requirements
          <i className="fa-solid fa-arrow-right text-[10px]" />
        </a>
      </div>

      {/* Applications */}
      {!data ? (
        loadError ? (
          <div className="space-y-3">
            <ErrorNote text={`${loadError} Check your connection and try again.`} />
            <SmallButton onClick={() => reload()}>Try again</SmallButton>
          </div>
        ) : (
          <div className="space-y-2.5" aria-busy="true">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-[76px] animate-pulse rounded-[20px] bg-white" />
            ))}
          </div>
        )
      ) : apps.length === 0 ? (
        <Empty
          icon="fa-file-medical"
          title="No applications yet"
          text="Apply here and our Patient Assistance Officer will contact you about the requirements."
          action={
            <div className="mx-auto max-w-[240px]">
              <PrimaryButton onClick={() => setApplying(true)}>Apply</PrimaryButton>
            </div>
          }
        />
      ) : (
        <>
          <Card title="Your applications" note="Our team updates these as your application moves along.">
            {apps.map((a) => {
              const s = STATUS[a.status] ?? STATUS.submitted;
              return (
                <div key={a._id} className="border-t border-[#EEF1F5] px-4 py-3.5 first:border-t-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-gray-900">{a.patientName}</p>
                      <p className="mt-0.5 text-[12px] leading-snug text-gray-500">
                        {[a.diagnosis, a.medicine].filter(Boolean).join(' · ')}
                      </p>
                      <p className="mt-0.5 text-[11px] text-gray-400">Sent {shortDate(a.createdAt)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>
                  </div>
                  {a.statusNote && (
                    <p className="mt-2 flex gap-2 rounded-xl bg-[#F6F8FC] px-3 py-2.5 text-[12px] leading-snug text-gray-600">
                      <i className="fa-solid fa-comment-medical mt-[2px] text-[11px]" style={{ color: BRAND }} />
                      {a.statusNote}
                    </p>
                  )}
                </div>
              );
            })}
          </Card>
          {full && (
            <p className="px-1 text-[11.5px] leading-relaxed text-gray-500">
              You have {MAX_OPEN} applications in progress, the most we take at once. You can apply again once one is
              approved or closed.
            </p>
          )}
        </>
      )}

      <p className="flex gap-2 px-1 text-[11.5px] leading-relaxed text-gray-500">
        <i className="fa-solid fa-lock mt-[3px] text-[10px] text-gray-400" />
        Only our Patient Assistance team sees your application. It is kept with your Getmeds account.
      </p>

      {applying && (
        <ApplySheet
          phone={data?.profile.phone || ''}
          onClose={() => setApplying(false)}
          onSent={() => {
            setApplying(false);
            showToast('Application sent');
          }}
        />
      )}
      <Toast text={toast} />
    </Screen>
  );
}

function ApplySheet({ phone, onClose, onSent }: { phone: string; onClose: () => void; onSent: () => void }) {
  const [draft, setDraft] = useState<Draft>({
    patientName: '',
    patientAge: '',
    diagnosis: '',
    medicine: '',
    hospital: '',
    doctor: '',
    contactPhone: phone,
    notes: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((x) => ({ ...x, [key]: undefined }));
  };

  const submit = async () => {
    const found = validate(draft);
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.querySelector(`[data-field="pap-${first}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setBusy(true);
    setFailure('');
    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries(draft)) body[k] = v.trim();
    try {
      await applyPap(body);
      onSent();
    } catch (e) {
      // The sheet stays open with everything typed, so sending again is one tap.
      setFailure((e as Error)?.message || 'Could not send your application. Check your connection and try again.');
      setBusy(false);
    }
  };

  return (
    <Sheet title="Apply for assistance" onClose={busy ? () => undefined : onClose}>
      <Card title="Patient">
        <Field id="pap-patientName" label="Patient's full name" error={errors.patientName}>
          <input id="pap-patientName" className={inputClass} autoComplete="off" placeholder="Maria Dela Cruz" value={draft.patientName} onChange={set('patientName')} />
        </Field>
        <Field id="pap-patientAge" label="Age" optional error={errors.patientAge}>
          <input
            id="pap-patientAge"
            className={inputClass}
            inputMode="numeric"
            placeholder="e.g. 58"
            value={draft.patientAge}
            onChange={(e) => {
              e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3);
              set('patientAge')(e);
            }}
          />
        </Field>
        <Field id="pap-diagnosis" label="Diagnosis" error={errors.diagnosis}>
          <input id="pap-diagnosis" className={inputClass} placeholder="e.g. Breast cancer, stage 2" value={draft.diagnosis} onChange={set('diagnosis')} />
        </Field>
        <Field id="pap-medicine" label="Medicine needed" optional>
          <input id="pap-medicine" className={inputClass} placeholder="e.g. Trastuzumab 440 mg" value={draft.medicine} onChange={set('medicine')} />
        </Field>
      </Card>

      <Card title="Care team" note="Helps us prepare the quotation the agency asks for.">
        <Field id="pap-hospital" label="Hospital" optional>
          <input id="pap-hospital" className={inputClass} placeholder="e.g. Philippine General Hospital" value={draft.hospital} onChange={set('hospital')} />
        </Field>
        <Field id="pap-doctor" label="Attending doctor" optional>
          <input id="pap-doctor" className={inputClass} placeholder="e.g. Dr. Jose Santos" value={draft.doctor} onChange={set('doctor')} />
        </Field>
      </Card>

      <Card title="How to reach you">
        <Field id="pap-contactPhone" label="Mobile number" error={errors.contactPhone}>
          <input
            id="pap-contactPhone"
            className={inputClass}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0917 123 4567"
            value={draft.contactPhone}
            onChange={(e) => {
              e.target.value = e.target.value.replace(/[^\d+\s\-()]/g, '');
              set('contactPhone')(e);
            }}
          />
        </Field>
        <Field id="pap-notes" label="Notes" optional>
          <textarea
            id="pap-notes"
            rows={3}
            className={`${inputClass} resize-none leading-snug`}
            placeholder="Anything our team should know, e.g. which agency you are applying to"
            value={draft.notes}
            onChange={set('notes')}
          />
        </Field>
      </Card>

      <ErrorNote text={failure} />
      <PrimaryButton onClick={submit} disabled={busy}>
        {busy ? 'Sending…' : 'Send application'}
      </PrimaryButton>
    </Sheet>
  );
}
