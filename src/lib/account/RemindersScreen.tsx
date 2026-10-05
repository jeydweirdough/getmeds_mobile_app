'use client';

import React, { useMemo, useState } from 'react';
import {
  addDays,
  manilaToday,
  newKey,
  saveList,
  shortDate,
  slugOf,
  useAccountData,
  type RefillReminder,
} from '../accountApi';
import {
  Card,
  Empty,
  ErrorNote,
  Field,
  PrimaryButton,
  Screen,
  Sheet,
  SmallButton,
  Toast,
  useToast,
  inputClass,
  BRAND,
} from '../ui/Screen';
import { addResultMessage, cartItemFor, errorText, Switch, type ProductRef, useAddToList } from './listActions';
import { goTo } from '@/platform/navigation';
import { useLang } from '../i18n';

/**
 * RemindersScreen.tsx
 * ─────────────────────────────────────────────
 * "Refill reminders" in the app. A reminder is a medicine, how often it runs
 * out and the next date it does; the backend texts the customer the day
 * before. "Request now" puts the medicine on the request list and leaves a
 * note in sessionStorage (getmeds_refill_key) so the cart can send it as a
 * refill: a request sent within 3 days of the date earns bonus points, and
 * the backend moves the date on by itself.
 *
 * AddReminderSheet is exported so Your requests and the product page can open
 * the same form, prefilled.
 */

const PRESETS = [7, 14, 21, 28, 30];
const MIN_DAYS = 7;
const MAX_DAYS = 180;
const MAX_REMINDERS = 30;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Saved medicines first, then anything asked for before, one row per medicine. */
function useChoices(initial?: ProductRef): ProductRef[] {
  const { data } = useAccountData();
  return useMemo(() => {
    const seen = new Set<string>();
    const out: ProductRef[] = [];
    const push = (p: ProductRef) => {
      const id = slugOf(p.url) || p.name.trim().toLowerCase();
      if (!p.name?.trim() || seen.has(id)) return;
      seen.add(id);
      out.push(p);
    };
    if (initial) push(initial);
    for (const s of data?.savedProducts ?? []) push(s);
    for (const r of data?.requests ?? []) for (const i of r.items) push(i);
    return out.slice(0, 12);
  }, [data, initial]);
}

type Errors = { name?: string; everyDays?: string; nextDue?: string };

