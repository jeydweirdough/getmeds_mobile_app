/**
 * next/navigation for the app. Each screen is a fresh load of index.html, so the address never
 * changes under a mounted screen and these can read window.location directly.
 */
export function usePathname(): string {
  return typeof window === 'undefined' ? '/' : window.location.pathname;
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
}

export function useRouter() {
  return {
    push: (href: string) => { window.location.href = href; },
    replace: (href: string) => { window.location.replace(href); },
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    refresh: () => window.location.reload(),
    prefetch: () => undefined,
  };
}

export function redirect(href: string): never {
  window.location.replace(href);
  throw new Error(`Redirecting to ${href}`);
}

export function notFound(): never {
  window.location.replace('/');
  throw new Error('Not found');
}
