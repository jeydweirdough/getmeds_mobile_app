import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from 'react';

/**
 * next/link for the app. Every navigation in the app is a plain page load of index.html (see
 * platform/routes.ts), so a Link is an ordinary <a>; Next-only props are accepted and dropped.
 */
type Href = string | { pathname?: string; query?: Record<string, string>; hash?: string };

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: Href;
  children?: ReactNode;
  prefetch?: boolean | null;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  legacyBehavior?: boolean;
}

function toHref(href: Href): string {
  if (typeof href === 'string') return href;
  const query = href.query ? `?${new URLSearchParams(href.query).toString()}` : '';
  const hash = href.hash ? (href.hash.startsWith('#') ? href.hash : `#${href.hash}`) : '';
  return `${href.pathname || ''}${query}${hash}`;
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, prefetch: _prefetch, replace: _replace, scroll: _scroll, shallow: _shallow, passHref: _passHref, legacyBehavior: _legacy, children, ...rest },
  ref,
) {
  return (
    <a ref={ref} href={toHref(href)} {...rest}>
      {children}
    </a>
  );
});

export default Link;