export function AddReminderSheet({
  reminder,
  initial,
  onClose,
  onSaved,
}: {
  /** Set to edit an existing reminder. */
  reminder?: RefillReminder;
  /** A medicine to start with, e.g. from a product page or an old request. */
  initial?: ProductRef;
  onClose: () => void;
  /** Called with a short confirmation once saved or deleted. */
  onSaved?: (message: string) => void;
}) {
  const { tr } = useLang();
  const { data } = useAccountData();
  const today = manilaToday();
  const start = reminder ?? initial;
  const choices = useChoices(reminder ? undefined : initial);

  const [name, setName] = useState(start?.name ?? '');
  const [url, setUrl] = useState(start?.url ?? '');
  const [typed, setTyped] = useState(Boolean(reminder && !reminder.url));
  const [everyDays, setEveryDays] = useState(reminder?.everyDays ?? 30);
  const [custom, setCustom] = useState(Boolean(reminder && !PRESETS.includes(reminder.everyDays)));
  const [customText, setCustomText] = useState(reminder ? String(reminder.everyDays) : '');
  const [nextDue, setNextDue] = useState(reminder?.nextDue ?? addDays(today, 30));
  // Until the date is picked by hand it follows "every N days".
  const [dateTouched, setDateTouched] = useState(Boolean(reminder));
  const [patientName, setPatientName] = useState(reminder?.patientName ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const patients = data?.patients ?? [];
  const reminders = data?.refillReminders ?? [];

  const pickDays = (n: number) => {
    setEveryDays(n);
    if (!dateTouched) setNextDue(addDays(today, n));
    if (errors.everyDays) setErrors((x) => ({ ...x, everyDays: undefined }));
  };

  const pick = (p: ProductRef) => {
    setName(p.name);
    setUrl(p.url ?? '');
    setTyped(false);
    if (errors.name) setErrors((x) => ({ ...x, name: undefined }));
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (!name.trim()) e.name = tr('Choose a medicine or type its name.', 'Pumili ng gamot o i-type ang pangalan nito.');
    const days = custom ? Number(customText) : everyDays;
    if (!Number.isInteger(days) || days < MIN_DAYS || days > MAX_DAYS)
      e.everyDays = tr(
        `Enter a number of days from ${MIN_DAYS} to ${MAX_DAYS}.`,
        `Maglagay ng bilang ng araw mula ${MIN_DAYS} hanggang ${MAX_DAYS}.`
      );
    if (!ISO_DATE.test(nextDue)) e.nextDue = tr('Pick the date it next runs out.', 'Piliin ang petsa ng susunod na pagkaubos nito.');
    else if (nextDue < today) e.nextDue = tr('Pick today or a later date.', 'Piliin ang araw na ito o mas huling petsa.');
    return e;
  };

  const save = async () => {
    const found = validate();
    setErrors(found);
    setSaveError('');
    if (Object.keys(found).length) return;
    if (!data) {
      setSaveError(tr('Your account is still loading. Try again in a moment.', 'Naglo-load pa ang account mo. Subukan ulit maya-maya.'));
      return;
    }
    if (!reminder && reminders.length >= MAX_REMINDERS) {
      setSaveError(
        tr(
          `You have ${MAX_REMINDERS} reminders, the most we keep. Delete one to add another.`,
          `May ${MAX_REMINDERS} reminder ka na, ang pinakamarami na puwede. Magbura ng isa para makapagdagdag.`
        )
      );
      return;
    }
    const item: RefillReminder = {
      _key: reminder?._key ?? newKey(),
      name: name.trim(),
      url: url.startsWith('/') ? url : '',
      everyDays: custom ? Number(customText) : everyDays,
      nextDue,
      patientName: patientName.trim(),
      active: reminder?.active ?? true,
    };
    setBusy(true);
    try {
      await saveList(
        'refillReminders',
        reminder ? reminders.map((r) => (r._key === reminder._key ? item : r)) : [...reminders, item]
      );
      onSaved?.(
        reminder
          ? tr('Reminder updated.', 'Na-update ang reminder.')
          : tr(
              `We'll text you on ${shortDate(addDays(nextDue, -1))}.`,
              `Ite-text ka namin sa ${shortDate(addDays(nextDue, -1))}.`
            )
      );
      onClose();
    } catch (e) {
      setSaveError(
        errorText(
          e,
          tr(
            'Could not save the reminder. Check your connection and try again.',
            'Hindi ma-save ang reminder. Tingnan ang iyong connection at subukan ulit.'
          )
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!reminder) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    setSaveError('');
    try {
      await saveList('refillReminders', reminders.filter((r) => r._key !== reminder._key));
      onSaved?.(tr('Reminder deleted.', 'Nabura ang reminder.'));
      onClose();
    } catch (e) {
      setSaveError(
        errorText(
          e,
          tr(
            'Could not delete the reminder. Check your connection and try again.',
            'Hindi mabura ang reminder. Tingnan ang iyong connection at subukan ulit.'
          )
        )
      );
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  const chip = (on: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold ${on ? 'text-white' : 'bg-white text-gray-600'}`;
  const chipStyle = (on: boolean) => (on ? { background: BRAND, borderColor: BRAND } : { borderColor: '#E3E8EF' });

  return (
    <Sheet
      title={reminder ? tr('Edit reminder', 'I-edit ang reminder') : tr('Add a refill reminder', 'Magdagdag ng refill reminder')}
      onClose={onClose}
    >
      <Card title={tr('Medicine', 'Gamot')}>
        {choices.length > 0 && !reminder && (
          <div role="radiogroup" aria-label={tr('Medicine', 'Gamot')}>
            {choices.map((p) => {
              const on = !typed && name === p.name && (url || '') === (p.url || '');
              return (
                <button
                  key={`${p.url || ''}|${p.name}`}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pick(p)}
                  className="flex w-full items-center gap-3 border-t border-[#EEF1F5] px-4 py-3 text-left first:border-t-0"
                >
                  <span className="min-w-0 flex-1 truncate text-[14px] text-gray-900">{p.name}</span>
                  <i
                    className={`fa-${on ? 'solid' : 'regular'} fa-circle${on ? '-check' : ''} text-[16px]`}
                    style={{ color: on ? BRAND : '#CBD5E1' }}
                  />
                </button>
              );
            })}
          </div>
        )}
        <Field id="reminder-name" label={choices.length > 0 && !reminder ? tr('Or type a name', 'O i-type ang pangalan') : tr('Medicine name', 'Pangalan ng gamot')} error={errors.name}>
          <input
            id="reminder-name"
            className={inputClass}
            placeholder={tr('e.g. Metformin 500 mg', 'hal. Metformin 500 mg')}
            value={typed || reminder ? name : ''}
            onChange={(e) => {
              setName(e.target.value);
              setTyped(true);
              // A typed name no longer points at the page picked before.
              if (!reminder) setUrl('');
              if (errors.name) setErrors((x) => ({ ...x, name: undefined }));
            }}
          />
        </Field>
      </Card>

      <Card title={tr('How often it runs out', 'Gaano kadalas ito maubos')}>
        <div className="px-4 py-3">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={tr('Every how many days', 'Tuwing ilang araw')}>
            {PRESETS.map((n) => {
              const on = !custom && everyDays === n;
              return (
                <button
                  key={n}
                  id={`reminder-every-${n}`}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => { setCustom(false); pickDays(n); }}
                  className={chip(on)}
                  style={chipStyle(on)}
                >
                  {tr(`${n} days`, `${n} araw`)}
                </button>
              );
            })}
            <button
              id="reminder-every-custom"
              type="button"
              role="radio"
              aria-checked={custom}
              onClick={() => { setCustom(true); if (!customText) setCustomText(String(everyDays)); }}
              className={chip(custom)}
              style={chipStyle(custom)}
            >
              {tr('Other', 'Iba pa')}
            </button>
          </div>
        </div>
        {custom && (
          <Field id="reminder-days" label={tr(`Every how many days (${MIN_DAYS} to ${MAX_DAYS})`, `Tuwing ilang araw (${MIN_DAYS} hanggang ${MAX_DAYS})`)} error={errors.everyDays}>
            <input
              id="reminder-days"
              className={inputClass}
              inputMode="numeric"
              placeholder={tr('e.g. 45', 'hal. 45')}
              value={customText}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 3);
                setCustomText(v);
                const n = Number(v);
                if (n >= MIN_DAYS && n <= MAX_DAYS) pickDays(n);
                else if (errors.everyDays) setErrors((x) => ({ ...x, everyDays: undefined }));
              }}
            />
          </Field>
        )}
        {!custom && errors.everyDays && (
          <p className="px-4 pb-3 text-[11.5px] text-red-500">{errors.everyDays}</p>
        )}
      </Card>

      <Card>
        <Field id="reminder-date" label={reminder ? tr('Next date', 'Susunod na petsa') : tr('First date', 'Unang petsa')} error={errors.nextDue}>
          <input
            id="reminder-date"
            type="date"
            className={inputClass}
            min={today}
            value={nextDue}
            onChange={(e) => {
              setNextDue(e.target.value);
              setDateTouched(true);
              if (errors.nextDue) setErrors((x) => ({ ...x, nextDue: undefined }));
            }}
          />
        </Field>
        <Field id="reminder-patient" label={tr('For', 'Para kay')} optional>
          {patients.length > 0 ? (
            <select
              id="reminder-patient"
              className={`${inputClass} appearance-none`}
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
            >
              <option value="">{tr('Me', 'Ako')}</option>
              {patients.map((p) => (
                <option key={p._key} value={p.name}>{p.name}</option>
              ))}
              {/* Keeps a name that was since removed from Patients. */}
              {patientName && !patients.some((p) => p.name === patientName) && <option value={patientName}>{patientName}</option>}
            </select>
          ) : (
            <input
              id="reminder-patient"
              className={inputClass}
              placeholder={tr("Patient's name", 'Pangalan ng pasyente')}
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
            />
          )}
        </Field>
      </Card>

      <p className="px-1 text-[11.5px] leading-relaxed text-gray-500">
        {tr(
          'We text you the day before. Send the request within 3 days of the date to earn bonus points.',
          'Ite-text ka namin isang araw bago nito. Ipadala ang request sa loob ng 3 araw mula sa petsa para makakuha ng bonus points.'
        )}
      </p>

      <ErrorNote text={saveError} />
      <PrimaryButton onClick={save} disabled={busy}>
        {busy
          ? tr('Saving…', 'Sine-save…')
          : reminder
            ? tr('Save changes', 'I-save ang mga pagbabago')
            : tr('Add reminder', 'Idagdag ang reminder')}
      </PrimaryButton>
      {reminder && (
        <PrimaryButton onClick={remove} disabled={busy} tone={confirmDelete ? 'danger' : undefined}>
          {confirmDelete ? tr('Tap again to delete', 'I-tap ulit para burahin') : tr('Delete reminder', 'Burahin ang reminder')}
        </PrimaryButton>
      )}
    </Sheet>
  );
}

export default function RemindersScreen({ onClose }: { onClose: () => void }) {
  const { tr } = useLang();
  const { data, error: loadError, reload } = useAccountData();
  const [toast, showToast] = useToast();
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState<{ reminder?: RefillReminder } | null>(null);
  const { add, consentSheet } = useAddToList();
  const reminders = data?.refillReminders ?? [];
  const soon = addDays(manilaToday(), 1);

  // Soonest first, paused ones last.
  const sorted = [...reminders].sort(
    (a, b) => Number(a.active === false) - Number(b.active === false) || a.nextDue.localeCompare(b.nextDue)
  );

  const setActive = async (r: RefillReminder, active: boolean) => {
    setError('');
    try {
      await saveList('refillReminders', reminders.map((x) => (x._key === r._key ? { ...x, active } : x)));
      showToast(active ? tr('Reminder on.', 'Naka-on ang reminder.') : tr('Reminder paused.', 'Naka-pause ang reminder.'));
    } catch (e) {
      setError(
        errorText(
          e,
          tr(
            'Could not change the reminder. Check your connection and try again.',
            'Hindi mabago ang reminder. Tingnan ang iyong connection at subukan ulit.'
          )
        )
      );
    }
  };

  const requestNow = async (r: RefillReminder) => {
    setError('');
    // Fill in the picture and strength when the medicine is also saved.
    const match = data?.savedProducts.find((s) => r.url && slugOf(s.url) === slugOf(r.url));
    const result = await add([cartItemFor({ ...match, name: r.name, url: r.url }, 'refill')]);
    if (result !== 'added') {
      setError(addResultMessage(result));
      return;
    }
    try {
      sessionStorage.setItem('getmeds_refill_key', JSON.stringify({ key: r._key, name: r.name }));
    } catch {
      // Without it the request still goes out, just without the refill bonus.
    }
    goTo('/cart');
  };

  const addButton = (
    <button type="button" onClick={() => setSheet({})} className="text-[13px] font-semibold" style={{ color: BRAND }}>
      {tr('Add', 'Magdagdag')}
    </button>
  );

  return (
    <Screen
      title={tr('Refill reminders', 'Mga refill reminder')}
      subtitle={tr('We text you the day before', 'Ite-text ka namin isang araw bago')}
      onClose={onClose}
      headerAction={data ? addButton : undefined}
    >
      <ErrorNote text={error} />

      {!data && !loadError && (
        <div className="space-y-2.5" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-[120px] animate-pulse rounded-[20px] bg-white" />
          ))}
        </div>
      )}

      {!data && loadError && (
        <>
          <ErrorNote text={tr(`${loadError} Check your connection and try again.`, `${loadError} Tingnan ang iyong connection at subukan ulit.`)} />
          <PrimaryButton onClick={() => reload()}>{tr('Try again', 'Subukan ulit')}</PrimaryButton>
        </>
      )}

      {data && sorted.length === 0 && (
        <Empty
          icon="fa-bell"
          title={tr('No reminders yet', 'Wala pang reminder')}
          text={tr(
            "Tell us how often a medicine runs out and we'll text you the day before, so you can request it in time.",
            'Sabihin sa amin kung gaano kadalas maubos ang isang gamot at ite-text ka namin isang araw bago, para ma-request mo ito sa tamang oras.'
          )}
          action={<SmallButton onClick={() => setSheet({})}>{tr('Add a reminder', 'Magdagdag ng reminder')}</SmallButton>}
        />
      )}

      {sorted.length > 0 && (
        <>
          <ul className="space-y-2.5">
            {sorted.map((r) => {
              const active = r.active !== false;
              const due = active && r.nextDue <= soon;
              const switchId = `reminder-active-${r._key}`;
              return (
                <li key={r._key} className="overflow-hidden rounded-[20px] border border-[#EEF1F5] bg-white">
                  <button
                    type="button"
                    onClick={() => setSheet({ reminder: r })}
                    className="flex w-full items-start gap-3 px-4 pb-3 pt-3.5 text-left"
                    aria-label={tr(`Edit reminder for ${r.name}`, `I-edit ang reminder para sa ${r.name}`)}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F1F8FE]" style={{ color: BRAND }}>
                      <i className="fa-solid fa-bell text-[13px]" />
                    </span>
                    <span className={`min-w-0 flex-1 ${active ? '' : 'opacity-60'}`}>
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-medium text-gray-900">{r.name}</span>
                        {due && (
                          <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700">{tr('Due', 'Due na')}</span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-gray-500">
                        {[
                          r.patientName ? tr(`For ${r.patientName}`, `Para kay ${r.patientName}`) : '',
                          tr(`Every ${r.everyDays} days`, `Tuwing ${r.everyDays} araw`),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-gray-500">
                        {active ? tr(`Next: ${shortDate(r.nextDue)}`, `Susunod: ${shortDate(r.nextDue)}`) : tr('Paused', 'Naka-pause')}
                      </span>
                    </span>
                    <i className="fa-solid fa-chevron-right mt-3 shrink-0 text-[11px] text-gray-300" />
                  </button>

                  <div className="flex items-center gap-3 border-t border-[#EEF1F5] px-4 py-3">
                    <SmallButton onClick={() => requestNow(r)}>
                      <i className="fa-solid fa-cart-plus mr-1.5 text-[11px]" />
                      {tr('Request now', 'I-request ngayon')}
                    </SmallButton>
                    <label htmlFor={switchId} className="ml-auto text-[12.5px] text-gray-500">
                      {active ? tr('On', 'Naka-on') : tr('Paused', 'Naka-pause')}
                    </label>
                    <Switch id={switchId} on={active} onChange={(on) => setActive(r, on)} label={tr(`Reminder for ${r.name}`, `Reminder para sa ${r.name}`)} />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="flex gap-2 px-1 text-[11.5px] leading-relaxed text-gray-500">
            <i className="fa-solid fa-star mt-[3px] text-[10px] text-amber-400" />
            {tr(
              'Request within 3 days of the date to earn bonus points. We then move the date on for you.',
              'Mag-request sa loob ng 3 araw mula sa petsa para makakuha ng bonus points. Kami na ang mag-a-adjust ng susunod na petsa.'
            )}
          </p>
        </>
      )}

      {sheet && (
        <AddReminderSheet reminder={sheet.reminder} onClose={() => setSheet(null)} onSaved={showToast} />
      )}
      {consentSheet}
      <Toast text={toast} />
    </Screen>
  );
}
