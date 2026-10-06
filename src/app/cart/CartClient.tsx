'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { getApiUrl } from '@/lib/api';
import { submitInquiry } from '@/lib/offlineInquiry';
import { Turnstile, useTurnstile } from '@/lib/turnstile';
import {
  ALLOWED_FILE_TYPES_ACCEPT,
  MAX_UPLOAD_BYTES,
  compressImage,
  estimateUploadBytes,
  fileToBase64,
  validateFiles,
} from '@/lib/fileUpload';
import {
  CART_CHANGED_EVENT,
  clearCart,
  isAppMode,
  listCart,
  patchCartItems,
  removeFromCart,
  type CartItem,
} from '@/lib/cart';
import { useProducts } from '@/lib/useSanity';
import { type CatalogueRow, productImage } from '@/lib/catalogueItem';
import { USER_TYPES, type TypeDef, typeByValue } from '@/lib/audienceTypes';
import { loadDetails, type SavedDetails } from '@/lib/accountStore';
import PointsCard, { usePoints } from '@/lib/PointsCard';
import { SignInSheet } from '@/lib/ProfileCard';
import { addRx, useAccountData, type AccountData } from '@/lib/accountApi';
import { useLang } from '@/lib/i18n';
import PatientsScreen from '@/lib/account/PatientsScreen';
import AddressesScreen from '@/lib/account/AddressesScreen';
import { WalletPicker, prepareForWallet } from '@/lib/account/RxWalletScreen';
import EmptyListIllustration from '@/components/EmptyListIllustration';

/**
 * cart.tsx
 * ─────────────────────────────────────────────
 * The request list, and the inquiry it turns into.
 *
 * "Cart" is the familiar name and position, but this is a request list:
 * Getmeds publishes no prices and much of the range is prescription-only, so
 * there is no checkout to reach. Finishing sends the whole list as ONE inquiry
 * through the same endpoint every other form uses.
 *
 * Who is asking decides where it lands. The four audiences already have their
 * own spreadsheets, their own columns and their own people working them, so a
 * pharmacy's request should not arrive in the sheet meant for patients. Asking
 * the type first is what makes that routing possible — and it is the same
 * question, in the same words, the products page already asks.
 */

type Step = 'list' | 'type' | 'form' | 'done';

// FieldKey, TypeDef and USER_TYPES now live in lib/audienceTypes.ts, because
// the account screen stores which of these you are and needs the same list.

const BLANK = {
  name: '', email: '', phone: '', message: '',
  position: '', prcLicense: '', institution: '', location: '',
  age: '', address: '',
  contactName: '', contactRelationship: '',
};

/**
 * Signed-in app customers only.
 *
 * A refill reminder's "Request now" leaves this in sessionStorage as
 * {key, name}; the request it leads to carries the key so the backend can
 * move that reminder on.
 */
const REFILL_KEY = 'getmeds_refill_key';

