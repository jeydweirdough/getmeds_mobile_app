import { API_BASE, WORDPRESS_ROOT } from './config';

/**
 * The screens call the backend and WordPress with relative paths ("/api/account/data",
 * "/wp-json/wp/v2/posts"), exactly as they do on the website, where getmeds.ph proxies them.
 * Inside the app those paths would hit the app's own bundled files, so every such request is
 * sent to the real service instead. One rewrite here keeps the copied screens unchanged.
 */
export function toServiceUrl(url: string): string {
  if (url.startsWith('/api/')) return `${API_BASE}${url}`;
  if (url.startsWith('/wp-json/') || url.startsWith('/wp-content/')) return `${WORDPRESS_ROOT}${url}`;
  return url;
}

export function installServiceRouting(): void {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') return nativeFetch(toServiceUrl(input), init);
    if (input instanceof URL && input.origin === window.location.origin) {
      const rewritten = toServiceUrl(input.pathname + input.search);
      return nativeFetch(rewritten === input.pathname + input.search ? input : rewritten, init);
    }
    if (input instanceof Request) {
      const u = new URL(input.url);
      if (u.origin === window.location.origin) {
        const rewritten = toServiceUrl(u.pathname + u.search);
        if (rewritten !== u.pathname + u.search) return nativeFetch(new Request(rewritten, input), init);
      }
    }
    return nativeFetch(input, init);
  };

  // navigator.sendBeacon carries the analytics events when a screen closes.
  if (typeof navigator.sendBeacon === 'function') {
    const nativeBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) =>
      nativeBeacon(typeof url === 'string' ? toServiceUrl(url) : url, data);
  }
}
