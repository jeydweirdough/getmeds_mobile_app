/**
 * offlineInquiry.ts
 * ─────────────────────────────────────────────
 * Keeps an inquiry alive when the connection does not: drafts as the visitor
 * types, and a queue for submissions that could not reach the server.
 *
 * IndexedDB rather than localStorage — the payloads are structured objects,
 * localStorage is synchronous and caps out around 5 MB, and this has to survive
 * the tab closing. No dependency: the wrapper below is smaller than one.
 *
 * Two deliberate limits, both from how the backend actually works:
 *
 *   No files are ever stored. An inquiry can carry a base64 ID or prescription,
 *   and those are health data and government ID under the Data Privacy Act.
 *   Parking them on a phone that may be shared or lost is not a trade worth
 *   making for retry convenience, so a queued inquiry records only that there
 *   *were* attachments and asks for them again.
 *
 *   Retry happens in the page, never in the service worker. The partner form
 *   sends a Cloudflare Turnstile token, and those are single-use and expire in
 *   about five minutes — app/api/routes/inquiry.py answers a stale one with
 *   "Your verification expired". A service worker cannot mint a fresh token, so
 *   Background Sync would silently fail; it also does not exist on iOS.
 */

const DB_NAME = 'getmeds-offline'
const DB_VERSION = 1
import { recordInquiry } from './accountStore'
import { noteSubmitResult, pointsAuthHeader } from './rewards'
import { loadAccountData } from './accountApi'
import { translate } from './i18n'

const QUEUE_STORE = 'inquiry-queue'
const DRAFT_STORE = 'inquiry-drafts'

/** Queued inquiries older than this are discarded unsent. */
export const RETENTION_DAYS = 7

/** Fired on window when an inquiry lands in the queue instead of the server. */
export const INQUIRY_QUEUED_EVENT = 'getmeds:inquiry-queued'

export interface QueuedInquiry {
  id: string
  createdAt: number
  /** The JSON body destined for /api/inquiry/submit, minus any files. */
  payload: Record<string, unknown>
  /** True when the visitor had attached something we deliberately did not keep. */
  hadAttachments: boolean
  /** True when this form carries a Turnstile token, which cannot be replayed. */
  needsVerification: boolean
  /** Where to send the visitor to finish it by hand. */
  returnPath: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(DRAFT_STORE)) db.createObjectStore(DRAFT_STORE)
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

// Private browsing, blocked site data and some in-app browsers make IndexedDB
// throw on open. None of that should break a form that is otherwise working, so
// every entry point below degrades to "no offline support" rather than an error.
const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback)

// ── Drafts ───────────────────────────────────────────────────────────────────

export const saveDraft = (formKey: string, fields: unknown) =>
  safe(tx<void>(DRAFT_STORE, 'readwrite', (s) => s.put({ fields, savedAt: Date.now() }, formKey)), undefined as void)

export const loadDraft = <T = unknown>(formKey: string): Promise<T | null> =>
  safe(
    tx<{ fields: T } | undefined>(DRAFT_STORE, 'readonly', (s) => s.get(formKey)).then((r) => r?.fields ?? null),
    null
  )

export const clearDraft = (formKey: string) =>
  safe(tx<void>(DRAFT_STORE, 'readwrite', (s) => s.delete(formKey)), undefined as void)

// ── Queue ────────────────────────────────────────────────────────────────────

export const listQueued = (): Promise<QueuedInquiry[]> =>
  safe(
    tx<QueuedInquiry[]>(QUEUE_STORE, 'readonly', (s) => s.getAll()).then((all) =>
      (all ?? []).sort((a, b) => a.createdAt - b.createdAt)
    ),
    []
  )

export const deleteQueued = (id: string) =>
  safe(tx<void>(QUEUE_STORE, 'readwrite', (s) => s.delete(id)), undefined as void)

export const clearQueue = () => safe(tx<void>(QUEUE_STORE, 'readwrite', (s) => s.clear()), undefined as void)

