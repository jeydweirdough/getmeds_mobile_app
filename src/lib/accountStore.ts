import { hasConsent } from './cart'

/**
 * accountStore.ts
 * ─────────────────────────────────────────────
 * Everything the account screen shows, held on the device that produced it.
 *
 * Two things live here, and they are together because they share a lifetime
 * and a consent decision, not because they are the same kind of data:
 *
 *   inquiries   what was asked for and when — the history that replaces the
 *               marketplace template's fake "My Purchases".
 *   details     the answers to the long inquiry form, so it can be filled in
 *               once rather than every time.
 *
 * A third — stored prescriptions and IDs — has been removed; see
 * purgeDocuments() for what happens to any that were already saved.
 *
 * ── Why the device and not the server ──
 * /api/inquiry/submit is submit-only: there is no endpoint that reads a
 * person's inquiries back, so a server-backed history would need backend work
 * that does not exist yet. Recording locally as each inquiry is sent gives a
 * real history today and keeps working offline, which matters here more than
 * usual — the queue in offlineInquiry.ts exists precisely because these
 * submissions are often made on a bad connection.
 *
 * The cost is honest and worth stating in the UI: this history is per-device.
 * It does not follow anyone to a second phone.
 *
 * ── Why its own database ──
 * offlineInquiry.ts owns 'getmeds-offline' and cart.ts owns 'getmeds-cart',
 * both at version 1. Adding stores to either would mean a version bump that
 * every module touching it must agree on, and a page loading only one of them
 * would block the other's open() forever. A third database has no such
 * coupling.
 *
 * ── Consent ──
 * Gated on the same permission the request list already asks for. What someone
 * has requested is health information about them, and it would be incoherent
 * to guard a saved shopping list more carefully than a record of the
 * medicines they have asked to buy.
 */

const DB_NAME = 'getmeds-account'
const DB_VERSION = 1
const INQUIRIES = 'inquiries'
const PROFILE = 'profile'
const DOCUMENTS = 'documents'
const DETAILS_KEY = 'details'

/** Fired on window whenever anything in here changes. */
export const ACCOUNT_CHANGED_EVENT = 'getmeds:account-changed'

export interface InquiryRecord {
  id: string
  submittedAt: number
  /** 'sent' reached the server; 'queued' is waiting for a connection. */
  status: 'sent' | 'queued'
  /** Which audience sheet it was routed to, as the form decided. */
  inquiryType?: string
  /** Product names asked about, when the form carried any. */
  products: string[]
  message?: string
}

export interface SavedDetails {
  name?: string
  /**
   * Data URL, downscaled before it gets here. Kept alongside the rest of the
   * details rather than only in the `getmeds_user` localStorage entry, so a
   * visitor who has not signed in can still have one — and so saving a name
   * never has to invent a session that does not exist.
   */
  avatar?: string
  email?: string
  phone?: string
  age?: string
  address?: string
  contactName?: string
  contactRelationship?: string
  /**
   * Which of the four audiences this person is — see lib/audienceTypes.ts.
   *
   * Worth storing on its own because it decides two things at once: which
   * extra fields are even asked for below, and which spreadsheet an inquiry
   * lands in. Knowing it in advance is what lets the request list skip its
   * "who is asking?" step entirely for someone who has answered once.
   */
  userType?: string
  /** The audience-specific columns. Which of these apply depends on userType. */
  position?: string
  prcLicense?: string
  institution?: string
  location?: string
  savedAt?: number
}


function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(INQUIRIES)) db.createObjectStore(INQUIRIES, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(PROFILE)) db.createObjectStore(PROFILE)
      if (!db.objectStoreNames.contains(DOCUMENTS)) db.createObjectStore(DOCUMENTS, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(store, mode).objectStore(store))
        request.onsuccess = () => resolve(request.result as T)
        request.onerror = () => reject(request.error)
      })
  )
}

/** Nothing in an account screen is worth throwing a page away for. */
const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback)

const announce = () => {
  try {
    window.dispatchEvent(new CustomEvent(ACCOUNT_CHANGED_EVENT))
  } catch { /* not a browser */ }
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

// ── Inquiry history ──────────────────────────────────────────────────────────

export const listInquiries = (): Promise<InquiryRecord[]> =>
  safe(
    tx<InquiryRecord[]>(INQUIRIES, 'readonly', (s) => s.getAll()).then((all) =>
      (all ?? []).sort((a, b) => b.submittedAt - a.submittedAt)
    ),
    []
  )

/**
 * Called by submitInquiry() for every submission, successful or queued — one
 * integration point, so no form can start sending inquiries that never appear
 * in the history.
 */
export async function recordInquiry(record: Omit<InquiryRecord, 'id' | 'submittedAt'> & { id?: string }): Promise<void> {
  if (!(await hasConsent())) return
  try {
    await tx<void>(INQUIRIES, 'readwrite', (s) =>
      s.put({ ...record, id: record.id || newId(), submittedAt: Date.now() })
    )
    announce()
  } catch {
    // A history that cannot be written must never stop an inquiry being sent.
  }
}

export async function deleteInquiry(id: string): Promise<void> {
  await safe(tx<void>(INQUIRIES, 'readwrite', (s) => s.delete(id)), undefined as void)
  announce()
}

// ── Saved details ────────────────────────────────────────────────────────────

export const loadDetails = (): Promise<SavedDetails | null> =>
  safe(tx<SavedDetails | undefined>(PROFILE, 'readonly', (s) => s.get(DETAILS_KEY)).then((d) => d ?? null), null)

export async function saveDetails(details: SavedDetails): Promise<boolean> {
  if (!(await hasConsent())) return false
  try {
    await tx<void>(PROFILE, 'readwrite', (s) => s.put({ ...details, savedAt: Date.now() }, DETAILS_KEY))
    announce()
    return true
  } catch {
    return false
  }
}

export async function clearDetails(): Promise<void> {
  await safe(tx<void>(PROFILE, 'readwrite', (s) => s.delete(DETAILS_KEY)), undefined as void)
  announce()
}

// ── Documents ────────────────────────────────────────────────────────────────

/**
 * Erases any documents left over from when the account screen could store a
 * prescription and an ID.
 *
 * The feature is gone, and this is what has to happen when a feature that held
 * personal files is removed: leaving them behind would mean prescriptions and
 * photographed IDs sitting on people's phones with no screen left that could
 * show or delete them. Since nothing writes to this store any more, the purge
 * runs once, finds nothing on every later visit, and costs nothing.
 *
 * The object store itself stays in the schema on purpose. Dropping it would
 * need a database version bump, and a browser that had already opened version
 * 1 would keep the old store anyway — so removing it from the upgrade path
 * would only break clearAccountData() for people who never had one.
 */
export async function purgeDocuments(): Promise<void> {
  await safe(tx<void>(DOCUMENTS, 'readwrite', (s) => s.clear()), undefined as void)
}

/**
 * Erases everything this module holds. Called by cart.ts's
 * clearAllDeviceData(), so "clear saved data on this device" means all of it
 * rather than only the request list — a withdrawal of consent that left the
 * inquiry history behind would be no withdrawal at all.
 */
export async function clearAccountData(): Promise<void> {
  await safe(tx<void>(INQUIRIES, 'readwrite', (s) => s.clear()), undefined as void)
  await safe(tx<void>(PROFILE, 'readwrite', (s) => s.clear()), undefined as void)
  await safe(tx<void>(DOCUMENTS, 'readwrite', (s) => s.clear()), undefined as void)
  announce()
}
