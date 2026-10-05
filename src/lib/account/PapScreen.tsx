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
import { useLang } from '../i18n';

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

const STATUS: Record<PapApplication['status'], { label: string; labelTl: string; cls: string }> = {
  submitted: { label: 'Submitted', labelTl: 'Naipadala', cls: 'bg-[#F1F8FE] text-[#1D9FDA]' },
  reviewing: { label: 'Being reviewed', labelTl: 'Sinusuri', cls: 'bg-amber-50 text-amber-700' },
  needs_info: { label: 'Needs more info', labelTl: 'Kailangan ng dagdag na info', cls: 'bg-orange-50 text-orange-700' },
  approved: { label: 'Approved', labelTl: 'Aprubado', cls: 'bg-[#ECFAF0] text-[#357A3F]' },
  declined: { label: 'Not approved', labelTl: 'Hindi naaprubahan', cls: 'bg-gray-100 text-gray-500' },
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

function validate(d: Draft, tr: (en: string, tl: string) => string): Errors {
  const e: Errors = {};
  if (!d.patientName.trim()) e.patientName = tr("Enter the patient's full name.", 'Ilagay ang buong pangalan ng pasyente.');
  if (d.patientAge && !/^\d{1,3}$/.test(d.patientAge)) e.patientAge = tr('Age in years, numbers only.', 'Edad sa taon, numero lang.');
  if (!d.diagnosis.trim())
    e.diagnosis = tr("Enter the diagnosis, as written by the patient's doctor.", 'Ilagay ang diagnosis, ayon sa isinulat ng doktor ng pasyente.');
  const phone = d.contactPhone.replace(/[\s\-()]/g, '');
  if (!phone) e.contactPhone = tr('Enter a mobile number so our team can reach you.', 'Maglagay ng mobile number para makontak ka ng aming team.');
  else if (!PH_MOBILE.test(phone))
    e.contactPhone = tr('Use a Philippine mobile number, like 0917 123 4567.', 'Gumamit ng Philippine mobile number, tulad ng 0917 123 4567.');
  return e;
}

export default function PapScreen({ onClose }: { onClose: () => void }) {
  const { tr } = useLang();
  const { data, error: loadError, reload } = useAccountData();
  const [applying, setApplying] = useState(false);
  const [toast, showToast] = useToast();

  const apps = data?.pap ?? [];
  const full = apps.filter(isOpen).length >= MAX_OPEN;

  return (
    <Screen
      title={tr('Patient Assistance', 'Patient Assistance')}
      subtitle={tr('Help with cancer medicines', 'Tulong para sa gamot sa cancer')}
      onClose={onClose}
      headerAction={
        data && apps.length > 0 && !full ? (
          <SmallButton onClick={() => setApplying(true)}>
            <i className="fa-solid fa-plus mr-1 text-[10px]" />
            {tr('Apply', 'Mag-apply')}
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
            <p className="text-[14px] font-semibold text-gray-900">{tr('Chemotherapy and cancer medicines', 'Chemotherapy at mga gamot sa cancer')}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-gray-600">
              {tr(
                'Getmeds works with government agencies to help patients fighting cancer get medical assistance for their medicines.',
                'Nakikipagtulungan ang Getmeds sa mga ahensya ng gobyerno para matulungan ang mga pasyenteng may cancer na makakuha ng medical assistance para sa kanilang gamot.'
              )}
            </p>
          </div>
        </div>
        <ul className="mt-3 space-y-2 border-t border-[#EEF1F5] pt-3 text-[12.5px] leading-snug text-gray-600">
          <li className="flex gap-2.5">
            <i className="fa-solid fa-building-columns mt-0.5 text-[11px]" style={{ color: BRAND }} />
            <span>
              {tr(
                'Partner agencies: DSWD (AICS) and PCSO (Medical Assistance Program).',
                'Mga partner na ahensya: DSWD (AICS) at PCSO (Medical Assistance Program).'
              )}
            </span>
          </li>
          <li className="flex gap-2.5">
            <i className="fa-solid fa-file-invoice mt-0.5 text-[11px]" style={{ color: BRAND }} />
            <span>
              {tr(
                'Our Patient Assistance Officer checks your requirements and gives you the official price quotation for your medicine.',
                'Susuriin ng aming Patient Assistance Officer ang iyong requirements at bibigyan ka ng opisyal na price quotation para sa gamot mo.'
              )}
            </span>
          </li>
          <li className="flex gap-2.5">
            <i className="fa-solid fa-envelope-open-text mt-0.5 text-[11px]" style={{ color: BRAND }} />
            <span>
              {tr(
                'Once the agency approves, bring its Guarantee Letter to the supplier named in it to get the medicine.',
                'Kapag inaprubahan ng ahensya, dalhin ang Guarantee Letter nito sa supplier na nakapangalan dito para makuha ang gamot.'
              )}
            </span>
          </li>
        </ul>
        <a
          href="/patient-assistance-program"
          className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold"
          style={{ color: BRAND }}
        >
          {tr('See the full steps and requirements', 'Tingnan ang buong hakbang at requirements')}
          <i className="fa-solid fa-arrow-right text-[10px]" />
        </a>
      </div>

      {/* Applications */}
      {!data ? (
        loadError ? (
          <div className="space-y-3">
            <ErrorNote text={tr(`${loadError} Check your connection and try again.`, `${loadError} Tingnan ang iyong connection at subukan ulit.`)} />
            <SmallButton onClick={() => reload()}>{tr('Try again', 'Subukan ulit')}</SmallButton>
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
          title={tr('No applications yet', 'Wala pang application')}
          text={tr(
            'Apply here and our Patient Assistance Officer will contact you about the requirements.',
            'Mag-apply dito at kokontakin ka ng aming Patient Assistance Officer tungkol sa requirements.'
          )}
          action={
            <div className="mx-auto max-w-[240px]">
              <PrimaryButton onClick={() => setApplying(true)}>{tr('Apply', 'Mag-apply')}</PrimaryButton>
            </div>
          }
        />
      ) : (
        <>
          <Card
            title={tr('Your applications', 'Mga application mo')}
            note={tr('Our team updates these as your application moves along.', 'Ina-update ito ng aming team habang umuusad ang application mo.')}
          >
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
                      <p className="mt-0.5 text-[11px] text-gray-400">{tr(`Sent ${shortDate(a.createdAt)}`, `Ipinadala ${shortDate(a.createdAt)}`)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.cls}`}>{tr(s.label, s.labelTl)}</span>
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
              {tr(
                `You have ${MAX_OPEN} applications in progress, the most we take at once. You can apply again once one is approved or closed.`,
                `May ${MAX_OPEN} application kang kasalukuyang pinoproseso, ang pinakamarami na puwede nang sabay. Puwede kang mag-apply ulit kapag may naaprubahan o naisara na.`
              )}
            </p>
          )}
        </>
      )}

      <p className="flex gap-2 px-1 text-[11.5px] leading-relaxed text-gray-500">
        <i className="fa-solid fa-lock mt-[3px] text-[10px] text-gray-400" />
        {tr(
          'Only our Patient Assistance team sees your application. It is kept with your Getmeds account.',
          'Ang aming Patient Assistance team lang ang makakakita ng application mo. Nakatabi ito sa iyong Getmeds account.'
        )}
      </p>

      {applying && (
        <ApplySheet
          phone={data?.profile.phone || ''}
          onClose={() => setApplying(false)}
          onSent={() => {
            setApplying(false);
            showToast(tr('Application sent', 'Naipadala ang application'));
          }}
        />
      )}
      <Toast text={toast} />
    </Screen>
  );
}

function ApplySheet({ phone, onClose, onSent }: { phone: string; onClose: () => void; onSent: () => void }) {
  const { tr } = useLang();
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
    const found = validate(draft, tr);
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
      setFailure(
        (e as Error)?.message ||
          tr(
            'Could not send your application. Check your connection and try again.',
            'Hindi maipadala ang application mo. Tingnan ang iyong connection at subukan ulit.'
          )
      );
      setBusy(false);
    }
  };

  return (
    <Sheet title={tr('Apply for assistance', 'Mag-apply para sa tulong')} onClose={busy ? () => undefined : onClose}>
      <Card title={tr('Patient', 'Pasyente')}>
        <Field id="pap-patientName" label={tr("Patient's full name", 'Buong pangalan ng pasyente')} error={errors.patientName}>
          <input id="pap-patientName" className={inputClass} autoComplete="off" placeholder="Maria Dela Cruz" value={draft.patientName} onChange={set('patientName')} />
        </Field>
        <Field id="pap-patientAge" label={tr('Age', 'Edad')} optional error={errors.patientAge}>
          <input
            id="pap-patientAge"
            className={inputClass}
            inputMode="numeric"
            placeholder={tr('e.g. 58', 'hal. 58')}
            value={draft.patientAge}
            onChange={(e) => {
              e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3);
              set('patientAge')(e);
            }}
          />
        </Field>
        <Field id="pap-diagnosis" label={tr('Diagnosis', 'Diagnosis')} error={errors.diagnosis}>
          <input id="pap-diagnosis" className={inputClass} placeholder={tr('e.g. Breast cancer, stage 2', 'hal. Breast cancer, stage 2')} value={draft.diagnosis} onChange={set('diagnosis')} />
        </Field>
        <Field id="pap-medicine" label={tr('Medicine needed', 'Kailangang gamot')} optional>
          <input id="pap-medicine" className={inputClass} placeholder={tr('e.g. Trastuzumab 440 mg', 'hal. Trastuzumab 440 mg')} value={draft.medicine} onChange={set('medicine')} />
        </Field>
      </Card>

      <Card
        title={tr('Care team', 'Mga nag-aalaga')}
        note={tr('Helps us prepare the quotation the agency asks for.', 'Makakatulong ito sa paghahanda namin ng quotation na hinihingi ng ahensya.')}
      >
        <Field id="pap-hospital" label={tr('Hospital', 'Ospital')} optional>
          <input id="pap-hospital" className={inputClass} placeholder={tr('e.g. Philippine General Hospital', 'hal. Philippine General Hospital')} value={draft.hospital} onChange={set('hospital')} />
        </Field>
        <Field id="pap-doctor" label={tr('Attending doctor', 'Doktor na tumitingin')} optional>
          <input id="pap-doctor" className={inputClass} placeholder={tr('e.g. Dr. Jose Santos', 'hal. Dr. Jose Santos')} value={draft.doctor} onChange={set('doctor')} />
        </Field>
      </Card>

      <Card title={tr('How to reach you', 'Paano ka makokontak')}>
        <Field id="pap-contactPhone" label={tr('Mobile number', 'Mobile number')} error={errors.contactPhone}>
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
        <Field id="pap-notes" label={tr('Notes', 'Mga tala')} optional>
          <textarea
            id="pap-notes"
            rows={3}
            className={`${inputClass} resize-none leading-snug`}
            placeholder={tr(
              'Anything our team should know, e.g. which agency you are applying to',
              'Anumang dapat malaman ng aming team, hal. kung saang ahensya ka nag-a-apply'
            )}
            value={draft.notes}
            onChange={set('notes')}
          />
        </Field>
      </Card>

      <ErrorNote text={failure} />
      <PrimaryButton onClick={submit} disabled={busy}>
        {busy ? tr('Sending…', 'Ipinapadala…') : tr('Send application', 'Ipadala ang application')}
      </PrimaryButton>
    </Sheet>
  );
}
