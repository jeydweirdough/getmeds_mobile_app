'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Card, Empty, ErrorNote, Field, PrimaryButton, Screen, Sheet, SmallButton, Toast, inputClass, useToast } from '../ui/Screen';
import {
  addDays,
  addRx,
  deleteRx,
  getRxFile,
  manilaToday,
  shortDate,
  useAccountData,
  type RxDoc,
} from '../accountApi';
import { compressImage, fileToBase64 } from '../fileUpload';

/**
 * RxWalletScreen.tsx
 * ─────────────────────────────────────────────
 * The prescription wallet: a customer uploads a prescription once and
 * attaches it to any request after that, instead of photographing the same
 * paper every month.
 *
 * Prescriptions are health data. They are kept with the customer's account
 * and reach the Getmeds team only when attached to a request, which the
 * screen says plainly. Nothing is cached on the phone: a preview is fetched
 * when asked for and its blob URL is released when the preview closes.
 *
 * The request list (pages/cart.tsx) uses the helpers exported here, so a
 * wallet file and a fresh upload are checked and encoded the same way.
 */

/** What the server accepts, and the most it keeps per file. */
export const WALLET_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const WALLET_MAX_BYTES = 10 * 1024 * 1024;

export type RxStatus = 'expired' | 'soon' | 'ok';

/** Expired before today, or expiring within 30 days (Manila dates). */
export function rxStatus(doc: Pick<RxDoc, 'expiresOn'>): RxStatus {
  if (!doc.expiresOn) return 'ok';
  const today = manilaToday();
  if (doc.expiresOn < today) return 'expired';
  if (doc.expiresOn <= addDays(today, 30)) return 'soon';
  return 'ok';
}

export function RxBadge({ status }: { status: RxStatus }) {
  if (status === 'ok') return null;
  return status === 'expired' ? (
    <span className="rounded-full bg-red-50 px-2 py-[3px] text-[10.5px] font-semibold text-red-600">Expired</span>
  ) : (
    <span className="rounded-full bg-amber-50 px-2 py-[3px] text-[10.5px] font-semibold text-amber-700">Expires soon</span>
  );
}

/** A wallet file (base64, no data: prefix) as a File, the same as a fresh upload. */
export function base64ToFile(name: string, type: string, base64: string): File {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type, lastModified: Date.now() });
}

/**
 * Shrinks a photo and checks it fits the wallet. Resolves with the fields
 * addRx needs, or throws an Error whose message tells the customer what to do.
 */
export async function prepareForWallet(file: File): Promise<{ fileName: string; fileType: string; base64: string }> {
  const ready = await compressImage(file);
  if (!WALLET_TYPES.includes(ready.type)) {
    throw new Error('Use a photo (JPG, PNG or WebP) or a PDF of the prescription.');
  }
  if (ready.size > WALLET_MAX_BYTES) {
    throw new Error('This file is over 10 MB. Take a photo of the prescription instead, or use a smaller PDF.');
  }
  return { fileName: ready.name, fileType: ready.type, base64: await fileToBase64(ready) };
}

