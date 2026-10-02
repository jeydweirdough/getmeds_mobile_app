import { goTo } from './navigation';
import { useLocation } from './router';

/**
 * next/navigation for the app. Screens switch in place (see router.ts), so these follow the
 * router rather than reading window.location once.
 */
export function usePathname(): string {
  return useLocation().pathname;
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams(useLocation().search);
}

export function useRouter() {
  return {
    push: (href: string) => goTo(href),
    replace: (href: string) => goTo(href, { replace: true }),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    refresh: () => window.location.reload(),
    prefetch: () => undefined,
  };
}

export function redirect(href: string): never {
  goTo(href, { replace: true });
  throw new Error(`Redirecting to ${href}`);
}

export function notFound(): never {
  goTo('/', { replace: true });
  throw new Error('Not found');
}
