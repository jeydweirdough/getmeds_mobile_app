import { createClient } from '@sanity/client'
import { createImageUrlBuilder } from '@sanity/image-url'

export const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.VITE_SANITY_PROJECT_ID || 's7ocz8zp',
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || process.env.VITE_SANITY_DATASET || 'production',
  apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || process.env.VITE_SANITY_API_VERSION || '2023-05-03',
  useCdn: true,
})

const builder = createImageUrlBuilder(client)

const WORDPRESS_ROOT = process.env.NEXT_PUBLIC_WORDPRESS_API_ROOT || process.env.VITE_WORDPRESS_API_ROOT || 'https://cms.getmeds.ph'

function toAbsoluteUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/')) return `${WORDPRESS_ROOT}${url}`
  return url
}

function resizeSanityCdnUrl(url: string, width?: number, height?: number, quality = 75): string {
  try {
    const u = new URL(url)
    if (width) u.searchParams.set('w', String(width))
    if (height) u.searchParams.set('h', String(height))
    u.searchParams.set('q', String(quality))
    u.searchParams.set('auto', 'format')
    if (width && height) u.searchParams.set('fit', 'crop')
    return u.toString()
  } catch {
    return url
  }
}

/**
 * Blog LISTING page only (blog.tsx) — shrinks a blog cover image (Sanity CDN
 * or external/WordPress URL) to the given size instead of loading it full-res.
 * Do not use this on the blog detail page; use urlFor() there instead.
 */
export function getBlogListingImageUrl(url: string | undefined | null, width?: number, height?: number, quality = 75): string {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return url || ''
  if (url.includes('cdn.sanity.io')) return resizeSanityCdnUrl(url, width, height, quality)
  if (!width && !height) return url

  const absolute = toAbsoluteUrl(url)
  const params = new URLSearchParams()
  params.set('url', absolute)
  if (width) params.set('w', String(width))
  if (height) params.set('h', String(height))
  params.set('q', String(quality))
  params.set('output', 'webp')
  if (width && height) params.set('fit', 'cover')
  return `https://wsrv.nl/?${params.toString()}`
}

/**
 * Given a resolved image URL, returns a small/compressed version of the same asset for use as a
 * low-res placeholder (progressive loading — shown as-is, no artificial blur). Only works for
 * Sanity CDN URLs — returns the input unchanged for local/static fallback paths, since those
 * have no server-side resize endpoint.
 */
export function getLowResUrl(url: string, width = 100, quality = 30): string {
  if (!url || !url.includes('cdn.sanity.io')) return url
  try {
    const u = new URL(url)
    u.searchParams.set('w', String(width))
    u.searchParams.set('q', String(quality))
    u.searchParams.delete('blur')
    return u.toString()
  } catch (err) {
    console.error('Error generating low-res URL:', err)
    return url
  }
}

export function urlFor(source: any) {
  if (typeof source === 'string' && (source.startsWith('http') || source.startsWith('/'))) {
    return {
      width: () => ({
        height: () => ({ url: () => source }),
        url: () => source
      }),
      height: () => ({
        width: () => ({ url: () => source }),
        url: () => source
      }),
      url: () => source
    } as any;
  }
  if (source && typeof source === 'object' && 'url' in source) {
    const urlStr = source.url;
    return {
      width: () => ({
        height: () => ({ url: () => urlStr }),
        url: () => urlStr
      }),
      height: () => ({
        width: () => ({ url: () => urlStr }),
        url: () => urlStr
      }),
      url: () => urlStr
    } as any;
  }
  return builder.image(source).auto('format').quality(60).fit('max')
}