/** "Amlodipine · for Maria · expires 3 Mar 2027", or what part of it is known. */
function describe(doc: RxDoc): string {
  return [
    doc.medicine || '',
    doc.patientName ? `for ${doc.patientName}` : '',
    doc.expiresOn ? `${rxStatus(doc) === 'expired' ? 'expired' : 'expires'} ${shortDate(doc.expiresOn)}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

const isPdf = (type: string) => type === 'application/pdf';

export default function RxWalletScreen({ onClose, level }: { onClose: () => void; level?: number }) {
  const { data, error: loadError, reload } = useAccountData();
  const docs = data?.rx ?? [];
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<RxDoc | null>(null);
  const [toast, showToast] = useToast();

  return (
    <Screen
      title="Prescription wallet"
      subtitle="Upload once, attach to any request"
      onClose={onClose}
      level={level}
      headerAction={
        data && docs.length > 0 ? (
          <SmallButton onClick={() => setAdding(true)}>
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
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[62px] animate-pulse rounded-[20px] bg-white" />
            ))}
          </div>
        )
      ) : docs.length === 0 ? (
        <Empty
          icon="fa-file-prescription"
          title="No prescriptions yet"
          text="Add a photo or PDF of a prescription. Next time you request that medicine, attach it in one tap."
          action={
            <div className="mx-auto max-w-[240px]">
              <PrimaryButton onClick={() => setAdding(true)}>Add a prescription</PrimaryButton>
            </div>
          }
        />
      ) : (
        <Card title="Your prescriptions" note="Tap one to see it.">
          {docs.map((d) => (
            <button
              key={d._id}
              id={`rx-${d._id}`}
              type="button"
              onClick={() => setViewing(d)}
              className="flex w-full items-center gap-3 border-t border-[#EEF1F5] px-4 py-3.5 text-left first:border-t-0"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F1F8FE] text-[#1D9FDA]">
                <i className={`fa-solid ${isPdf(d.fileType) ? 'fa-file-pdf' : 'fa-file-image'} text-[13px]`} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-[14px] font-medium text-gray-900">{d.label}</span>
                  <RxBadge status={rxStatus(d)} />
                </span>
                <span className="mt-0.5 block text-[12px] leading-snug text-gray-500">{describe(d) || `Added ${shortDate(d.createdAt)}`}</span>
              </span>
              <i className="fa-solid fa-chevron-right shrink-0 text-[11px] text-gray-300" />
            </button>
          ))}
        </Card>
      )}

      <p className="flex gap-2 px-1 text-[11.5px] leading-relaxed text-gray-500">
        <i className="fa-solid fa-lock mt-[3px] text-[10px] text-gray-400" />
        Your prescriptions are private. Getmeds sees one only when you attach it to a request.
      </p>

      {adding && (
        <AddRxSheet
          patients={(data?.patients ?? []).map((p) => p.name)}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            showToast('Prescription saved');
          }}
        />
      )}
      {viewing && (
        <ViewRxSheet
          doc={viewing}
          onClose={() => setViewing(null)}
          onDeleted={() => {
            setViewing(null);
            showToast('Prescription removed');
          }}
        />
      )}
      <Toast text={toast} />
    </Screen>
  );
}

type Errors = Partial<Record<'file' | 'label', string>>;

function AddRxSheet({ patients, onClose, onSaved }: { patients: string[]; onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const [medicine, setMedicine] = useState('');
  const [patientName, setPatientName] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setErrors((x) => ({ ...x, file: undefined }));
    // A sensible name to start from; the customer can change it.
    if (f && !label) setLabel(f.name.replace(/[.][^.]+$/, '').slice(0, 60));
  };

  const save = async () => {
    const found: Errors = {};
    if (!file) found.file = 'Choose a photo or PDF of the prescription.';
    if (!label.trim()) found.label = "Give it a name, like 'Dr. Santos, March'.";
    setErrors(found);
    if (Object.keys(found).length || !file) return;
    setBusy(true);
    setFailure('');
    try {
      const prepared = await prepareForWallet(file);
      await addRx({
        label: label.trim(),
        medicine: medicine.trim() || undefined,
        patientName: patientName.trim() || undefined,
        expiresOn: expiresOn || undefined,
        ...prepared,
      });
      onSaved();
    } catch (e) {
      // Everything typed stays, including the chosen file.
      setFailure((e as Error)?.message || 'Could not save the prescription. Check your connection and try again.');
      setBusy(false);
    }
  };

  return (
    <Sheet title="Add a prescription" onClose={busy ? () => undefined : onClose}>
      <Card>
        <Field id="rx-file" label="Photo or PDF" error={errors.file}>
          <input
            id="rx-file"
            type="file"
            accept="image/*,application/pdf"
            onChange={pick}
            className="mt-1.5 w-full text-[12px] text-gray-600 file:mr-3 file:rounded-full file:border-0 file:bg-[#F1F8FE] file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-[#1D9FDA]"
          />
          {file && <p className="mt-1.5 truncate text-[11.5px] text-green-700">{file.name}</p>}
        </Field>
        <Field id="rx-label" label="Name" error={errors.label}>
          <input
            id="rx-label"
            className={inputClass}
            maxLength={80}
            placeholder="e.g. Dr. Santos, March"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              if (errors.label) setErrors((x) => ({ ...x, label: undefined }));
            }}
          />
        </Field>
        <Field id="rx-medicine" label="Medicine" optional>
          <input id="rx-medicine" className={inputClass} placeholder="e.g. Amlodipine 10 mg" value={medicine} onChange={(e) => setMedicine(e.target.value)} />
        </Field>
        <Field id="rx-patient" label="Patient" optional>
          <input id="rx-patient" className={inputClass} placeholder="Who it is for" value={patientName} onChange={(e) => setPatientName(e.target.value)} />
          {patients.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {patients.map((name, i) => {
                const on = patientName === name;
                return (
                  <button
                    key={`${name}-${i}`}
                    id={`rx-patient-pick-${i}`}
                    type="button"
                    onClick={() => setPatientName(on ? '' : name)}
                    className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium ${on ? 'bg-[#1D9FDA] text-white' : 'bg-[#F1F5F9] text-gray-600'}`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}
        </Field>
        <Field id="rx-expires" label="Valid until" optional>
          <input id="rx-expires" type="date" className={inputClass} value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
        </Field>
      </Card>

      <ErrorNote text={failure} />

      <PrimaryButton onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Save to wallet'}
      </PrimaryButton>
    </Sheet>
  );
}