/** Drops anything past the retention window. Cheap; call it on page load. */
export async function purgeExpired(): Promise<number> {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000
  const stale = (await listQueued()).filter((q) => q.createdAt < cutoff)
  await Promise.all(stale.map((q) => deleteQueued(q.id)))
  return stale.length
}

// ── Submitting ───────────────────────────────────────────────────────────────

export type SubmitResult =
  // The parsed body comes back because a 200 does not mean everything worked:
  // the endpoint accepts an inquiry it has emailed but failed to append to its
  // Google Sheet, and order-medicines watches for exactly that.
  | { status: 'sent'; body: unknown }
  | { status: 'queued'; hadAttachments: boolean }
  | { status: 'failed'; error: string }

interface SubmitOptions {
  endpoint: string
  /** Path to send the visitor back to when the inquiry needs finishing by hand. */
  returnPath?: string
  /** Overrides the automatic check for a Turnstile token in the payload. */
  needsVerification?: boolean
}

/**
 * Posts an inquiry, falling back to the on-device queue when the network — not
 * the server — is the problem.
 *
 * The distinction matters. A rejection from the API is a real answer: the same
 * body will be rejected again, and queueing it would just resend something the
 * backend already refused, possibly duplicating a Google Sheet row. Only a
 * genuine transport failure gets queued.
 */
/**
 * What was asked for, pulled out of a payload whose shape differs per form.
 * Every inquiry in the app routes through submitInquiry(), so this is the one
 * place that has to know the two shapes in use: a structural item list, which
 * the request list sends, and a single product name from a product page.
 */
function productsIn(payload: Record<string, unknown>): string[] {
  const extra = (payload.additionalData ?? {}) as Record<string, unknown>

  const items = extra.items
  if (Array.isArray(items)) {
    return items
      .map((i) => (i && typeof i === 'object' ? String((i as { name?: unknown }).name ?? '') : String(i ?? '')))
      .map((s) => s.trim())
      .filter(Boolean)
  }

  const single = extra.productName
  if (typeof single === 'string' && single.trim()) return [single.trim()]

  return []
}

export async function submitInquiry(
  rawPayload: Record<string, unknown>,
  { endpoint, returnPath = typeof window !== 'undefined' ? window.location.pathname : '/', needsVerification }: SubmitOptions
): Promise<SubmitResult> {
  const payload = withAppMeta(rawPayload)
  /**
   * The account screen's history is written here rather than in each form,
   * because this is the only door every inquiry goes through — a form added
   * next year gets a history entry without anyone remembering to add one.
   *
   * Awaited rather than fired and forgotten: submitting is usually followed by
   * a success screen or a navigation, and an unawaited write is exactly the
   * kind that loses the race. recordInquiry() swallows its own failures, so
   * waiting on it cannot cost the visitor their inquiry.
   */
  const remember = (status: 'sent' | 'queued') =>
    recordInquiry({
      status,
      inquiryType: typeof payload.inquiryType === 'string' ? payload.inquiryType : undefined,
      products: productsIn(payload),
      message: typeof payload.message === 'string' ? payload.message : undefined,
    })

  const files = payload.files
  const hadAttachments = Array.isArray(files) && files.length > 0
  // Derived from the payload rather than declared per form: a body carrying a
  // Turnstile token is by definition one that cannot be replayed later, and
  // inferring it here means a form that gains a widget tomorrow is handled
  // correctly without anyone remembering to pass a flag.
  const carriesToken = needsVerification ?? Boolean(payload.turnstileToken)

  if (typeof navigator !== 'undefined' && navigator.onLine !== false) {
    try {
      // In the app, a signed-in customer's session rides along so the backend
      // can add their points; see rewards.ts.
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...pointsAuthHeader() },
        body: JSON.stringify(payload),
      })
      if (response.ok) {
        const body = await response.json().catch(() => null)
        noteSubmitResult(body)
        // The request now shows in the signed-in customer's history.
        if (payload.appMeta) loadAccountData(true)
        await remember('sent')
        return { status: 'sent', body }
      }

      let detail = translate('Submission request failed.', 'Hindi naipadala ang request.')
      try {
        detail = (await response.json())?.detail || detail
      } catch {
        /* a non-JSON error body is still an answer from the server */
      }
      return { status: 'failed', error: detail }
    } catch {
      // fetch() only throws for transport failures, which is exactly the case
      // the queue exists for. Fall through.
    }
  }

  const { files: _dropped, ...withoutFiles } = payload
  const entry: QueuedInquiry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    payload: { ...withoutFiles, files: [] },
    hadAttachments,
    needsVerification: carriesToken,
    returnPath,
  }

  try {
    await tx<void>(QUEUE_STORE, 'readwrite', (s) => s.put(entry))
    // The form that called us is about to stop showing a spinner. It must not
    // claim the inquiry was received, so the notice component is told instead.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(INQUIRY_QUEUED_EVENT))
    }
    await remember('queued')
    return { status: 'queued', hadAttachments }
  } catch {
    return { status: 'failed', error: translate('You appear to be offline, and this device could not save the inquiry.', 'Mukhang offline ka, at hindi ma-save ng device na ito ang request.') }
  }
}

