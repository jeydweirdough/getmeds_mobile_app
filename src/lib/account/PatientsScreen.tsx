'use client';

import React, { useEffect, useState } from 'react';
import {
  Card,
  Empty,
  ErrorNote,
  Field,
  ListRow,
  PrimaryButton,
  Screen,
  Sheet,
  SmallButton,
  Toast,
  inputClass,
  useToast,
} from '../ui/Screen';
import { newKey, saveList, useAccountData, type Patient } from '../accountApi';
import { useLang } from '../i18n';

/**
 * PatientsScreen.tsx
 * ─────────────────────────────────────────────
 * The people a signed-in customer requests medicines for. Most of the app's
 * patients are really caregivers: a daughter ordering for her mother, a
 * husband for his wife. Keeping each person here once means the request list
 * can fill in the patient's name and age with a single tap.
 *
 * The list is saved whole (saveList replaces it on the server), so every edit
 * builds the complete next list and hands it over. On failure the sheet stays
 * open with what was typed, and saveList has already rolled the list back.
 */

/** The server keeps at most this many. */
const MAX_PATIENTS = 10;

type Draft = Omit<Patient, '_key'> & { _key?: string };
type Errors = Partial<Record<'name' | 'age', string>>;

const BLANK: Draft = { name: '', age: '', relationship: '', notes: '' };

/** Quick picks for the relationship field. Anything else can be typed. */
const RELATIONSHIPS = [
  { en: 'Mother', tl: 'Nanay' },
  { en: 'Father', tl: 'Tatay' },
  { en: 'Spouse', tl: 'Asawa' },
  { en: 'Child', tl: 'Anak' },
  { en: 'Sibling', tl: 'Kapatid' },
  { en: 'Grandparent', tl: 'Lolo/Lola' },
];

function validate(d: Draft, tr: (en: string, tl: string) => string): Errors {
  const e: Errors = {};
  if (!d.name.trim()) e.name = tr("Enter the patient's full name.", 'Ilagay ang buong pangalan ng pasyente.');
  if (d.age && !/^\d{1,3}$/.test(d.age)) e.age = tr('Age in years, numbers only.', 'Edad sa taon, numero lang.');
  return e;
}

/** "54 · Mother", or whatever part of it is known. */
const describe = (p: Patient, tr: (en: string, tl: string) => string) =>
  [p.age ? tr(`${p.age} yrs`, `${p.age} taon`) : '', p.relationship || ''].filter(Boolean).join(' · ') ||
  tr('No details yet', 'Wala pang detalye');