/**
 * Fetches a wallet file on demand and hands back a blob URL for it, released
 * when the caller unmounts.
 */
function useRxBlob(id: string) {
  const [state, setState] = useState<{ url: string; name: string; type: string } | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const urlRef = useRef('');

  useEffect(() => {
    let live = true;
    setError('');
    getRxFile(id)
      .then((f) => {
        if (!live) return;
        const url = URL.createObjectURL(base64ToFile(f.name, f.type, f.base64));
        urlRef.current = url;
        setState({ url, name: f.name, type: f.type });
      })
      .catch((e) => live && setError(`${(e as Error)?.message || 'Could not load the file.'} Check your connection and try again.`));
    return () => {
      live = false;
    };
  }, [id, attempt]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  return { file: state, error, retry: () => setAttempt((a) => a + 1) };
}

function ViewRxSheet({ doc, onClose, onDeleted }: { doc: RxDoc; onClose: () => void; onDeleted: () => void }) {
  const { file, error, retry } = useRxBlob(doc._id);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const status = rxStatus(doc);

  const remove = async () => {
    setBusy(true);
    setFailure('');
    try {
      await deleteRx(doc._id);
      onDeleted();
    } catch (e) {
      setFailure(`${(e as Error)?.message || 'Could not remove it.'} Check your connection and try again.`);
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <Sheet title={doc.label} onClose={busy ? () => undefined : onClose}>
      {isPdf(doc.fileType) ? (
        <div className="flex items-center gap-3 rounded-[20px] border border-[#EEF1F5] bg-white p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
            <i className="fa-solid fa-file-pdf text-[15px]" />
          </span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-gray-900">{doc.fileName}</span>
          {file ? (
            <a
              id="rx-view-open"
              href={file.url}
              target="_blank"
              rel="noopener"
              download={file.name}
              className="shrink-0 rounded-full bg-[#F1F8FE] px-3.5 py-1.5 text-[12.5px] font-semibold text-[#1D9FDA]"
            >
              Open
            </a>
          ) : (
            !error && <span className="shrink-0 text-[12px] text-gray-400">Loading…</span>
          )}
        </div>
      ) : (
        <div className="flex min-h-[200px] items-center justify-center overflow-hidden rounded-[20px] border border-[#EEF1F5] bg-white">
          {file ? (
            <img src={file.url} alt={`Prescription: ${doc.label}`} className="max-h-[52vh] w-full object-contain" />
          ) : (
            !error && <i className="fa-solid fa-spinner fa-spin text-[18px] text-gray-300" aria-label="Loading" />
          )}
        </div>
      )}
      {error && (
        <div className="space-y-2">
          <ErrorNote text={error} />
          <SmallButton onClick={retry}>Try again</SmallButton>
        </div>
      )}

      <Card>
        <div className="space-y-1.5 px-4 py-3.5 text-[12.5px] text-gray-600">
          {doc.medicine && (
            <p>
              <span className="text-gray-400">Medicine </span>
              {doc.medicine}
            </p>
          )}
          {doc.patientName && (
            <p>
              <span className="text-gray-400">Patient </span>
              {doc.patientName}
            </p>
          )}
          <p className="flex items-center gap-1.5">
            <span className="text-gray-400">Valid until </span>
            {doc.expiresOn ? shortDate(doc.expiresOn) : 'Not set'}
            <RxBadge status={status} />
          </p>
          <p>
            <span className="text-gray-400">Added </span>
            {shortDate(doc.createdAt)}
          </p>
        </div>
      </Card>

      <ErrorNote text={failure} />

      {confirming ? (
        <div className="space-y-3 rounded-[20px] border border-red-100 bg-white p-4">
          <p className="text-[13px] leading-snug text-gray-700">
            Remove <span className="font-semibold">{doc.label}</span> from your wallet? Requests you already sent keep their copy.
          </p>
          <div className="flex gap-2">
            <button
              id="rx-delete-cancel"
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-full bg-[#F1F5F9] py-3 text-[13.5px] font-semibold text-gray-600 disabled:opacity-50"
            >
              Keep
            </button>
            <button
              id="rx-delete-confirm"
              type="button"
              disabled={busy}
              onClick={remove}
              className="flex-1 rounded-full bg-red-600 py-3 text-[13.5px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </div>
      ) : (
        <button id="rx-delete" type="button" onClick={() => setConfirming(true)} className="w-full py-2 text-[13px] font-semibold text-red-500">
          Remove from wallet
        </button>
      )}
    </Sheet>
  );
}

/**
 * The "Use from wallet" picker on the request list. Expired prescriptions
 * show but cannot be chosen. Resolves the pick into a File so the request
 * list attaches it exactly as it would a fresh upload.
 */
export function WalletPicker({
  medicine,
  onPick,
  onClose,
}: {
  medicine: string;
  onPick: (file: File, doc: RxDoc) => void;
  onClose: () => void;
}) {
  const { data, error: loadError, reload } = useAccountData();
  const [loadingId, setLoadingId] = useState('');
  const [failure, setFailure] = useState('');
  const docs = data?.rx ?? [];

  const choose = async (doc: RxDoc) => {
    setLoadingId(doc._id);
    setFailure('');
    try {
      const f = await getRxFile(doc._id);
      onPick(base64ToFile(f.name || doc.fileName, f.type || doc.fileType, f.base64), doc);
    } catch (e) {
      setFailure(`${(e as Error)?.message || 'Could not attach it.'} Check your connection and try again.`);
      setLoadingId('');
    }
  };

  return (
    <Sheet title="Use from wallet" onClose={loadingId ? () => undefined : onClose}>
      <p className="px-1 text-[12px] leading-relaxed text-gray-500">
        Attach a saved prescription for <span className="font-semibold text-gray-700">{medicine}</span>.
      </p>
      {!data ? (
        loadError ? (
          <div className="space-y-2">
            <ErrorNote text={`${loadError} Check your connection and try again.`} />
            <SmallButton onClick={() => reload()}>Try again</SmallButton>
          </div>
        ) : (
          <div className="h-[62px] animate-pulse rounded-[20px] bg-white" aria-busy="true" />
        )
      ) : docs.length === 0 ? (
        <Empty
          icon="fa-file-prescription"
          title="Your wallet is empty"
          text="Upload the prescription on the form and tick Save to my prescription wallet. Next time it is one tap away."
        />
      ) : (
        <Card>
          {docs.map((d) => {
            const status = rxStatus(d);
            const expired = status === 'expired';
            return (
              <button
                key={d._id}
                id={`wallet-pick-${d._id}`}
                type="button"
                disabled={expired || Boolean(loadingId)}
                onClick={() => choose(d)}
                className="flex w-full items-center gap-3 border-t border-[#EEF1F5] px-4 py-3.5 text-left first:border-t-0 disabled:cursor-not-allowed"
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${expired ? 'bg-gray-100 text-gray-400' : 'bg-[#F1F8FE] text-[#1D9FDA]'}`}
                >
                  <i className={`fa-solid ${isPdf(d.fileType) ? 'fa-file-pdf' : 'fa-file-image'} text-[13px]`} />
                </span>
                <span className={`min-w-0 flex-1 ${expired ? 'opacity-60' : ''}`}>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[14px] font-medium text-gray-900">{d.label}</span>
                    <RxBadge status={status} />
                  </span>
                  {describe(d) && <span className="mt-0.5 block text-[12px] leading-snug text-gray-500">{describe(d)}</span>}
                </span>
                {loadingId === d._id ? (
                  <i className="fa-solid fa-spinner fa-spin shrink-0 text-[13px] text-gray-400" aria-label="Attaching" />
                ) : (
                  !expired && <span className="shrink-0 text-[12.5px] font-semibold text-[#1D9FDA]">Use</span>
                )}
              </button>
            );
          })}
        </Card>
      )}
      <ErrorNote text={failure} />
    </Sheet>
  );
}