/**
 * For a signed-in customer in the app, adds `appMeta`: the items as a list
 * (for request history and Order again) plus anything the form set itself
 * (the patient, the refill reminder it came from). The backend keeps it with
 * the account and never puts it in the sheet or the email.
 */
function withAppMeta(payload: Record<string, unknown>): Record<string, unknown> {
  if (!pointsAuthHeader().Authorization) {
    const { appMeta: _drop, ...rest } = payload
    return rest
  }
  const extra = (payload.additionalData ?? {}) as Record<string, unknown>
  const own = (payload.appMeta ?? {}) as Record<string, unknown>
  let items = own.items as unknown[] | undefined
  if (!items && Array.isArray(extra.items)) {
    items = (extra.items as Array<Record<string, unknown>>).map((i) => ({
      name: String(i?.name ?? ''), url: String(i?.url ?? ''), strength: String(i?.strength ?? ''), form: String(i?.form ?? ''),
    }))
  }
  if (!items && typeof extra.productName === 'string') {
    items = [{ name: extra.productName, url: typeof extra.productUrl === 'string' ? extra.productUrl : (typeof window !== 'undefined' ? window.location.pathname : '/') }]
  }
  return { ...payload, appMeta: { ...own, items: items ?? [] } }
}

/**
 * Sends everything in the queue that can be sent unattended, and reports what
 * still needs the visitor. Entries that carried attachments or a verification
 * challenge are left in place: both need the form, not a background replay.
 */
export async function flushQueue(
  endpoint: string
): Promise<{ sent: number; needsAttention: QueuedInquiry[]; waiting: QueuedInquiry[] }> {
  await purgeExpired()

  // Offline: nothing can be sent, but the visitor should still be told their
  // inquiry is held rather than lost.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const held = await listQueued()
    return {
      sent: 0,
      needsAttention: held.filter((q) => q.hadAttachments || q.needsVerification),
      waiting: held.filter((q) => !q.hadAttachments && !q.needsVerification),
    }
  }

  const queued = await listQueued()
  const needsAttention: QueuedInquiry[] = []
  const waiting: QueuedInquiry[] = []
  let sent = 0

  for (const item of queued) {
    if (item.hadAttachments || item.needsVerification) {
      needsAttention.push(item)
      continue
    }
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...pointsAuthHeader() },
        body: JSON.stringify(item.payload),
      })
      if (response.ok) {
        noteSubmitResult(await response.json().catch(() => null))
        await deleteQueued(item.id)
        sent++
      } else {
        // The server has answered and will answer the same way again; keeping
        // it queued would retry forever.
        await deleteQueued(item.id)
      }
    } catch {
      // Still no usable connection — leave this and everything after it.
      waiting.push(...queued.slice(queued.indexOf(item)).filter((q) => !q.hadAttachments && !q.needsVerification))
      break
    }
  }

  return { sent, needsAttention, waiting }
}
