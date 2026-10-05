/**
 * accountApi.ts
 * ─────────────────────────────────────────────
 * What a signed-in app customer keeps with Getmeds (backend:
 * app/api/routes/customer.py): details, patients, addresses, saved
 * medicines, refill reminders, saved guides, request history, prescription
 * wallet, reward redemptions and PAP applications.
 *
 * One shared copy lives in this module. useAccountData() hands it to every
 * screen, and the save* functions update it straight away and then the
 * server, so a change shows everywhere at once.
 */
import { useEffect, useState } from 'react';
import { REWARDS_CHANGED_EVENT, authedCall, isSignedIn } from './rewards';
import { translate } from './i18n';

export interface Profile {
  name?: string;
  email?: string;
  phone?: string;
  userType?: string;
  age?: string;
  address?: string;
  contactName?: string;
  contactRelationship?: string;
  position?: string;
  prcLicense?: string;
  institution?: string;
  location?: string;
}

export interface Patient { _key: string; name: string; age?: string; relationship?: string; notes?: string }
export interface Address { _key: string; label: string; address: string; recipient?: string; phone?: string; isDefault?: boolean }
export interface SavedProduct {
  _key: string; name: string; url: string; slug?: string; image?: string; strength?: string; form?: string;
  watchStock?: boolean; notifiedAt?: string | null; savedAt?: string;
}
export interface RefillReminder {
  _key: string; name: string; url?: string; everyDays: number; nextDue: string; patientName?: string; active?: boolean;
}
export interface SavedArticle { _key: string; slug: string; title: string; image?: string }
export interface RequestItem { name: string; url?: string; image?: string; strength?: string; form?: string }
export interface ServerRequest { _id: string; inquiryType: string; items: RequestItem[]; patientName?: string; message?: string; createdAt: string }
export interface RxDoc { _id: string; label: string; medicine?: string; patientName?: string; expiresOn?: string; fileName: string; fileType: string; createdAt: string }
export interface Reward { _id: string; title: string; description?: string; pointsCost: number }
export interface Redemption { _id: string; rewardTitle: string; pointsCost: number; code: string; status: 'requested' | 'applied' | 'cancelled'; note?: string; createdAt: string }
export interface PapApplication {
  _id: string; patientName: string; diagnosis: string; medicine?: string; hospital?: string; doctor?: string;
  status: 'submitted' | 'reviewing' | 'needs_info' | 'approved' | 'declined'; statusNote?: string; createdAt: string;
}

export interface AccountData {
  profile: Profile;
  patients: Patient[];
  addresses: Address[];
  savedProducts: SavedProduct[];
  refillReminders: RefillReminder[];
  savedArticles: SavedArticle[];
  requests: ServerRequest[];
  rx: RxDoc[];
  redemptions: Redemption[];
  pap: PapApplication[];
  rewards: Reward[];
}

export type ListField = 'patients' | 'addresses' | 'savedProducts' | 'refillReminders' | 'savedArticles';

/** Fired on window whenever the shared copy changes. */
export const ACCOUNT_DATA_EVENT = 'getmeds:account-data';

let data: AccountData | null = null;
let loading: Promise<AccountData | null> | null = null;
let lastError = '';

const emit = () => window.dispatchEvent(new CustomEvent(ACCOUNT_DATA_EVENT));

export const newKey = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Fetches (or re-fetches) everything. Null when signed out. */
export function loadAccountData(force = false): Promise<AccountData | null> {
  if (!isSignedIn()) {
    data = null;
    emit();
    return Promise.resolve(null);
  }
  if (data && !force) return Promise.resolve(data);
  if (loading) return loading;
  loading = authedCall<AccountData>('/account/data')
    .then((d) => {
      data = d;
      lastError = '';
      return d;
    })
    .catch((e) => {
      lastError = e?.message || translate('Could not load your account.', 'Hindi ma-load ang account mo.');
      return data;
    })
    .finally(() => {
      loading = null;
      emit();
    });
  return loading;
}

