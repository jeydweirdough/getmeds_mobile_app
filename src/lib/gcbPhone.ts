'use client';

/**
 * gcbPhone.ts
 * ─────────────────────────────────────────────
 * Port of the inline `window.gcbPhone` helper that order-medicines.html shipped
 * alongside the intl-tel-input CDN build. The Vite shell loaded
 *   https://cdn.jsdelivr.net/npm/intl-tel-input@24/build/css/intlTelInput.css
 *   https://cdn.jsdelivr.net/npm/intl-tel-input@24/build/js/intlTelInputWithUtils.min.js
 * synchronously in <head>/<body>. Next.js has no per-page shell, so
 * loadGcbPhone() injects both tags on demand (once) and resolves when the script
 * has loaded — or failed, in which case the digit-only fallback below still
 * produces a submittable E.164 number, exactly as the original did when the CDN
 * was blocked.
 *
 * The helper logic itself is verbatim.
 */

const ITI_CSS = 'https://cdn.jsdelivr.net/npm/intl-tel-input@24/build/css/intlTelInput.css';
const ITI_JS = 'https://cdn.jsdelivr.net/npm/intl-tel-input@24/build/js/intlTelInputWithUtils.min.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    gcbPhone?: {
      init: (input: HTMLInputElement | null) => unknown;
      destroy: (input: HTMLInputElement | null) => void;
      number: (input: HTMLInputElement | null) => string;
      isValid: (input: HTMLInputElement | null) => boolean;
      isEmpty: (input: HTMLInputElement | null) => boolean;
      initAll?: (selector: string) => void;
    };
    intlTelInput?: any;
  }
}

function defineApi() {
  if (typeof window === 'undefined' || window.gcbPhone) return;

  const OPTIONS = {
    initialCountry: 'ph',
    preferredCountries: ['ph', 'in'],
    separateDialCode: true,
    nationalMode: false,
    strictMode: true, // caps typing at the country's real max length
  };
  const DEFAULT_DIAL_CODE = '63'; // match initialCountry

  const instances: Array<{ input: HTMLInputElement; iti: any }> = [];
  function entry(input: HTMLInputElement) {
    for (let i = 0; i < instances.length; i++) if (instances[i].input === input) return instances[i];
    return null;
  }

  // Digits only, trimmed to what the selected country can hold. Covers typing,
  // paste, drag-drop, and switching to a country with a shorter format.
  function enforceDigits(input: HTMLInputElement, iti: any) {
    let digits = input.value.replace(/[^0-9]/g, '');
    const utils = window.intlTelInput && window.intlTelInput.utils;
    if (iti && utils) {
      const iso2 = iti.getSelectedCountryData().iso2;
      while (digits.length > 0 && utils.getValidationError(digits, iso2) === utils.validationError.TOO_LONG) {
        digits = digits.slice(0, -1);
      }
    }
    if (digits !== input.value) input.value = digits;
  }

  // E.164 without the library — the CDN can be blocked or slow, and a lead is
  // not something to drop over a missing script tag.
  function fallbackNumber(raw: unknown) {
    const text = String(raw == null ? '' : raw).trim();
    const digits = text.replace(/\D/g, '');
    if (!digits) return '';
    if (text.charAt(0) === '+') return '+' + digits; // visitor named a country
    if (digits.slice(0, 2) === '00') return '+' + digits.slice(2); // IDD prefix
    if (digits.charAt(0) === '0') return '+' + DEFAULT_DIAL_CODE + digits.slice(1); // trunk prefix
    if (digits.slice(0, DEFAULT_DIAL_CODE.length) === DEFAULT_DIAL_CODE && digits.length > 10) return '+' + digits;
    return '+' + DEFAULT_DIAL_CODE + digits;
  }

  // Idempotent — calling twice returns the existing instance rather than
  // stacking a second widget. React StrictMode double-invokes effects, so
  // this matters here.
  function init(input: HTMLInputElement | null) {
    if (!input) return null;
    const found = entry(input);
    if (found) return found.iti;

    if (!window.intlTelInput) {
      instances.push({ input, iti: null });
      input.addEventListener('input', function () { enforceDigits(input, null); });
      return null;
    }
    const iti = window.intlTelInput(input, OPTIONS);
    instances.push({ input, iti });
    const handler = function () { enforceDigits(input, iti); };
    input.addEventListener('input', handler);
    input.addEventListener('countrychange', handler);
    return iti;
  }

  function initAll(selector: string) {
    const nodes = document.querySelectorAll<HTMLInputElement>(selector);
    for (let i = 0; i < nodes.length; i++) init(nodes[i]);
  }

  // Drops the instance when React unmounts the input, so a remount
  // re-initialises instead of reusing a widget attached to a dead node.
  function destroy(input: HTMLInputElement | null) {
    for (let i = 0; i < instances.length; i++) {
      if (instances[i].input === input) {
        try { if (instances[i].iti) instances[i].iti.destroy(); } catch { /* already gone */ }
        instances.splice(i, 1);
        return;
      }
    }
  }

  function number(input: HTMLInputElement | null) { // the value to SUBMIT
    if (!input || input.value.trim() === '') return '';
    const found = entry(input);
    if (found && found.iti) return found.iti.getNumber() || fallbackNumber(input.value);
    return fallbackNumber(input.value);
  }

  function isValid(input: HTMLInputElement | null) {
    if (!input) return false;
    const found = entry(input);
    if (found && found.iti) return found.iti.isValidNumber();
    const digits = fallbackNumber(input.value).replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15;
  }

  function isEmpty(input: HTMLInputElement | null) { return !input || input.value.trim() === ''; }

  window.gcbPhone = { init, initAll, destroy, number, isValid, isEmpty };
}

let loading: Promise<void> | null = null;

/** Defines window.gcbPhone and loads intl-tel-input (CSS + JS) once. */
export function loadGcbPhone(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  defineApi();
  if (window.intlTelInput) return Promise.resolve();
  if (loading) return loading;

  if (!document.querySelector(`link[href="${ITI_CSS}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = ITI_CSS;
    document.head.appendChild(link);
  }

  loading = new Promise<void>((resolve) => {
    let s = document.querySelector<HTMLScriptElement>(`script[src="${ITI_JS}"]`);
    if (!s) {
      s = document.createElement('script');
      s.src = ITI_JS;
      document.body.appendChild(s);
    }
    s.addEventListener('load', () => resolve());
    // Blocked CDN: the fallback path in gcbPhone still works.
    s.addEventListener('error', () => resolve());
  });
  return loading;
}
