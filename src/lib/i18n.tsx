import { useSyncExternalStore } from 'react';

/**
 * i18n.tsx
 * ─────────────────────────────────────────────
 * The app's two languages: English and Tagalog.
 *
 * Every piece of UI text sits in the component that shows it, as a pair:
 *
 *     const { tr } = useLang();
 *     <h1>{tr('Your request list', 'Ang iyong request list')}</h1>
 *
 * rather than behind keys in one big dictionary file. With only two languages,
 * the pair beside the markup is what keeps them in step: whoever edits the
 * English sees the Tagalog on the next line and cannot forget it, and there is
 * no key that silently goes stale in a file nobody opens.
 *
 * What is never translated: product, brand and generic names, strengths and
 * forms, and anything else that comes from the catalogue or the Studio. Those
 * are how a medicine is identified on its box and on a prescription, and a
 * translated drug name is a dispensing error waiting to happen.
 *
 * The choice is kept on the phone (localStorage) and is a plain module-level
 * store, so changing it re-renders every mounted screen at once: no reload, no
 * provider to thread through the tree.
 */

export type Lang = 'en' | 'tl';

export const LANGUAGES: { value: Lang; label: string; native: string }[] = [
  { value: 'en', label: 'English', native: 'English' },
  { value: 'tl', label: 'Tagalog', native: 'Tagalog' },
];

const STORAGE_KEY = 'getmeds:lang';

const read = (): Lang => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'tl' ? 'tl' : 'en';
  } catch {
    return 'en';
  }
};

let current: Lang = typeof window === 'undefined' ? 'en' : read();
const listeners = new Set<() => void>();

const applyToDocument = (lang: Lang) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lang === 'tl' ? 'tl' : 'en';
};
applyToDocument(current);

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Blocked storage only means the choice lasts for this session.
  }
  applyToDocument(lang);
  listeners.forEach((fn) => fn());
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

/** Picks the string for the current language. Usable outside React too. */
export const translate = (en: string, tl: string, lang: Lang = current) => (lang === 'tl' ? tl : en);

export function useLang() {
  const lang = useSyncExternalStore(subscribe, getLang, () => 'en' as Lang);
  return {
    lang,
    setLang,
    /** tr('English text', 'Tagalog text') */
    tr: (en: string, tl: string) => (lang === 'tl' ? tl : en),
    /** The locale for dates and numbers. Filipino formatting reads the same for both. */
    locale: 'en-PH',
  };
}
