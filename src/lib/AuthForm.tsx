'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Turnstile, ensureTurnstileScript, useTurnstile } from './turnstile';
import { RewardsError, logIn, requestResetCode, resetPassword, signUp } from './rewards';
import { translate, useLang } from '@/lib/i18n';

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
 *
 * `screen` lays it out as a full page (inside SignInSheet): the heading sits on
 * a photo tinted brand blue, and the form in a white card overlapping it.
 */

const BRAND = '#1D9FDA';
const HERO = '/assets/onboarding/hero.webp';
// Brand blue over the photo: strong enough for white text, light enough to see the people.
const TINT = 'linear-gradient(180deg, rgba(29,159,218,.80) 0%, rgba(29,159,218,.88) 100%)';
const MIN_PASSWORD = 8;
/** Neither SMS (Movider) nor email will send a second code sooner than this. */
const RESEND_SECONDS = 60;

export type AuthMode = 'login' | 'signup' | 'reset';

const message = (e: unknown) =>
  e instanceof RewardsError ? e.message : translate('Something went wrong. Please try again.', 'May nangyaring mali. Pakisubukan ulit.');

/** Enough to try: an @ with something either side, or at least 10 digits. */
const looksLikeLogin = (v: string) => /\S@\S+\.\S/.test(v.trim()) || v.replace(/\D/g, '').length >= 10;

const field =
  'w-full rounded-xl border border-transparent bg-[#F3F6F9] px-3.5 py-3 text-[14px] text-gray-800 outline-none placeholder:text-gray-400 focus:border-[#1D9FDA] focus:bg-white';
const label = 'mb-1.5 block text-[12.5px] font-medium text-gray-800';
const primary = 'mt-5 w-full rounded-full py-3.5 text-[14px] font-semibold text-white disabled:opacity-50';

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
  const { tr } = useLang();
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
        aria-label={shown ? tr('Hide password', 'Itago ang password') : tr('Show password', 'Ipakita ang password')}
        className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-gray-400"
      >
        <i className={`fa-solid ${shown ? 'fa-eye-slash' : 'fa-eye'} text-[14px]`} />
      </button>
    </div>
  );
}

function LoginInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const { tr } = useLang();
  return (
    <input
      id={id}
      className={field}
      type="text"
      inputMode="email"
      autoComplete="username"
      autoCapitalize="none"
      placeholder={tr('you@email.com or 0917 123 4567', 'you@email.com o 0917 123 4567')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export default function AuthForm({
  initialMode = 'signup',
  intro,
  screen = false,
  onGuest,
}: {
  initialMode?: AuthMode;
  intro?: string;
  /** Full-page layout: heading on a tinted photo, form in a card below it. */
  screen?: boolean;
  /** Adds "Continue as guest" under Log in, for when signing in is optional (onboarding). */
  onGuest?: () => void;
}) {
  const { tr } = useLang();
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
    if (password.length < MIN_PASSWORD) throw new RewardsError(
        tr(`Use at least ${MIN_PASSWORD} characters for your password.`, `Gumamit ng hindi bababa sa ${MIN_PASSWORD} characters para sa password mo.`),
        400,
      );
    if (password !== confirm) throw new RewardsError(tr('The two passwords don’t match.', 'Hindi magkapareho ang dalawang password.'), 400);
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

  const heading =
    mode === 'login'
      ? tr('Log in', 'Mag-log in')
      : mode === 'signup'
        ? tr('Create your account', 'Gumawa ng account')
        : tr('Reset your password', 'I-reset ang password mo');
  const subtitle =
    mode === 'login'
      ? tr('Use the email or mobile number on your account.', 'Gamitin ang email o mobile number ng account mo.')
      : mode === 'signup'
        ? intro || tr('Earn Getmeds Points on every request.', 'Kumita ng Getmeds Points sa bawat request.')
        : resetStep === 'start'
          ? tr(
              'Enter the email or mobile number on your account and we’ll send you a 6-digit code.',
              'Ilagay ang email o mobile number ng account mo at padadalhan ka namin ng 6-digit code.',
            )
          : tr(
              `We ${via === 'mobile' ? 'texted' : 'emailed'} a 6-digit code to ${sentTo}. Enter it below and choose a new password.`,
              `Nagpadala kami ng 6-digit code ${via === 'mobile' ? 'sa text' : 'sa email'} sa ${sentTo}. Ilagay ito sa ibaba at pumili ng bagong password.`,
            );

  const view = mode === 'reset' ? `reset-${resetStep}` : mode;

  const forms = (
    <>
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
            {tr('Full name', 'Buong pangalan')}
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
            {tr('Email or mobile number', 'Email o mobile number')}
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
            placeholder={tr(`At least ${MIN_PASSWORD} characters`, `Hindi bababa sa ${MIN_PASSWORD} characters`)}
          />
          <label className={`${label} mt-3`} htmlFor="auth-confirm-password">
            {tr('Confirm password', 'Kumpirmahin ang password')}
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
            style={{ background: BRAND }}
          >
            {busy ? tr('Creating account…', 'Ginagawa ang account…') : tr('Create account', 'Gumawa ng account')}
          </button>
          <p className="mt-4 text-center text-[12.5px] text-gray-500">
            {tr('Already have an account?', 'May account ka na?')}{' '}
            <button type="button" onClick={() => switchTo('login')} className="font-semibold" style={{ color: BRAND }}>
              {tr('Log in', 'Mag-log in')}
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
            {tr('Email or mobile number', 'Email o mobile number')}
          </label>
          <LoginInput id="auth-login" value={login} onChange={setLogin} />
          <label className={`${label} mt-3`} htmlFor="auth-password">
            Password
          </label>
          <PasswordInput id="auth-password" value={password} onChange={setPassword} autoComplete="current-password" />
          <div className="mt-2 text-right">
            <button type="button" onClick={() => switchTo('reset')} className="text-[12px] font-semibold" style={{ color: BRAND }}>
              {tr('Forgot password?', 'Nakalimutan ang password?')}
            </button>
          </div>
          {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={busy || !looksLikeLogin(login) || !password}
            className={primary}
            style={{ background: BRAND }}
          >
            {busy ? tr('Logging in…', 'Nagla-log in…') : tr('Log in', 'Mag-log in')}
          </button>
          {onGuest && (
            <button
              type="button"
              onClick={onGuest}
              className="mt-3 w-full rounded-full border-[1.5px] py-3.5 text-[14px] font-semibold"
              style={{ borderColor: BRAND, color: BRAND }}
            >
              {tr('Continue as guest', 'Magpatuloy bilang guest')}
            </button>
          )}
          <p className="mt-4 text-center text-[12.5px] text-gray-500">
            {tr('New to Getmeds?', 'Bago sa Getmeds?')}{' '}
            <button type="button" onClick={() => switchTo('signup')} className="font-semibold" style={{ color: BRAND }}>
              {tr('Create an account', 'Gumawa ng account')}
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
            {tr('Email or mobile number', 'Email o mobile number')}
          </label>
          <LoginInput id="auth-reset-login" value={login} onChange={setLogin} />
          <Turnstile turnstile={turnstile} className="mt-3 w-full max-w-full overflow-x-auto" />
          {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={busy || !looksLikeLogin(login) || (turnstile.enabled && !turnstile.token)}
            className={primary}
            style={{ background: BRAND }}
          >
            {busy ? tr('Sending…', 'Ipinapadala…') : tr('Send code', 'Ipadala ang code')}
          </button>
          <p className="mt-4 text-center text-[12.5px] text-gray-500">
            {tr('Remembered it?', 'Naalala mo na?')}{' '}
            <button type="button" onClick={() => switchTo('login')} className="font-semibold" style={{ color: BRAND }}>
              {tr('Log in', 'Mag-log in')}
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
            {tr('6-digit code', '6-digit code')}
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
            {tr('New password', 'Bagong password')}
          </label>
          <PasswordInput
            id="auth-reset-password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            placeholder={tr(`At least ${MIN_PASSWORD} characters`, `Hindi bababa sa ${MIN_PASSWORD} characters`)}
          />
          <label className={`${label} mt-3`} htmlFor="auth-reset-confirm">
            {tr('Confirm new password', 'Kumpirmahin ang bagong password')}
          </label>
          <PasswordInput id="auth-reset-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={busy || code.length !== 6 || !password || !confirm}
            className={primary}
            style={{ background: BRAND }}
          >
            {busy ? tr('Saving…', 'Sine-save…') : tr('Save password and log in', 'I-save ang password at mag-log in')}
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
              {via === 'mobile' ? tr('Change number', 'Palitan ang number') : tr('Change email', 'Palitan ang email')}
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
              {wait > 0 ? tr(`Resend in ${wait}s`, `Ipadala ulit sa ${wait}s`) : tr('Send a new code', 'Magpadala ng bagong code')}
            </button>
          </div>
        </form>
      )}
    </>
  );

  if (!screen) {
    return (
      <div>
        <h2 className="pr-10 text-[18px] font-semibold text-gray-900">{heading}</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-gray-500">{subtitle}</p>
        {forms}
      </div>
    );
  }

  return (
    <div className="pb-6">
      <header
        className="relative flex flex-col justify-center overflow-hidden px-8 text-center"
        style={{ minHeight: '50vh', paddingTop: 'calc(56px + var(--gm-safe-top))', paddingBottom: 92 }}
      >
        <img
          src={HERO}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: 'center 30%' }}
          draggable={false}
        />
        <div aria-hidden="true" className="absolute inset-0" style={{ background: TINT }} />
        {/* Keyed on the form shown, so switching replays the ease-in. */}
        <div key={view} className="gm-auth-in relative">
          <h2 className="text-[24px] font-semibold leading-tight text-white">{heading}</h2>
          <p className="mx-auto mt-2 max-w-[300px] text-[12.5px] leading-relaxed text-white/85">{subtitle}</p>
        </div>
      </header>
      <div
        className="relative mx-4 -mt-16 rounded-[24px] bg-white px-5 pb-6 pt-2"
        style={{ boxShadow: '0 4px 14px rgba(23,43,77,.05)' }}
      >
        <div key={view} className="gm-auth-in-late">
          {mode === 'login' && (
            <img src="/assets/getmeds-logo-sm.png" alt="Getmeds" className="mx-auto mt-5 h-[60px] w-auto" draggable={false} />
          )}
          {forms}
        </div>
      </div>
    </div>
  );
}
