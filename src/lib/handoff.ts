// Hand-off from a page's prerendered content to the live React page (audit item 07).
//
// Product, condition and category pages are built into their HTML at deploy time
// (scripts/prerender-slugs.cjs), so crawlers that don't run JavaScript still get the content.
// Unlike the blog, those pages can't start from preloaded data — they assemble the whole
// catalogue in the browser — so the first React render is a loading state. Mounting straight
// into #root would swap readable content for that loading state.
//
// mountPage() keeps the baked content on screen, mounts the app into #root out of sight, and
// swaps the two in one step when the page calls markPageReady() (via usePageReady), i.e. once
// its data has rendered. If the page never says so, the swap happens anyway after
// FALLBACK_MS, so a failed fetch can't leave the static copy standing in for the app.
import { useLayoutEffect, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

const FALLBACK_MS = 15000
let baked: HTMLElement | null = null
let appRoot: HTMLElement | null = null

// App Router hand-off (components/PrerenderHandoff.tsx): server-rendered crawler markup
// stays on screen until the page reports ready. A counter rather than a flag, so a wrapper
// can tell a ready signal from its own page apart from one left over by a previous page.
export const PAGE_READY_EVENT = 'getmeds:page-ready'
let readyCount = 0
export function getPageReadyCount(): number {
  return readyCount
}

export function markPageReady(): void {
  readyCount++
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PAGE_READY_EVENT))
  if (!baked || !appRoot) return
  baked.remove()
  appRoot.removeAttribute('style')
  appRoot.removeAttribute('aria-hidden')
  baked = null
  appRoot = null
}

export function mountPage(root: HTMLElement, app: ReactNode): void {
  if (root.childNodes.length > 0) {
    // Move the prerendered nodes out of #root, so React can own it, and keep them in place.
    const holder = document.createElement('div')
    holder.setAttribute('data-prerendered', '')
    while (root.firstChild) holder.appendChild(root.firstChild)
    root.parentNode?.insertBefore(holder, root)
    // Laid out at full width (so the app can measure itself) but invisible and inert.
    root.setAttribute('style', 'position:absolute;top:0;left:0;right:0;visibility:hidden;pointer-events:none')
    root.setAttribute('aria-hidden', 'true')
    baked = holder
    appRoot = root
    window.setTimeout(markPageReady, FALLBACK_MS)
  }
  createRoot(root).render(app)
}

// Called by a page with `true` once it has rendered its real content (or its not-found state).
// A layout effect, so the swap lands in the same frame that content is painted in.
export function usePageReady(ready: boolean): void {
  useLayoutEffect(() => {
    if (ready) markPageReady()
  }, [ready])
}
