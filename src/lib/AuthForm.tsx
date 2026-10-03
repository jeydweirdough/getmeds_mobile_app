'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Turnstile, ensureTurnstileScript, useTurnstile } from './turnstile';
import { RewardsError, logIn, requestResetCode, resetPassword, signUp } from './rewards';

/**
 * AuthForm.tsx
 * ─────────────────────────────────────────────
 * Create account, Log in and Forgot password for the Getmeds app.
 *
 * - Create account: full name, email or mobile number, password -> signed in.
 * - Log in: email or mobile number, and password.
 * - Forgot password: a 6-digit code to the email (or by SMS to the number),
 *   then a new password. The only place a code is used. It is also how
 *   someone from the SMS-code days sets their first password; their points
 *   are kept.
 *
 * Signing in fires REWARDS_CHANGED_EVENT (rewards.ts), which is what every
 * screen waiting on a sign-in listens for, so this form has no onDone of its own.
 */

const BRAND = '#1D9FDA';
const GRADIENT = 'linear-gradient(135deg,#1D9FDA,#61A644)';
const MIN_PASSWORD = 8;
/** Neither SMS (Movider) nor email will send a second code sooner than this. */
const RESEND_SECONDS = 60;

export type AuthMode = 'login' | 'signup' | 'reset';

const message = (e: unknown) => (e instanceof RewardsError ? e.message : 'Something went wrong. Please try again.');

/** Enough to try: an @ with something either side, or at least 10 digits. */
const looksLikeLogin = (v: string) => /\S@\S+\.\S/.test(v.trim()) || v.replace(/\D/g, '').length >= 10;

const field =
  'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-[14px] text-gray-800 outline-none focus:border-[#1D9FDA]';
const label = 'mb-1.5 block text-[12px] font-medium text-gray-500';
const primary = 'mt-4 w-full rounded-full py-3.5 text-[14px] font-semibold text-white disabled:opacity-50';

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        className={`${field} pr-11`}
        type={shown ? 'text' : 'password'}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-gray-400"
      >
        <i className={`fa-solid ${shown ? 'fa-eye-slash' : 'fa-eye'} text-[14px]`} />
      </button>
    </div>
  );
}

function LoginInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <input
      id={id}
      className={field}
      type="text"
      inputMode="email"
      autoComplete="username"
      autoCapitalize="none"
      placeholder="you@email.com or 0917 123 4567"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export default function AuthForm({ initialMode = 'signup', intro }: { initialMode?: AuthMode; intro?: string }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  // Forgot password only: who the account is, then the code and new password.
  const [resetStep, setResetStep] = useState<'start' | 'code'>('start');
  const [login, setLogin] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [via, setVia] = useState<'mobile' | 'email'>('email');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

  // The bot check guards opening accounts and sending reset codes (texts cost
  // money, emails can flood an inbox). Logging in is guarded by the 5-tries lock.
  const needsCheck = mode === 'signup' || (mode === 'reset' && resetStep === 'start');
  const turnstile = useTurnstile(needsCheck);
  useEffect(() => {
    if (needsCheck && turnstile.enabled) ensureTurnstileScript();
  }, [needsCheck, turnstile.enabled]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);

  useEffect(() => {
    if (resetStep === 'code') codeInput.current?.focus();
  }, [resetStep]);

  const switchTo = (next: AuthMode) => {
    setMode(next);
    setResetStep('start');
    setError('');
    setPassword('');
    setConfirm('');
    setCode('');
  };

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    }
    setBusy(false);
  };

  const checkPasswords = () => {
    if (password.length < MIN_PASSWORD) throw new RewardsError(`Use at least ${MIN_PASSWORD} characters for your password.`, 400);
    if (password !== confirm) throw new RewardsError('The two passwords don’t match.', 400);
  };

  const doSignUp = () =>
    run(async () => {
      checkPasswords();
      try {
        await signUp(name.trim(), login, password, turnstile.token);
      } catch (e) {
        turnstile.reset();
        // Already has an account: take them to Log in, with the message.
        if (e instanceof RewardsError && e.status === 409) {
          setMode('login');
          setPassword('');
          setConfirm('');
        }
        throw e;
      }
    });

  const doLogin = () =>
    run(async () => {
      await logIn(login, password);
    });

  const sendResetCode = () =>
    run(async () => {
      try {
        const r = await requestResetCode(login, turnstile.token);
        setTicket(r.ticket);
        setSentTo(r.sentTo);
        setVia(r.via);
        setCode('');
        setPassword('');
        setConfirm('');
        setResetStep('code');
        setWait(RESEND_SECONDS);
      } catch (e) {
        turnstile.reset();
        throw e;
      }
    });

  const doReset = () =>
    run(async () => {
      checkPasswords();
      await resetPassword(ticket, code, password);
    });

  const heading = mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create your account' : 'Reset your password';
  const subtitle =
    mode === 'login'
      ? 'Use the email or mobile number on your account.'
      : mode === 'signup'
        ? intro || 'Earn Getmeds Points on every request.'
        : resetStep === 'start'
          ? 'Enter the email or mobile number on your account and we’ll send you a 6-digit code.'
          : `We ${via === 'mobile' ? 'texted' : 'emailed'} a 6-digit code to ${sentTo}. Enter it below and choose a new password.`;

  return (
    <div>
      <h2 className="pr-10 text-[18px] font-semibold text-gray-900">{heading}</h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-gray-500">{subtitle}</p>

      {/* ── Create account ── */}
      {mode === 'signup' && (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            doSignUp();
          }}
        >
          <label className={label} htmlFor="auth-name">
            Full name
          </label>
          <input
            id="auth-name"
            className={field}
            type="text"
            autoComplete="name"
            placeholder="Juan Dela Cruz"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className={`${label} mt-3`} htmlFor="auth-signup-login">
            Email or mobile number
          </label>
          <LoginInput id="auth-signup-login" value={login} onChange={setLogin} />
          <label className={`${label} mt-3`} htmlFor="auth-new-password">
            Password
          </label>
          <PasswordInput
            id="auth-new-password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder={`At least ${MIN_PASSWORD} characters`}
          />
          <label className={`${label} mt-3`} htmlFor="auth-confirm-password">
            Confirm password
          </label>
          <PasswordInput id="auth-confirm-password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          <Turnstile turnstile={turnstile} className="mt-3 w-full max-w-full overflow-x-auto" />
          {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={
              busy || !name.trim() || !looksLikeLogin(login) || !password || !confirm || (turnstile.enabled && !turnstile.token)
            }
            className={primary}
            style={{ background: GRADIENT }}
          >
            {busy ? 'Creating account…' : 'Create account'}
          </button>
          <p className="mt-4 text-center text-[12.5px] text-gray-500">
            Already have an account?{' '}
            <button type="button" onClick={() => switchTo('login')} className="font-semibold" style={{ color: BRAND }}>
              Log in
            </button>
          </p>
        </form>
      )}

      {/* ── Log in ── */}
      {mode === 'login' && (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            doLogin();
          }}
        >
          <label className={label} htmlFor="auth-login">
            Email or mobile number
          </label>
          <LoginInput id="auth-login" value={login} onChange={setLogin} />
          <div className="mb-1.5 mt-3 flex items-center justify-between">
            <label className="text-[12px] font-medium text-gray-500" htmlFor="auth-password">
              Password
            </label>
            <button type="button" onClick={() => switchTo('reset')} className="text-[12px] font-semibold" style={{ color: BRAND }}>
              Forgot password?
            </button>
          </div>
          <PasswordInput id="auth-password" value={password} onChange={setPassword} autoComplete="current-password" />
          {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={busy || !looksLikeLogin(login) || !password}
            className={primary}
            style={{ background: GRADIENT }}
          >
            {busy ? 'Logging in…' : 'Log in'}
          </button>
          <p className="mt-4 text-center text-[12.5px] text-gray-500">
            New to Getmeds?{' '}
            <button type="button" onClick={() => switchTo('signup')} className="font-semibold" style={{ color: BRAND }}>
              Create an account
            </button>
          </p>
        </form>
      )}

      {/* ── Forgot password: which account ── */}
      {mode === 'reset' && resetStep === 'start' && (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            sendResetCode();
          }}
        >
          <label className={label} htmlFor="auth-reset-login">
            Email or mobile number
          </label>
          <LoginInput id="auth-reset-login" value={login} onChange={setLogin} />
          <Turnstile turnstile={turnstile} className="mt-3 w-full max-w-full overflow-x-auto" />
          {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={busy || !looksLikeLogin(login) || (turnstile.enabled && !turnstile.token)}
            className={primary}
            style={{ background: GRADIENT }}
          >
            {busy ? 'Sending…' : 'Send code'}
          </button>
          <p className="mt-4 text-center text-[12.5px] text-gray-500">
            Remembered it?{' '}
            <button type="button" onClick={() => switchTo('login')} className="font-semibold" style={{ color: BRAND }}>
              Log in
            </button>
          </p>
        </form>
      )}

      {/* ── Forgot password: code + new password ── */}
      {mode === 'reset' && resetStep === 'code' && (
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            doReset();
          }}
        >
          <label className={label} htmlFor="auth-code">
            6-digit code
          </label>
          <input
            id="auth-code"
            ref={codeInput}
            className={`${field} text-center text-[20px] font-semibold tracking-[0.5em]`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <label className={`${label} mt-3`} htmlFor="auth-reset-password">
            New password
          </label>
          <PasswordInput
            id="auth-reset-password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder={`At least ${MIN_PASSWORD} characters`}
          />
          <label className={`${label} mt-3`} htmlFor="auth-reset-confirm">
            Confirm new password
          </label>
          <PasswordInput id="auth-reset-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={busy || code.length !== 6 || !password || !confirm}
            className={primary}
            style={{ background: GRADIENT }}
          >
            {busy ? 'Saving…' : 'Save password and log in'}
          </button>
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setResetStep('start');
                setError('');
              }}
              className="text-[12px] font-semibold text-gray-400"
            >
              {via === 'mobile' ? 'Change number' : 'Change email'}
            </button>
            <button
              type="button"
              disabled={wait > 0}
              onClick={() => {
                // A new code needs a fresh bot check, which lives on the first step.
                setResetStep('start');
                setError('');
              }}
              className="text-[12px] font-semibold disabled:text-gray-300"
              style={wait > 0 ? undefined : { color: BRAND }}
            >
              {wait > 0 ? `Resend in ${wait}s` : 'Send a new code'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