export const accountData = () => data;

/** The shared copy, kept current. `data` is null while loading or signed out. */
export function useAccountData(): { data: AccountData | null; error: string; reload: () => Promise<AccountData | null> } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const onSession = () => {
      data = null;
      loadAccountData(true);
    };
    window.addEventListener(ACCOUNT_DATA_EVENT, bump);
    window.addEventListener(REWARDS_CHANGED_EVENT, onSession);
    loadAccountData();
    return () => {
      window.removeEventListener(ACCOUNT_DATA_EVENT, bump);
      window.removeEventListener(REWARDS_CHANGED_EVENT, onSession);
    };
  }, []);
  return { data, error: lastError, reload: () => loadAccountData(true) };
}

/**
 * Replaces one list. Shows the change at once, then keeps what the server
 * returns (it fills in keys and cleans values). Rolls back on failure and
 * rethrows, so the screen can show the message.
 */
export async function saveList<K extends ListField>(field: K, items: AccountData[K]): Promise<AccountData[K]> {
  const before = data ? data[field] : undefined;
  if (data) {
    data = { ...data, [field]: items };
    emit();
  }
  try {
    const r = await authedCall<{ items: AccountData[K] }>(`/account/list/${field}`, {
      method: 'PUT',
      body: JSON.stringify({ items }),
    });
    if (data) {
      data = { ...data, [field]: r.items };
      emit();
    }
    return r.items;
  } catch (e) {
    if (data && before) {
      data = { ...data, [field]: before };
      emit();
    }
    throw e;
  }
}

/** Saves My details. Resolves with any one-time bonus points given. */
export async function saveProfile(profile: Profile): Promise<number> {
  const r = await authedCall<{ profile: Profile; bonus: number }>('/account/profile', {
    method: 'PUT',
    body: JSON.stringify({ profile }),
  });
  if (data) {
    data = { ...data, profile: r.profile };
    emit();
  }
  if (r.bonus > 0) window.dispatchEvent(new CustomEvent(REWARDS_CHANGED_EVENT));
  return r.bonus;
}

export async function addRx(body: {
  label: string; medicine?: string; patientName?: string; expiresOn?: string; fileName: string; fileType: string; base64: string;
}): Promise<void> {
  await authedCall('/account/rx', { method: 'POST', body: JSON.stringify(body) });
  await loadAccountData(true);
}

/** A wallet prescription as a file payload, ready to attach to a request. */
export const getRxFile = (id: string) =>
  authedCall<{ name: string; type: string; base64: string }>(`/account/rx/${encodeURIComponent(id)}/file`);

export async function deleteRx(id: string): Promise<void> {
  await authedCall(`/account/rx/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (data) {
    data = { ...data, rx: data.rx.filter((r) => r._id !== id) };
    emit();
  }
}

export async function redeemReward(rewardId: string): Promise<{ code: string; balance: number }> {
  const r = await authedCall<{ code: string; balance: number }>('/account/redeem', {
    method: 'POST',
    body: JSON.stringify({ rewardId }),
  });
  window.dispatchEvent(new CustomEvent(REWARDS_CHANGED_EVENT));
  await loadAccountData(true);
  return r;
}

export async function applyPap(body: Record<string, string>): Promise<void> {
  await authedCall('/account/pap', { method: 'POST', body: JSON.stringify(body) });
  await loadAccountData(true);
}

export const exportAccount = () => authedCall<Record<string, unknown>>('/account/export');

export const deleteAccount = () =>
  authedCall<{ ok: boolean }>('/account/delete', { method: 'POST', body: JSON.stringify({ confirm: 'DELETE' }) });

// ── Helpers screens share ────────────────────────────────────────────────────

/** YYYY-MM-DD in Manila, the date the backend's reminders run on. */
export function manilaToday(): string {
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const shortDate = (iso?: string) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-PH', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/** The product slug at the end of a product URL. */
export const slugOf = (url?: string) => (url || '').replace(/\/+$/, '').split('/').pop()?.toLowerCase() || '';