export default function PatientsScreen({
  onClose,
  startAdding = false,
  level,
}: {
  onClose: () => void;
  /** Opens straight into the add form, e.g. from "+ Add patient" on the request list. */
  startAdding?: boolean;
  level?: number;
}) {
  const { tr } = useLang();
  const { data, error: loadError, reload } = useAccountData();
  const patients = data?.patients ?? [];
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toast, showToast] = useToast();

  // Wait for the list before opening the add form, so the limit check sees it.
  const [autoOpened, setAutoOpened] = useState(false);
  useEffect(() => {
    if (!startAdding || autoOpened || !data) return;
    setAutoOpened(true);
    if (data.patients.length < MAX_PATIENTS) setDraft({ ...BLANK });
  }, [startAdding, autoOpened, data]);

  const full = patients.length >= MAX_PATIENTS;
  const add = () => setDraft({ ...BLANK });

  return (
    <Screen
      title={tr('Patients', 'Mga pasyente')}
      subtitle={tr('People you request medicines for', 'Mga taong pinag-re-request mo ng gamot')}
      onClose={onClose}
      level={level}
      headerAction={
        data && patients.length > 0 && !full ? (
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
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[62px] animate-pulse rounded-[20px] bg-white" />
            ))}
          </div>
        )
      ) : patients.length === 0 ? (
        <Empty
          icon="fa-user-group"
          title={tr('No patients yet', 'Wala pang pasyente')}
          text={tr(
            'Caring for family? Add them here once, and your requests fill in their name and age for you.',
            'May inaalagaang kapamilya? Idagdag sila rito nang isang beses, at kusang mapupunan ang pangalan at edad nila sa iyong mga request.'
          )}
          action={
            <div className="mx-auto max-w-[240px]">
              <PrimaryButton onClick={add}>{tr('Add a patient', 'Magdagdag ng pasyente')}</PrimaryButton>
            </div>
          }
        />
      ) : (
        <>
          <Card
            title={tr('Saved patients', 'Mga naka-save na pasyente')}
            note={tr('Tap a patient to change their details.', 'I-tap ang pasyente para baguhin ang detalye niya.')}
          >
            {patients.map((p) => (
              <ListRow key={p._key} icon="fa-user" title={p.name} detail={describe(p, tr)} onClick={() => setDraft({ ...p })} />
            ))}
          </Card>
          {full && (
            <p className="px-1 text-[11.5px] leading-relaxed text-gray-500">
              {tr(
                `You can keep up to ${MAX_PATIENTS} patients. Remove one to add another.`,
                `Hanggang ${MAX_PATIENTS} pasyente lang ang puwedeng i-save. Mag-alis ng isa para makapagdagdag.`
              )}
            </p>
          )}
        </>
      )}

      <p className="flex gap-2 px-1 text-[11.5px] leading-relaxed text-gray-500">
        <i className="fa-solid fa-lock mt-[3px] text-[10px] text-gray-400" />
        {tr(
          'Kept with your Getmeds account. Our team sees a patient only when you send a request for them.',
          'Nakatabi sa iyong Getmeds account. Makikita lang ng aming team ang pasyente kapag nagpadala ka ng request para sa kanya.'
        )}
      </p>

      {draft && (
        <PatientSheet
          draft={draft}
          patients={patients}
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

/** Add or edit one patient, with delete behind an in-sheet confirm. */
function PatientSheet({
  draft: initial,
  patients,
  onClose,
  onSaved,
}: {
  draft: Draft;
  patients: Patient[];
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
    const clean: Patient = {
      _key: draft._key || newKey(),
      name: draft.name.trim(),
      age: (draft.age || '').trim(),
      relationship: (draft.relationship || '').trim(),
      notes: (draft.notes || '').trim(),
    };
    const next = editing ? patients.map((p) => (p._key === clean._key ? clean : p)) : [...patients, clean];
    try {
      await saveList('patients', next);
      onSaved(editing ? tr('Patient updated', 'Na-update ang pasyente') : tr('Patient added', 'Naidagdag ang pasyente'));
    } catch (e) {
      // The sheet stays open with everything typed, so trying again is one tap.
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
      await saveList('patients', patients.filter((p) => p._key !== initial._key));
      onSaved(tr('Patient removed', 'Inalis ang pasyente'));
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

  return (
    <Sheet
      title={editing ? tr('Edit patient', 'I-edit ang pasyente') : tr('Add a patient', 'Magdagdag ng pasyente')}
      onClose={busy ? () => undefined : onClose}
    >
      <Card>
        <Field id="patient-name" label={tr('Full name', 'Buong pangalan')} error={errors.name}>
          <input
            id="patient-name"
            className={inputClass}
            autoComplete="off"
            placeholder="Maria Dela Cruz"
            value={draft.name}
            onChange={set('name')}
          />
        </Field>
        <Field id="patient-age" label={tr('Age', 'Edad')} optional error={errors.age}>
          <input
            id="patient-age"
            className={inputClass}
            inputMode="numeric"
            placeholder={tr('e.g. 72', 'hal. 72')}
            value={draft.age || ''}
            onChange={(e) => {
              e.target.value = e.target.value.replace(/\D/g, '').slice(0, 3);
              set('age')(e);
            }}
          />
        </Field>
        <Field id="patient-relationship" label={tr('Relationship to you', 'Kaano-ano mo')} optional>
          <input
            id="patient-relationship"
            className={inputClass}
            placeholder={tr('e.g. Mother', 'hal. Nanay')}
            value={draft.relationship || ''}
            onChange={set('relationship')}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {RELATIONSHIPS.map((rel) => {
              const r = tr(rel.en, rel.tl);
              const current = (draft.relationship || '').toLowerCase();
              const on = current === rel.en.toLowerCase() || current === rel.tl.toLowerCase();
              return (
                <button
                  key={rel.en}
                  id={`patient-relationship-${rel.en.toLowerCase()}`}
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, relationship: r }))}
                  className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium ${on ? 'bg-[#1D9FDA] text-white' : 'bg-[#F1F5F9] text-gray-600'}`}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </Field>
        <Field id="patient-notes" label={tr('Notes', 'Mga tala')} optional>
          <textarea
            id="patient-notes"
            rows={2}
            className={`${inputClass} resize-none leading-snug`}
            placeholder={tr('e.g. Allergic to penicillin', 'hal. Allergic sa penicillin')}
            value={draft.notes || ''}
            onChange={set('notes')}
          />
        </Field>
      </Card>

      <ErrorNote text={failure} />

      {confirming ? (
        <div className="space-y-3 rounded-[20px] border border-red-100 bg-white p-4">
          <p className="text-[13px] leading-snug text-gray-700">
            {tr('Remove ', 'Alisin si ')}
            <span className="font-semibold">{initial.name}</span>
            {tr('? Past requests keep their details.', '? Mananatili ang detalye sa mga dating request.')}
          </p>
          <div className="flex gap-2">
            <button
              id="patient-delete-cancel"
              type="button"
              disabled={busy === 'delete'}
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-full bg-[#F1F5F9] py-3 text-[13.5px] font-semibold text-gray-600 disabled:opacity-50"
            >
              {tr('Keep', 'Huwag alisin')}
            </button>
            <button
              id="patient-delete-confirm"
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
                : tr('Add patient', 'Idagdag ang pasyente')}
          </PrimaryButton>
          {editing && (
            <button
              id="patient-delete"
              type="button"
              disabled={busy !== null}
              onClick={() => setConfirming(true)}
              className="w-full py-2 text-[13px] font-semibold text-red-500 disabled:opacity-50"
            >
              {tr('Remove patient', 'Alisin ang pasyente')}
            </button>
          )}
        </>
      )}
    </Sheet>
  );
}