function readRefill(): { key: string; name: string } | null {
  try {
    const raw = sessionStorage.getItem(REFILL_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v.key === 'string' && v.key ? { key: v.key, name: String(v.name ?? '') } : null;
  } catch {
    return null;
  }
}

/** Stands in for useAccountData() for guests and the website, which never fetch. */
const useNoAccount = () => ({ data: null as AccountData | null });

/**
 * "Save to wallet" after a fresh upload. Runs only once the request has been
 * sent, and swallows every failure: the request is what matters, and it has
 * already gone. Resolves with how many files were saved.
 */
async function saveUploadsToWallet(list: Array<{ file: File; label: string; medicine: string }>, patientName?: string): Promise<number> {
  let saved = 0;
  for (const { file, label, medicine } of list) {
    try {
      const prepared = await prepareForWallet(file);
      await addRx({ label: label.slice(0, 80), medicine, patientName, ...prepared });
      saved++;
    } catch {
      /* a wallet failure never touches the request */
    }
  }
  return saved;
}

/** A small pick chip for "Ordering for" and "Deliver to". */
function Chip({ id, on, onClick, children }: { id: string; on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      id={id}
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex max-w-full items-center gap-1.5 truncate rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
        on ? 'border-[#1D9FDA] bg-[#F1F8FE] text-[#1D9FDA]' : 'border-gray-200 bg-white text-gray-600'
      }`}
    >
      {children}
    </button>
  );
}

function Cart({
  app,
  member,
  onNeedAccount,
  resume = false,
}: {
  app: boolean;
  member: boolean;
  /** Asking for a quote needs an account in the app; called instead of opening the form. */
  onNeedAccount?: () => void;
  /** Just signed in from the quote button: carry on to the form without a second tap. */
  resume?: boolean;
}) {
  const { tr } = useLang();
  const [items, setItems] = useState<CartItem[] | null>(null);
  const [step, setStep] = useState<Step>('list');
  const [type, setType] = useState<TypeDef | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [queued, setQueued] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  // Patients only. Mirrors what product-detail requires of them on the website:
  // a prescription, a valid ID, a named contact person and two confirmations.
  // Which items this request covers. Shopee-style: everything is ticked by
  // default, and the visitor unticks what they are not asking about yet.
  /**
   * Whether to draw the phone-shaped version. Decided on the first render, not
   * in an effect, so the app never flashes the website layout before correcting
   * itself — safe because the entry mounts with createRoot, not hydrateRoot.
   */
  // (Next.js: decided by the CartClient wrapper after mount, since the server
  // cannot know; see below.)
  /**
   * Only used to repair rows saved before CartItem carried an image. The list
   * itself never needs the catalogue — every row already holds everything it
   * draws — so this resolves in the background and the page does not wait on
   * it. Offline it simply never arrives, and the placeholder stands.
   */
  const { data: catalogue } = useProducts();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const knownIds = React.useRef<Set<string>>(new Set());
  // One prescription per product, keyed by item id — a pharmacist reading a row
  // has to see the script for THAT medicine, not a pile of every upload.
  const [rxByItem, setRxByItem] = useState<Record<string, File[]>>({});
  const [idFile, setIdFile] = useState<File | null>(null);
  const [sameAsPatient, setSameAsPatient] = useState(true);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);

  /**
   * A signed-in customer in the app keeps patients, addresses and a
   * prescription wallet with Getmeds, and the form offers them. Decided once,
   * like `app`: signing in happens on another page, and a guest or the website
   * never fetches the account at all (useNoAccount), so their form is exactly
   * what it was.
   */
  const useAccount = member ? useAccountData : useNoAccount;
  const account = useAccount().data;
  const patients = account?.patients ?? [];
  const addresses = account?.addresses ?? [];
  // '' is "Me"; otherwise the _key of the saved patient this request is for.
  const [forKey, setForKey] = useState('');
  const [screen, setScreen] = useState<'patients' | 'addresses' | null>(null);
  const [walletFor, setWalletFor] = useState<CartItem | null>(null);
  // Item id → the wallet label attached to it, so the row can say where it came from.
  const [walletUsed, setWalletUsed] = useState<Record<string, string>>({});
  const [saveToWallet, setSaveToWallet] = useState<Record<string, boolean>>({});
  const [walletNote, setWalletNote] = useState('');

  const turnstile = useTurnstile(step === 'form');

  /**
   * Autofill from the account.
   *
   * This is the half that was missing. The profile screen has been saving
   * these details and saying on screen that they would be used to fill in
   * inquiry forms, while every form still opened blank — so the feature
   * existed only as a promise.
   *
   * Two rules keep it from being annoying. It fills only fields that are still
   * empty, so it can never overwrite something half-typed; and it runs exactly
   * once, so a saved value the visitor has deliberately cleared does not
   * reappear underneath them a moment later.
   */
  const saved = React.useRef<SavedDetails | null>(null);

  /**
   * The form as it should look for a given audience: blank, plus everything
   * the account already knows that THIS audience is actually asked for.
   *
   * Choosing an audience genuinely does have to clear the previous one's
   * answers — a PRC licence must not ride along into a patient's request, and
   * that is what the reset on the picker was for. What it must not also do,
   * and did, is throw away the name, email and phone number that apply to
   * everybody, which is why the autofill appeared not to work at all: it ran,
   * filled the form, and then the very next tap emptied it again.
   */
  const formFor = useCallback((t: TypeDef | null) => {
    const d = saved.current;
    const next: Record<string, string> = { ...BLANK };
    if (!d) return next as typeof BLANK;

    // Asked of every audience.
    next.name = d.name || '';
    next.email = d.email || '';
    next.phone = d.phone || '';

    // Asked only of this one — driven by the same definition that decides
    // which inputs the form renders, so the two cannot disagree.
    for (const f of t?.fields || []) {
      const v = d[f.key];
      if (typeof v === 'string') next[f.key] = v;
    }
    if (t?.kind === 'patient') {
      next.contactName = d.contactName || '';
      next.contactRelationship = d.contactRelationship || '';
    }
    return next as typeof BLANK;
  }, []);

  /**
   * Two sources can fill the form: the details saved on this phone, and, for
   * a signed-in app customer, the profile kept with Getmeds (plus their
   * default address). They arrive in either order, and the server's copy wins.
   *
   * "Wins" has to stop short of the visitor's own typing, so each fill
   * remembers what it put in (autoFilled). A later fill may replace a field
   * that is empty or still holds that earlier automatic value, and nothing
   * else. With only the phone's details, as for every guest, autoFilled starts
   * empty and this is the same empty-fields-only fill as before.
   */
  const device = React.useRef<SavedDetails | null>(null);
  const server = React.useRef<SavedDetails | null>(null);
  const autoFilled = React.useRef<Partial<typeof BLANK>>({});
  // Set once the visitor picks an audience themselves; a later fill keeps it.
  const typePicked = React.useRef(false);

  const applyPrefill = useCallback(() => {
    if (!device.current && !server.current) return;
    const d: SavedDetails = { ...(device.current || {}), ...(server.current || {}) };
    saved.current = d;
    const known = typeByValue(d.userType) || null;
    if (known) setType((t) => (t && typePicked.current ? t : known));

    const fill = formFor(known);
    // Snapshot first: the updater may run after the ref below has moved on.
    const before = { ...autoFilled.current };
    setForm((f) => {
      const next = { ...f };
      for (const key of Object.keys(fill) as Array<keyof typeof BLANK>) {
        if (fill[key] && (!next[key] || next[key] === before[key])) next[key] = fill[key];
      }
      return next;
    });
    for (const key of Object.keys(fill) as Array<keyof typeof BLANK>) {
      if (fill[key]) autoFilled.current[key] = fill[key];
    }
  }, [formFor]);

  const prefilled = React.useRef(false);
  useEffect(() => {
    if (prefilled.current) return;
    prefilled.current = true;
    loadDetails().then((d) => {
      if (!d) return;
      device.current = d;
      applyPrefill();
    });
  }, [applyPrefill]);

  // The server profile, once, as soon as the account arrives. The default
  // address stands in for the profile's own, so it is the one preselected.
  const serverPrefilled = React.useRef(false);
  useEffect(() => {
    if (!member || !account || serverPrefilled.current) return;
    serverPrefilled.current = true;
    const s: Record<string, string> = {};
    for (const [k, v] of Object.entries(account.profile || {})) {
      if (typeof v === 'string' && v.trim()) s[k] = v;
    }
    const home = account.addresses.find((a) => a.isDefault) || account.addresses[0];
    if (home?.address) s.address = home.address;
    server.current = s as SavedDetails;
    applyPrefill();
  }, [member, account, applyPrefill]);

  /** "Ordering for": Me, or a saved patient whose name and age fill the form. */
  const orderFor = (key: string) => {
    const me = saved.current;
    const p = patients.find((x) => x._key === key);
    // Tapping the chip already chosen changes nothing, so typing is never lost.
    if ((p ? key : '') === forKey) return;
    setForKey(p ? key : '');
    if (p) {
      // The caregiver becomes the contact person for someone else's request.
      setForm((f) => ({ ...f, name: p.name, age: p.age || '', contactName: me?.name || f.contactName }));
      setSameAsPatient(false);
    } else {
      setForm((f) => ({ ...f, name: me?.name || '', age: me?.age || '' }));
      setSameAsPatient(true);
    }
  };

  const refresh = useCallback(async () => {
    const list = await listCart();
    setItems(list);

    // Read the ref into a local BEFORE the updater and advance it after.
    //
    // This used to be mutated inside the updater, which made the updater
    // impure — and React deliberately invokes updaters twice in development to
    // catch exactly that. The second invocation saw the ref it had itself just
    // written, concluded every item was already known, and returned an empty
    // set. The visible effect was the whole point of the screen failing: you
    // arrived at your list with nothing ticked and a dead "Select items to
    // inquire about" button, and had to tick a box to undo it.
    const known = knownIds.current;
    setSelected((prev) => {
      const next = new Set<string>();
      for (const it of list) {
        // Anything the visitor has not yet seen starts ticked; anything they
        // deliberately unticked stays unticked.
        if (!known.has(it.id) || prev.has(it.id)) next.add(it.id);
      }
      // A single item is not a choice. The row shows no checkbox in that case,
      // so nothing on screen could tick it back on — leaving it unticked would
      // strand the visitor on a dead button with no way out.
      if (list.length === 1) next.add(list[0].id);
      return next;
    });
    knownIds.current = new Set(list.map((i) => i.id));
  }, []);

  // Signed in from the quote button: continue to the form as if Request had
  // been tapped again, once the list has loaded.
  const resumed = React.useRef(false);
  useEffect(() => {
    if (!resume || resumed.current || !items?.length) return;
    resumed.current = true;
    setStep(type ? 'form' : 'type');
  }, [resume, items, type]);

  useEffect(() => {
    // The tab title is set by App.tsx, in the chosen language.
    refresh();
    window.addEventListener(CART_CHANGED_EVENT, refresh);

    return () => {
      window.removeEventListener(CART_CHANGED_EVENT, refresh);
      // Client-side navigation keeps <body>; do not leak the tint to other pages.
      if (app) document.body.style.background = '';
    };
  }, [refresh, app]);

  /**
   * Backfill the picture on rows saved before CartItem carried one.
   *
   * Without this the fix only reaches products added from now on, and every
   * list already sitting on someone's phone keeps its grey placeholder until
   * they happen to remove and re-add the item — which is not something anyone
   * would think to try, and not a thing to ask of them either.
   *
   * Runs once and settles: the write announces, the list reloads with images,
   * and `missing` is empty on the next pass. Rows the catalogue no longer
   * carries produce no patch, so they cannot spin this either.
   */
  useEffect(() => {
    if (!items || !catalogue) return;
    const missing = items.filter((it) => !it.image);
    if (missing.length === 0) return;

    const byId = new Map(
      (catalogue as CatalogueRow[]).map((p) => [String(p._id), p])
    );
    const patches: Record<string, { image: string }> = {};
    for (const it of missing) {
      const match = byId.get(it.id);
      if (match?.image?.asset) patches[it.id] = { image: productImage(match, 140) };
    }
    if (Object.keys(patches).length > 0) patchCartItems(patches);
  }, [items, catalogue]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (chosen.length === 0 || !type) return;
    setError('');

    // Same gates the website applies before a patient may submit — checked
    // before the spinner starts, so a refusal is immediate rather than a
    // pretend send followed by an error.
    if (type.kind === 'patient') {
      const missing = rxNeeded.filter((it) => !(rxByItem[it.id]?.length));
      if (missing.length) {
        return setError(
          missing.length === 1
            ? tr(`Please upload the prescription for ${missing[0].name}.`, `Paki-upload ang reseta para sa ${missing[0].name}.`)
            : tr(
                `Please upload a prescription for each of: ${missing.map((m) => m.name).join(', ')}.`,
                `Paki-upload ang reseta para sa bawat isa sa: ${missing.map((m) => m.name).join(', ')}.`
              )
        );
      }
      if (!idFile) return setError(tr("Please upload the patient's valid ID.", 'Paki-upload ang valid ID ng pasyente.'));
      if (!sameAsPatient && !form.contactName.trim()) return setError(tr("Please provide the contact person's full name.", 'Pakilagay ang buong pangalan ng contact person.'));
      if (!terms) return setError(tr('Please confirm the information provided is accurate.', 'Pakikumpirma na tama ang impormasyong ibinigay.'));
      if (!privacy) return setError(tr('Please consent to the Privacy Policy to proceed.', 'Pumayag muna sa Privacy Policy para magpatuloy.'));
    }

    setSending(true);

    try {
      // Uploads travel exactly as the website sends them: base64, categorised so
      // the backend can route each to its own spreadsheet column.
      const filesData: { name: string; type: string; base64: string; category?: 'id' | 'prescription' }[] = [];
      if (type.kind === 'patient') {
        // Photos are shrunk before encoding. Vercel rejects a body over ~4.5 MB
        // with a 413 BEFORE the function runs, so an oversized request produces
        // no spreadsheet row, no email and no server-side error to explain it —
        // which is exactly what a multi-product request with two phone photos
        // was doing.
        const prepared: Array<{ file: File; category: string }> = [];
        for (let i = 0; i < chosen.length; i++) {
          for (const f of rxByItem[chosen[i].id] || []) {
            prepared.push({ file: await compressImage(f), category: `prescription:${i}` });
          }
        }
        if (idFile) prepared.push({ file: await compressImage(idFile), category: 'id' });

        const bytes = estimateUploadBytes(prepared.map((x) => x.file));
        if (bytes > MAX_UPLOAD_BYTES) {
          setSending(false);
          return setError(tr(
            `Your attachments are too large to send together (about ${(bytes / 1024 / 1024).toFixed(1)} MB). ` +
            'Please send fewer products in one request, or attach smaller files.',
            `Masyadong malaki ang mga attachment para maipadala nang sabay (mga ${(bytes / 1024 / 1024).toFixed(1)} MB). ` +
            'Bawasan ang mga produkto sa isang request, o mag-attach ng mas maliliit na file.'
          ));
        }

        for (const { file, category } of prepared) {
          filesData.push({ name: file.name, type: file.type, base64: await fileToBase64(file), category: category as any });
        }
      }
      const lines = chosen.map((it) => {
        const detail = [it.strength, it.form].filter(Boolean).join(' · ');
        return `• ${it.name}${detail ? ` (${detail})` : ''}${it.needsRx ? ' — prescription required' : ''}`;
      });

      /**
       * For a signed-in app customer: the items (with pictures, for request
       * history and Order again), who the request is for, and the refill
       * reminder it came from. withAppMeta() in offlineInquiry merges this in.
       */
      const patientName = type.kind === 'patient' ? patients.find((p) => p._key === forKey)?.name : undefined;
      const refill = member ? readRefill() : null;
      const appMeta = member
        ? {
            items: chosen.map((it) => ({
              id: it.id,
              name: it.name,
              url: it.url,
              image: it.image || '',
              strength: it.strength || '',
              form: it.form || '',
            })),
            ...(patientName ? { patientName } : {}),
            ...(refill ? { refillKey: refill.key } : {}),
          }
        : undefined;

      // Fresh uploads the customer asked to keep. Taken now, before the list
      // is cleared; saved only once the request has gone.
      const toWallet =
        member && type.kind === 'patient'
          ? rxNeeded
              .filter((it) => saveToWallet[it.id] && !walletUsed[it.id])
              .flatMap((it) => {
                const files = rxByItem[it.id] || [];
                return files.map((file, n) => ({
                  file,
                  medicine: it.name,
                  label: files.length > 1 ? `${it.name}, page ${n + 1}` : it.name,
                }));
              })
          : [];

      const payload = {
        ...(appMeta ? { appMeta } : {}),
        // Routed by who is asking, so it lands in the sheet that audience's
        // team already works rather than all four funnelling into one.
        inquiryType: type.inquiryType,
        fullName: form.name,
        email: form.email,
        phone: form.phone,
        // Doubles as the company/organisation column where a sheet has one.
        subject: form.institution,
        // The email body has to read on its own, so the list is spelled out
        // here as well as sent structurally below.
        message:
          `Request for a quote on ${chosen.length} product${chosen.length === 1 ? '' : 's'}:\n\n` +
          lines.join('\n') +
          (form.message.trim() ? `\n\nNotes:\n${form.message.trim()}` : ''),
        turnstileToken: turnstile.token,
        additionalData: {
          customerType: type.label,
          position: form.position,
          prcLicense: form.prcLicense,
          institution: form.institution,
          location: form.location,
          consent: 'Confirmed',
          age: form.age,
          address: form.address,
          contactSameAsPatient: sameAsPatient,
          contactName: sameAsPatient ? form.name : form.contactName,
          contactRelationship: sameAsPatient ? 'Self' : form.contactRelationship,
          privacyPolicyConsent: privacy ? 'Yes' : '',
          // Becomes one spreadsheet row per product on a sheet that has a
          // product column — Order Medicine (TARGET PRODUCT) and Product
          // Inquiry (PRODUCT) do; the partner sheets get a single row with the
          // list in MESSAGE instead.
          items: chosen.map((it) => ({
            name: it.name,
            strength: it.strength || '',
            form: it.form || '',
            url: it.url,
            needsRx: Boolean(it.needsRx),
          })),
        },
        files: filesData,
      };

      const result = await submitInquiry(payload, { endpoint: getApiUrl(), returnPath: '/cart' });
      turnstile.reset();

      if (result.status === 'failed') { setError(result.error); return; }

      if (member) {
        // The reminder's key rode along (a queued request keeps it in its
        // payload), so the next request must not carry it again.
        if (refill) {
          try { sessionStorage.removeItem(REFILL_KEY); } catch { /* storage blocked */ }
        }
        if (result.status === 'sent' && toWallet.length) {
          setWalletNote(tr('Saving your prescription to your wallet…', 'Sine-save ang reseta mo sa iyong wallet…'));
          saveUploadsToWallet(toWallet, patientName || form.name.trim() || undefined).then((n) =>
            setWalletNote(
              n === toWallet.length
                ? tr('Your prescription is saved in your wallet for next time.', 'Naka-save na ang reseta mo sa wallet para sa susunod.')
                : tr(
                    'Your request was sent, but we could not save the prescription to your wallet. Add it from Account, Prescription wallet.',
                    'Naipadala ang request mo, pero hindi namin na-save ang reseta sa iyong wallet. Idagdag ito sa Account, Prescription wallet.'
                  )
            )
          );
        }
      }

      // Sent or safely queued — either way the request is recorded, so the list
      // should not sit there inviting a duplicate submission.
      setQueued(result.status === 'queued');
      await clearCart();
      setStep('done');
    } catch (err: any) {
      setError(err?.message || tr('Something went wrong. Please try again.', 'Nagkaproblema. Pakisubukan ulit.'));
    } finally {
      setSending(false);
    }
  };

  // Everything downstream works on the ticked subset, never the whole list.
  const chosen = (items || []).filter((it) => selected.has(it.id));
  const rxNeeded = chosen.filter((it) => it.needsRx);
  const empty = items !== null && items.length === 0;
  const field = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-[13.5px] outline-none focus:border-primary';
  const count = chosen.length;

  return (
    <>
      {/* pt-28 clears the website's fixed navbar. The app hides that bar, so
          on a phone the same padding is just 112px of empty screen above the
          heading — which is what the first fold was being spent on. */}
      {/* A <div>, not <main>: the root layout already wraps pages in <main>. */}
      <div className={`mx-auto flex min-h-[70vh] max-w-3xl flex-col ${app ? 'px-4 pb-8 pt-6' : 'px-6 pb-16 pt-28'}`}>
        {step === 'done' ? (
          <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
              <i className="fa-solid fa-check text-2xl text-green-600"></i>
            </div>
            <h1 className="text-xl font-semibold text-gray-900">
              {queued
                ? tr('Saved — we’ll send it shortly', 'Naka-save — ipapadala namin ito maya-maya')
                : tr('Request sent', 'Naipadala na ang request')}
            </h1>
            <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-gray-500">
              {queued
                ? tr(
                    'You were offline, so your request is saved on this device and will be sent automatically as soon as you have a connection.',
                    'Offline ka kanina, kaya naka-save ang request mo sa device na ito at awtomatiko itong ipapadala kapag may connection ka na.'
                  )
                : tr(
                    'Our team will get back to you with availability and pricing. Prescription items still need a valid prescription.',
                    'Babalikan ka ng aming team tungkol sa availability at presyo. Kailangan pa rin ng valid na reseta para sa mga gamot na may reseta.'
                  )}
            </p>
            {walletNote && (
              <p className="mt-3 flex max-w-sm items-start gap-2 rounded-2xl bg-[#F6F7F9] px-3.5 py-2.5 text-left text-[12px] leading-snug text-gray-600">
                <i className="fa-solid fa-file-prescription mt-[2px] text-[11px] text-[#1D9FDA]"></i>
                {walletNote}
              </p>
            )}
            <a href="/product-range" className="mt-6 rounded-full px-7 py-3 text-sm font-semibold text-white"
              style={{ background: 'linear-gradient(135deg,#1D9FDA,#61A644)' }}>
              {tr('Keep browsing', 'Mag-browse pa')}
            </a>
          </div>
        ) : step === 'type' ? (
          <>
            <button type="button" onClick={() => setStep('list')} className="mb-4 self-start text-[13px] font-semibold text-gray-400">
              <i className="fa-solid fa-chevron-left mr-1.5 text-[11px]"></i>{tr('Back to list', 'Bumalik sa listahan')}
            </button>
            <h1 className="text-2xl font-semibold text-gray-900">{tr('Who is requesting?', 'Sino ang nagre-request?')}</h1>
            <p className="mt-1.5 text-sm text-gray-500">
              {tr(
                `This tells us which team should handle your ${count} item${count === 1 ? '' : 's'}.`,
                `Para malaman namin kung aling team ang hahawak sa iyong ${count} ${count === 1 ? 'item' : 'mga item'}.`
              )}
            </p>

            <div className="mt-6 space-y-3">
              {USER_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  // Resets to what the account knows for THIS audience rather
                  // than to blank — see formFor().
                  onClick={() => { typePicked.current = true; setType(t); setForm(formFor(t)); setForKey(''); setStep('form'); }}
                  className="flex w-full items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-primary"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={{ background: 'linear-gradient(135deg,#eaf6fd,#eef7ea)' }}>
                    <i className={`fa-solid ${t.icon} text-[15px]`} style={{ color: '#1D9FDA' }}></i>
                  </span>
                  <span className="flex-1 text-[14px] font-semibold text-gray-800">{tr(t.label, t.labelTl ?? t.label)}</span>
                  <i className="fa-solid fa-chevron-right text-[12px] text-gray-300"></i>
                </button>
              ))}
            </div>
          </>
        ) : step === 'form' && type ? (
          <>
            <button type="button" onClick={() => setStep('type')} className="mb-4 self-start text-[13px] font-semibold text-gray-400">
              <i className="fa-solid fa-chevron-left mr-1.5 text-[11px]"></i>{tr('Change type', 'Palitan ang type')}
            </button>
            <h1 className="text-2xl font-semibold text-gray-900">{tr('Request a quote', 'Humingi ng quote')}</h1>
            <p className="mt-1.5 text-sm text-gray-500">
              {tr(type.label, type.labelTl ?? type.label)} · {tr(
                `${count} product${count === 1 ? '' : 's'}`,
                `${count} ${count === 1 ? 'produkto' : 'mga produkto'}`
              )}
            </p>

            <form onSubmit={submit} className="mt-6 space-y-3">
              {member && type.kind === 'patient' && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between px-0.5">
                    <p className="text-[12.5px] font-semibold text-gray-700">{tr('Ordering for', 'Para kay')}</p>
                    <button id="cart-add-patient" type="button" onClick={() => setScreen('patients')}
                      className="text-[12px] font-semibold text-[#1D9FDA]">
                      <i className="fa-solid fa-plus mr-1 text-[10px]"></i>{tr('Add patient', 'Magdagdag ng pasyente')}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip id="cart-for-me" on={!forKey} onClick={() => orderFor('')}>
                      <i className="fa-solid fa-user text-[10px]"></i>{tr('Me', 'Ako')}
                    </Chip>
                    {patients.map((p) => (
                      <Chip key={p._key} id={`cart-for-${p._key}`} on={forKey === p._key} onClick={() => orderFor(p._key)}>
                        {p.name}
                        {p.relationship && <span className="font-normal opacity-70">{p.relationship}</span>}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}

              <input id="cart-name" required className={field}
                placeholder={member && forKey ? tr("Patient's name *", 'Pangalan ng pasyente *') : tr('Your name *', 'Iyong pangalan *')} value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />

              {type.fields.map((f) => (
                <React.Fragment key={f.key}>
                  {member && f.key === 'address' && (
                    <div>
                      <div className="mb-1.5 flex items-center justify-between px-0.5">
                        <p className="text-[12.5px] font-semibold text-gray-700">{tr('Deliver to', 'Ide-deliver sa')}</p>
                        <button id="cart-add-address" type="button" onClick={() => setScreen('addresses')}
                          className="text-[12px] font-semibold text-[#1D9FDA]">
                          <i className="fa-solid fa-plus mr-1 text-[10px]"></i>{tr('Add address', 'Magdagdag ng address')}
                        </button>
                      </div>
                      {addresses.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {addresses.map((a) => (
                            <Chip key={a._key} id={`cart-address-${a._key}`}
                              on={form.address.trim() === a.address.trim()}
                              onClick={() => setForm((cur) => ({ ...cur, address: a.address }))}>
                              <i className="fa-solid fa-location-dot text-[10px]"></i>
                              {a.label || 'Address'}
                              {a.isDefault && <span className="font-normal opacity-70">Default</span>}
                            </Chip>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <input
                    id={`cart-${f.key}`}
                    required={f.required}
                    className={field}
                    placeholder={f.required ? `${tr(f.label, f.labelTl ?? f.label)} *` : `${tr(f.label, f.labelTl ?? f.label)} ${tr('(optional)', '(opsyonal)')}`}
                    value={form[f.key]}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  />
                </React.Fragment>
              ))}

              <input required type="email" className={field} placeholder="Email *" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input required className={field} placeholder="Mobile number *" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              {type.kind === 'patient' && (
                <>
                  <label className="flex items-start gap-2.5 pt-1">
                    <input type="checkbox" checked={sameAsPatient} onChange={(e) => setSameAsPatient(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300" />
                    <span className="text-[12.5px] leading-snug text-gray-600">{tr('The contact person is the patient', 'Ang pasyente ang contact person')}</span>
                  </label>

                  {!sameAsPatient && (
                    <>
                      <input required className={field} placeholder={tr("Contact person's full name *", 'Buong pangalan ng contact person *')} value={form.contactName}
                        onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
                      <input className={field} placeholder={tr('Relationship to patient (optional)', 'Relasyon sa pasyente (opsyonal)')} value={form.contactRelationship}
                        onChange={(e) => setForm({ ...form, contactRelationship: e.target.value })} />
                    </>
                  )}

                  {rxNeeded.length > 0 && (
                    <div className="rounded-xl border border-gray-200 p-3">
                      <p className="text-[12.5px] font-semibold text-gray-700">
                        {tr('Prescriptions', 'Mga reseta')} * <span className="font-normal text-gray-400">({tr(`${rxNeeded.length} needed`, `${rxNeeded.length} kailangan`)})</span>
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-gray-400">
                        {tr(
                          'One per prescription-only medicine, so each can be checked against the right item.',
                          'Isa para sa bawat gamot na kailangan ng reseta, para matsek ang bawat isa sa tamang item.'
                        )}
                      </p>
                      <div className="mt-3 space-y-3">
                        {rxNeeded.map((it) => (
                          <div key={it.id}>
                            <p className="text-[12px] font-semibold leading-snug text-gray-700">{it.name}</p>
                            <input
                              id={`rx-file-${it.id}`}
                              type="file" multiple accept={ALLOWED_FILE_TYPES_ACCEPT}
                              onChange={(e) => {
                                const { valid, errors } = validateFiles(Array.from(e.target.files || []));
                                setError(errors[0] || '');
                                setRxByItem((prev) => ({ ...prev, [it.id]: valid }));
                                if (member) {
                                  // A fresh upload replaces anything taken from the wallet.
                                  setWalletUsed(({ [it.id]: _gone, ...rest }) => rest);
                                }
                              }}
                              className="mt-1 w-full text-[12px] file:mr-3 file:rounded-full file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-[12px] file:font-semibold"
                            />
                            {member && (
                              <button id={`rx-wallet-${it.id}`} type="button" onClick={() => setWalletFor(it)}
                                className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[#F1F8FE] px-3 py-1.5 text-[12px] font-semibold text-[#1D9FDA]">
                                <i className="fa-solid fa-wallet text-[10.5px]"></i>{tr('Use from wallet', 'Gamitin mula sa wallet')}
                              </button>
                            )}
                            {rxByItem[it.id]?.length ? (
                              <p className="mt-1 text-[11.5px] text-green-700">
                                {walletUsed[it.id]
                                  ? tr(`From your wallet: ${walletUsed[it.id]}`, `Mula sa iyong wallet: ${walletUsed[it.id]}`)
                                  : tr(
                                      `${rxByItem[it.id].length} file${rxByItem[it.id].length === 1 ? '' : 's'} attached`,
                                      `${rxByItem[it.id].length} ${rxByItem[it.id].length === 1 ? 'file' : 'mga file'} ang naka-attach`
                                    )}
                              </p>
                            ) : null}
                            {member && rxByItem[it.id]?.length && !walletUsed[it.id] ? (
                              <label htmlFor={`rx-save-${it.id}`} className="mt-1.5 flex items-center gap-2">
                                <input
                                  id={`rx-save-${it.id}`}
                                  type="checkbox"
                                  checked={Boolean(saveToWallet[it.id])}
                                  onChange={(e) => setSaveToWallet((prev) => ({ ...prev, [it.id]: e.target.checked }))}
                                  className="h-4 w-4 rounded border-gray-300"
                                  style={{ accentColor: '#1D9FDA' }}
                                />
                                <span className="text-[11.5px] text-gray-600">{tr('Save to my prescription wallet', 'I-save sa aking prescription wallet')}</span>
                              </label>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border border-gray-200 p-3">
                    <p className="text-[12.5px] font-semibold text-gray-700">{tr('Upload valid ID of patient *', 'I-upload ang valid ID ng pasyente *')}</p>
                    <input
                      type="file" accept={ALLOWED_FILE_TYPES_ACCEPT}
                      onChange={(e) => {
                        const { valid, errors } = validateFiles(Array.from(e.target.files || []));
                        setError(errors[0] || '');
                        setIdFile(valid[0] || null);
                      }}
                      className="mt-2 w-full text-[12px] file:mr-3 file:rounded-full file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-[12px] file:font-semibold"
                    />
                    {idFile && <p className="mt-1.5 text-[11.5px] text-green-700">{idFile.name}</p>}
                  </div>
                </>
              )}

              <textarea rows={3} className={`${field} resize-none`} placeholder={tr('Anything else we should know? (optional)', 'May iba pa ba kaming dapat malaman? (opsyonal)')}
                value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />

              {type.kind === 'patient' && (
                <>
                  <label className="flex items-start gap-2.5">
                    <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300" />
                    <span className="text-[11.5px] leading-snug text-gray-600">
                      {tr(
                        'I confirm the information provided is accurate and the prescription submitted is valid.',
                        'Kinukumpirma ko na tama ang impormasyong ibinigay at valid ang isinumiteng reseta.'
                      )} *
                    </span>
                  </label>
                  <label className="flex items-start gap-2.5">
                    <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300" />
                    <span className="text-[11.5px] leading-snug text-gray-600">
                      {tr(
                        'I have read and consent to the processing of my personal and sensitive personal information under the ',
                        'Nabasa ko at pumapayag ako sa pagproseso ng aking personal at sensitibong personal na impormasyon ayon sa '
                      )}
                      <a href="/privacy-policy" className="underline">Privacy Policy</a>. *
                    </span>
                  </label>
                </>
              )}

              <Turnstile turnstile={turnstile} />

              {error && <p className="text-[12.5px] text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={sending || (turnstile.enabled && !turnstile.token)}
                className="w-full rounded-full py-3.5 text-[14px] font-semibold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg,#1D9FDA,#61A644)' }}
              >
                {sending
                  ? tr('Sending…', 'Ipinapadala…')
                  : tr(
                      `Send request for ${count} item${count === 1 ? '' : 's'}`,
                      `Ipadala ang request para sa ${count} ${count === 1 ? 'item' : 'mga item'}`
                    )}
              </button>
              <p className="pt-1 text-center text-[11px] text-gray-400">
                {tr('By submitting, you agree to our ', 'Sa pagpapadala, sumasang-ayon ka sa aming ')}
                <a href="/privacy-policy" className="underline">Privacy Policy</a>.
              </p>
            </form>
          </>
        ) : (
          <>
            {/* Only the heading shares its row with "Clear list"; the note
                below gets the full width rather than wrapping beside it. */}
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-2xl font-semibold text-gray-900">{tr('Your request list', 'Ang iyong request list')}</h1>
              {count > 0 && (
                <button type="button" onClick={() => clearCart()} className="mt-1.5 shrink-0 text-[12px] font-semibold text-gray-400 hover:text-gray-600">
                  {tr('Clear list', 'I-clear ang listahan')}
                </button>
              )}
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
              {tr(
                'Add medicines you want a quote for, then send them to us in one request.',
                'Idagdag ang mga gamot na gusto mong ma-quote, tapos ipadala sa amin sa iisang request.'
              )}
            </p>

            {items === null ? (
              <div className="mt-8 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-gray-100" />)}
              </div>
            ) : empty ? (
              <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
                <EmptyListIllustration />
                <h2 className="text-base font-semibold text-gray-800">{tr('Nothing saved yet', 'Wala pang naka-save')}</h2>
                <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-gray-500">
                  {tr(
                    'Browse the catalogue and tap the cart icon on any medicine. We’ll reply with availability and pricing — prescription items still need a valid prescription.',
                    'Mag-browse sa catalogue at i-tap ang cart icon sa kahit anong gamot. Sasagot kami tungkol sa availability at presyo — kailangan pa rin ng valid na reseta para sa mga gamot na may reseta.'
                  )}
                </p>
                <a href="/product-range" className="mt-6 rounded-full px-7 py-3 text-sm font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg,#1D9FDA,#61A644)' }}>
                  {tr('Browse products', 'Mag-browse ng produkto')}
                </a>
              </div>
            ) : (
              <>
                <ul className="mt-6 space-y-2.5">
                  {items.map((it) => (
                    <li
                      key={it.id}
                      className={`flex items-center gap-3 rounded-[16px] border border-gray-100 bg-white ${app ? 'p-2.5' : 'p-3'}`}
                    >
                      {/* Only asked when there is genuinely something to choose
                          between. With a single row the answer is already known,
                          and a tickbox for it is a decision that buys nothing —
                          it only stands between the visitor and the one button
                          on the screen. */}
                      {items.length > 1 && (
                        <input
                          type="checkbox"
                          checked={selected.has(it.id)}
                          aria-label={tr(`Include ${it.name} in this request`, `Isama ang ${it.name} sa request na ito`)}
                          onChange={(e) => setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(it.id); else next.delete(it.id);
                            return next;
                          })}
                          className="h-[18px] w-[18px] shrink-0 rounded"
                          style={{ accentColor: '#1D9FDA' }}
                        />
                      )}

                      {/* Not a link, though it sits beside one: a second anchor
                          to the same page is another tab stop and another thing
                          a screen reader reads out, for no new destination. */}
                      <div className="flex h-[56px] w-[56px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F6F8FC] p-1.5">
                        {it.image ? (
                          <img
                            src={it.image}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-contain mix-blend-multiply"
                            onError={(e) => { const i = e.currentTarget; i.onerror = null; i.style.display = 'none'; }}
                          />
                        ) : (
                          <i className="fa-solid fa-prescription-bottle-medical text-[18px] text-gray-300"></i>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <a href={it.url} className="line-clamp-2 block text-[13.5px] font-semibold leading-snug text-gray-900">{it.name}</a>
                        {(it.strength || it.form) && (
                          <p className="mt-0.5 line-clamp-1 text-[11.5px] text-gray-400">{[it.strength, it.form].filter(Boolean).join(' · ')}</p>
                        )}
                        {it.needsRx && (
                          <span className="mt-1.5 inline-block rounded-full bg-[#E8F5FC] px-2 py-[3px] text-[10px] font-semibold text-[#1D9FDA]">
                            <i className="fa-solid fa-file-prescription mr-1"></i>{tr('Prescription required', 'Kailangan ng reseta')}
                          </span>
                        )}
                      </div>

                      <button type="button" onClick={() => removeFromCart(it.id)} aria-label={tr(`Remove ${it.name}`, `Alisin ang ${it.name}`)}
                        className="shrink-0 rounded-full p-2 text-gray-300 hover:text-red-500">
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </li>
                  ))}
                </ul>

                {/* Pinned to the bottom of the screen, just above the tab bar,
                    so it is in reach however long the list gets. The spacer
                    keeps the last item from ending up underneath it. */}
                <div aria-hidden="true" className="h-24" />
                <div className="gm-cart-cta fixed inset-x-0 z-30 mx-auto max-w-3xl px-4">
                <button
                  type="button"
                  disabled={count === 0}
                  // Straight to the form when the account already knows which
                  // audience this is. Asking "who is asking?" every single time
                  // of someone who has answered it before is a step that buys
                  // nothing — and the form's own back button still leads to
                  // the picker for anyone who needs to change it.
                  onClick={() => {
                    // A quote needs an account in the app (it is what the
                    // points are credited to); the sign-in sheet carries the
                    // visitor straight back here once they're in.
                    if (app && !member) {
                      onNeedAccount?.();
                      return;
                    }
                    setStep(type ? 'form' : 'type');
                  }}
                  className="w-full rounded-full py-3.5 text-[14px] font-semibold text-white disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg,#1D9FDA,#61A644)', boxShadow: '0 8px 20px rgba(29,159,218,.28)' }}
                >
                  {/* Says what happens next, not what the screen wants from
                      you. "Select items to inquire about" was a label for a
                      button that could not be pressed — it described a chore
                      rather than an outcome, and with one item it should never
                      have appeared at all. */}
                  {count === 0
                    ? tr('Tick an item to continue', 'Pumili ng item para magpatuloy')
                    : items.length === 1
                      ? tr('Request a quote', 'Humingi ng quote')
                      : tr(
                          `Request a quote for ${count} item${count === 1 ? '' : 's'}`,
                          `Humingi ng quote para sa ${count} ${count === 1 ? 'item' : 'mga item'}`
                        )}
                </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Signed-in app customers only: the account screens and the wallet,
          opened over the form so nothing typed is lost. */}
      {member && screen === 'patients' && <PatientsScreen startAdding onClose={() => setScreen(null)} />}
      {member && screen === 'addresses' && <AddressesScreen startAdding onClose={() => setScreen(null)} />}
      {member && walletFor && (
        <WalletPicker
          medicine={walletFor.name}
          onClose={() => setWalletFor(null)}
          onPick={(file, doc) => {
            const id = walletFor.id;
            // Stored exactly as an upload would be, so submit() compresses,
            // encodes and categorises it the same way.
            setRxByItem((prev) => ({ ...prev, [id]: [file] }));
            setWalletUsed((prev) => ({ ...prev, [id]: doc.label }));
            setSaveToWallet((prev) => ({ ...prev, [id]: false }));
            const input = document.getElementById(`rx-file-${id}`) as HTMLInputElement | null;
            if (input) input.value = '';
            setError('');
            setWalletFor(null);
          }}
        />
      )}
    </>
  );
}

/**
 * The Vite entry mounted with createRoot, so Cart could read isAppMode() and
 * isSignedIn() on its first render. Here the page is server-rendered, so the
 * first render is always the website/guest layout and the real values are read
 * after mount. `member` is part of the key because it picks which account hook
 * Cart calls, and that choice must stay fixed for an instance's lifetime.
 */
export default function CartClient() {
  const { tr } = useLang();
  const [mode, setMode] = useState({ app: false, member: false });
  const points = usePoints();
  const [needAccount, setNeedAccount] = useState(false);
  const [resume, setResume] = useState(false);
  useEffect(() => {
    const app = isAppMode();
    setMode({ app, member: app && points.signedIn });
  }, [points.signedIn]);
  // Signed in (or up) from the sheet the quote button opened: close it and
  // let the new member Cart carry on to the form.
  useEffect(() => {
    if (needAccount && points.signedIn) {
      setNeedAccount(false);
      setResume(true);
    }
  }, [needAccount, points.signedIn]);
  // cart.html's <body class="text-gray-800"> and its Poppins font rule.
  return (
    <div className="text-gray-800" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <Cart
        key={mode.member ? 'member' : 'guest'}
        app={mode.app}
        member={mode.member}
        resume={resume}
        onNeedAccount={() => setNeedAccount(true)}
      />
      <SignInSheet open={needAccount && !points.signedIn} onClose={() => setNeedAccount(false)}>
        <PointsCard
          points={points}
          bare
          initialMode="signup"
          intro={tr(
            'You need a free account to request a quote. It also earns you Getmeds Points on every request.',
            'Kailangan mo ng libreng account para humingi ng quote. Makakakuha ka rin ng Getmeds Points sa bawat request.'
          )}
        />
      </SignInSheet>
    </div>
  );
}
