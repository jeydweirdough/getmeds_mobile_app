/**
 * rewards.ts
 * ─────────────────────────────────────────────
 * Getmeds points, for the installed app only.
 *
 * A customer signs up with their full name, an email or mobile number, and a
 * password, then logs in with that email or number and the password. A code
 * (by email or SMS) is only used for "Forgot password". The backend (app/api/routes/account.py) keeps the account
 * and its points in Sanity and hands back a session token, kept here in
 * localStorage.
 *
 * Every inquiry sent from the app carries that token, and the backend adds
 * the points for it — see submitInquiry() in offlineInquiry.ts. The website
 * never sends it: points are an app feature, so isAppMode() gates both the
 * sign-in card and the header.
 */
import { isAppMode } from './cart';

const SESSION_KEY = 'getmeds_points_session';
const PENDING_REFERRAL_KEY = 'getmeds_pending_referral';

/** Fired on window when the session or the balance changes. */
export const REWARDS_CHANGED_EVENT = 'getmeds:rewards-changed';

// Relative, as in the original: next.config.ts rewrites /api/:path* to the
// admin backend, so the calls stay same-origin (no CORS) in every environment.
const apiBase = (): string => '/api';

export interface PointsAccount {
  /** Masked, e.g. "+63 917 *** 4567". Empty for accounts opened with an email. */
  mobile: string;
  /** What they sign in with, masked: "+63 917 *** 4567" or "j***z@gmail.com". */
  login?: string;
  name: string;
  pointsBalance: number;
  memberSince?: string;
  /** This customer's own code to share. */
  referralCode: string;
}

export interface ReferralStatus {
  enabled: boolean;
  referrerPoints: number;
  refereePoints: number;
  friendsJoined: number;
  /** A friend's code can still be added (only before the first request). */
  canEnterCode: boolean;
  codeAdded: boolean;
  /** Code added, welcome points not yet paid (they come with the first request). */
  welcomePending: boolean;
}

export interface PointsHistoryItem {
  points: number;
  reason: string;
  date?: string;
}

export interface PointsSummary {
  account: PointsAccount;
  history: PointsHistoryItem[];
  /** 0 when points are switched off in the Studio. */
  pointsPerRequest: number;
  /** One-time bonuses, 0 when off. */
  bonuses?: { profile: number; refill: number };
  referral: ReferralStatus;
}

export class RewardsError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

const readSession = (): string | null => {
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
};

const changed = () => window.dispatchEvent(new CustomEvent(REWARDS_CHANGED_EVENT));

export const isSignedIn = (): boolean => Boolean(readSession());

export function signOut(): void {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage blocked — nothing was stored either */
  }
  changed();
}

/**
 * The header an inquiry needs to earn points, or nothing. Empty outside the
 * app, so a website submission never earns even if a token is lying around.
 */
export function pointsAuthHeader(): Record<string, string> {
  if (!isAppMode()) return {};
  const token = readSession();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Called with the inquiry endpoint's response. The backend answers with
 * `points: {points, balance}` when it credited the request; the account
 * screen listens for the event to refresh its balance.
 */
export function noteSubmitResult(body: unknown): number {
  const points = (body as { points?: { points?: number } } | null)?.points?.points ?? 0;
  if (points > 0) changed();
  return points;
}

export async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
  } catch {
    throw new RewardsError('You appear to be offline. Try again once you are connected.', 0);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof body?.detail === 'string' ? body.detail : 'Something went wrong. Please try again.';
    throw new RewardsError(detail, response.status);
  }
  return body as T;
}

export interface CodeTicket {
  ticket: string;
  /** Masked number or email the code went to. */
  sentTo: string;
  /** 'mobile' when it went by SMS, 'email' when by email. */
  via: 'mobile' | 'email';
  expiresIn: number;
}

/**
 * "Forgot password": sends a 6-digit code to the account's email or mobile
 * number (by SMS). Returns the ticket to send back with the code.
 */
export const requestResetCode = (login: string, turnstileToken: string) =>
  call<CodeTicket>('/account/code/request', {
    method: 'POST',
    body: JSON.stringify({ login, purpose: 'reset', turnstileToken }),
  });

function keepSession(result: { token: string; account: PointsAccount }): PointsAccount {
  try {
    window.localStorage.setItem(SESSION_KEY, result.token);
  } catch {
    throw new RewardsError('This phone is blocking storage, so it cannot stay signed in.', 0);
  }
  changed();
  return result.account;
}

/** Full name, email or mobile number, and password: opens the account and signs in. */
export async function signUp(name: string, login: string, password: string, turnstileToken: string): Promise<PointsAccount> {
  return keepSession(
    await call<{ token: string; account: PointsAccount }>('/account/signup', {
      method: 'POST',
      body: JSON.stringify({ name, login, password, turnstileToken }),
    })
  );
}

/** Email or mobile number, and password. */
export async function logIn(login: string, password: string): Promise<PointsAccount> {
  return keepSession(
    await call<{ token: string; account: PointsAccount }>('/account/login', {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    })
  );
}

/** Sets a new password with the code from "Forgot password", signs in, and signs out every other device. */
export async function resetPassword(ticket: string, code: string, password: string): Promise<PointsAccount> {
  return keepSession(
    await call<{ token: string; account: PointsAccount }>('/account/password/reset', {
      method: 'POST',
      body: JSON.stringify({ ticket, code, password }),
    })
  );
}

/** Balance and history. Signs out when the backend no longer accepts the session. */
export async function fetchSummary(): Promise<PointsSummary | null> {
  const token = readSession();
  if (!token) return null;
  try {
    return await call<PointsSummary>('/account/me', { headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    if (e instanceof RewardsError && e.status === 401) signOut();
    throw e;
  }
}

/** Adds a friend's code. Points for both come with this customer's first request. */
export async function applyReferral(code: string): Promise<{ refereePoints: number }> {
  const token = readSession();
  const result = await call<{ refereePoints: number }>('/account/referral', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify({ code }),
  });
  forgetPendingReferral();
  changed();
  return result;
}

/**
 * Invite links look like getmeds.ph/profile?ref=GMXXXXXX. The code is kept
 * until the customer signs in and can use it, which may be after installing
 * the app from the link. The app shares storage with the browser it was
 * installed from on Android, so the code survives the install there.
 */
export function captureReferralFromUrl(): void {
  try {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref && /^[A-Za-z0-9-]{4,16}$/.test(ref)) window.localStorage.setItem(PENDING_REFERRAL_KEY, ref.toUpperCase());
  } catch {
    /* storage blocked — the code can still be typed in */
  }
}

export const pendingReferral = (): string => {
  try {
    return window.localStorage.getItem(PENDING_REFERRAL_KEY) || '';
  } catch {
    return '';
  }
};

function forgetPendingReferral(): void {
  try {
    window.localStorage.removeItem(PENDING_REFERRAL_KEY);
  } catch {
    /* nothing stored */
  }
}

export const inviteLink = (code: string) => `https://getmeds.ph/profile?ref=${encodeURIComponent(code)}`;

/** A call to an /api/account endpoint as the signed-in customer. Signs out on 401. */
export async function authedCall<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = readSession();
  if (!token) throw new RewardsError('Please sign in first.', 401);
  try {
    return await call<T>(path, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  } catch (e) {
    if (e instanceof RewardsError && e.status === 401) signOut();
    throw e;
  }
}
