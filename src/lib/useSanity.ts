'use client';

/**
 * useSanity.ts
 * ─────────────────────────────────────────────
 * Drop-in React hooks for every page + shared data.
 *
 * Usage:
 *   const { data, loading, error } = useHomePage()
 *   const { data: products, loading } = useProducts()
 *
 * Each hook returns:
 *   data    — typed result (null until loaded)
 *   loading — boolean
 *   error   — Error | null
 */

import { useState, useEffect } from 'react'
import { readPreload } from './preload'
import {
  getHomePage,
  getAboutPage,
  getCareersPage,
  getContactPage,
  getCsrPage,
  getGlobalPresencePage,
  getMeditationsPage,
  getOrderMedicinesPage,
  getPapPage,
  getProductsPage,
  getServicesPage,
  getUngcPage,
  getProducts,
  getProductBySlug,
  getProductsByCategory,
  searchProducts,
  getCategories,
  getCategoryBySlug,
  getFAQs,
  getHomepageFAQs,
  searchFAQs,
  getServices,
  getTeamMembers,
  getTestimonials,
  getCountries,
  getCsrPrograms,
  getSiteSettings,
  getNavigation,
  getPageAssets,
  getPageAssetsByPage,
  getHeroSlides,
  getCategoryImages,
  type CategoryImageLink,
  getNews,
  BLOG_PAGE_SIZE,
  getNewsById,
  getNewsBySlug,
  getNewsPage,
  getNewsCategories,
  getFeaturedNews,
} from './queries'

import { urlFor, getLowResUrl } from './sanity'
import { computeCategoryKey, linkCategoryKeys } from './categoryImageKey'

import type {
  Product,
  Category,
  FAQ,
  Service,
  TeamMember,
  Testimonial,
  CountryPresence,
  CsrProgram,
  Navigation,
  SiteSettings,
  HomePage,
  AboutPage,
  CareersPage,
  ContactPage,
  CsrPage,
  GlobalPresencePage,
  MeditationsPage,
  OrderMedicinesPage,
  PapPage,
  ProductsPage,
  ServicesPage,
  UngcPage,
  PageAsset,
  News,
} from '../types/sanity'

// ─────────────────────────────────────────────
// Generic fetch hook
// ─────────────────────────────────────────────

function useFetch<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetcher()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { data, loading, error }
}

// Variant that re-runs when a param changes
// `preloaded` returns data the build baked into the page for this param (see ./preload), which
// then stands in for the fetch — including on the very first render.
function useFetchWithParam<T, P>(fetcher: (param: P) => Promise<T>, param: P, preloaded?: (param: P) => T | undefined) {
  const [data, setData] = useState<T | null>(() => (param && preloaded ? preloaded(param) ?? null : null))
  const [loading, setLoading] = useState(() => !(param && preloaded && preloaded(param) !== undefined))
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!param) return
    const seeded = preloaded ? preloaded(param) : undefined
    if (seeded !== undefined) {
      setData(seeded)
      setLoading(false)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    fetcher(param)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [String(param)])

  return { data, loading, error }
}

// ─────────────────────────────────────────────
// Site-wide
// ─────────────────────────────────────────────

export function useSiteSettings() {
  return useFetch<SiteSettings>(getSiteSettings)
}

export function useNavigation() {
  return useFetch<Navigation>(getNavigation)
}

// ─────────────────────────────────────────────
// Pages
// ─────────────────────────────────────────────

export function useHomePage() {
  return useFetch<HomePage>(getHomePage)
}

export function useAboutPage() {
  return useFetch<AboutPage>(getAboutPage)
}

export function useCareersPage() {
  return useFetch<CareersPage>(getCareersPage)
}

export function useContactPage() {
  return useFetch<ContactPage>(getContactPage)
}

export function useCsrPage() {
  return useFetch<CsrPage>(getCsrPage)
}

export function useGlobalPresencePage() {
  return useFetch<GlobalPresencePage>(getGlobalPresencePage)
}

export function useMeditationsPage() {
  return useFetch<MeditationsPage>(getMeditationsPage)
}

export function useOrderMedicinesPage() {
  return useFetch<OrderMedicinesPage>(getOrderMedicinesPage)
}

export function usePapPage() {
  return useFetch<PapPage>(getPapPage)
}

export function useProductsPage() {
  return useFetch<ProductsPage>(getProductsPage)
}

export function useServicesPage() {
  return useFetch<ServicesPage>(getServicesPage)
}

export function useUngcPage() {
  return useFetch<UngcPage>(getUngcPage)
}

// ─────────────────────────────────────────────
// Products
// ─────────────────────────────────────────────

export function useProducts() {
  return useFetch<Product[]>(getProducts)
}

export function useProductBySlug(slug: string) {
  return useFetchWithParam<Product | null, string>(getProductBySlug, slug)
}

export function useProductsByCategory(categoryId: string) {
  return useFetchWithParam<Product[], string>(getProductsByCategory, categoryId)
}

export function useProductSearch(query: string) {
  return useFetchWithParam<Product[], string>(searchProducts, query)
}

// ─────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────

export function useCategories() {
  return useFetch<Category[]>(getCategories)
}

export function useCategoryBySlug(slug: string) {
  return useFetchWithParam<Category | null, string>(getCategoryBySlug, slug)
}

// ─────────────────────────────────────────────
// FAQs
// ─────────────────────────────────────────────

export function useFAQs() {
  return useFetch<FAQ[]>(getFAQs)
}

export function useHomepageFAQs() {
  return useFetch<FAQ[]>(getHomepageFAQs)
}

export function useFAQSearch(query: string) {
  return useFetchWithParam<FAQ[], string>(searchFAQs, query)
}

// ─────────────────────────────────────────────
// Reusable content
// ─────────────────────────────────────────────

export function useServices() {
  return useFetch<Service[]>(getServices)
}

export function useTeamMembers() {
  return useFetch<TeamMember[]>(getTeamMembers)
}

export function useTestimonials() {
  return useFetch<Testimonial[]>(getTestimonials)
}

export function useCountries() {
  return useFetch<CountryPresence[]>(getCountries)
}

export function useCsrPrograms() {
  return useFetch<CsrProgram[]>(getCsrPrograms)
}

// ─────────────────────────────────────────────
// Page Assets (Images)
// ─────────────────────────────────────────────

export function usePageAssets(_page?: string) {
  // All page assets are fetched globally and matched by name.
  // The _page argument is kept for backwards compatibility but is no longer used.
  return useFetch<PageAsset[]>(getPageAssets)
}

export function useCategoryImages() {
  return useFetch<CategoryImageLink[]>(getCategoryImages)
}

export function useHeroSlides() {
  const { data, loading, error } = useFetch<PageAsset>(getHeroSlides as any)
  return { data: data?.images || null, loading, error }
}

/**
 * useImageMapper
 * 
 * Provides two helpers to pull images from the Sanity "Page Images" CMS:
 *
 *   getImage(name, fallback)
 *     Returns the URL of the first image in the named slot.
 *     Used for any single image on a page.
 *
 *   getSliderImages(name, defaultPaths)
 *     Returns an array of image URLs from the named slot.
 *     Used for sliders and galleries.
 *
 * The `name` must match the "Image Name" field in Sanity exactly.
 * See PAGE-IMAGE-GUIDE.md in getmeds_database for the full name list.
 */
export function useImageMapper(_page?: string) {
  const { data: allAssets, loading, error } = usePageAssets()
  const { data: settings } = useSiteSettings()
  const { data: categoryImages, loading: categoryImagesLoading } = useCategoryImages()

  /**
   * getImage(name, fallback) — returns the first image URL for the named slot.
   * Falls back to the local `fallback` path if Sanity has no image yet.
   */
  const getImage = (name: string, fallback: string): string => {
    // Intercept centralized logo — served from siteSettings, not pageAsset
    if (name.includes('getmedslogo.png') && settings?.logo?.src) {
      try {
        return urlFor(settings.logo.src).url()
      } catch (err) {
        console.error('Error generating logo URL from siteSettings:', err)
      }
    }

    if (!allAssets) return fallback

    // Find the document whose name matches exactly
    const doc = allAssets.find((asset) => asset.name === name)
    if (doc?.images && doc.images.length > 0 && doc.images[0]?.image) {
      try {
        return urlFor(doc.images[0].image).url()
      } catch (err) {
        console.error('Error generating URL in getImage:', err)
      }
    }

    return fallback
  }

  /**
   * getLowResImage(name, fallback) — returns a placeholder URL for the named slot's first image,
   * for use as a blur-up preview while the full image loads. Prefers an editor-uploaded
   * `lowResImage`; otherwise derives a tiny/blurred version of the main image via CDN query
   * params. Returns `fallback` unchanged (so callers can detect "no placeholder available").
   */
  const getLowResImage = (name: string, fallback: string): string => {
    if (!allAssets) return fallback

    const doc = allAssets.find((asset) => asset.name === name)
    const slide = doc?.images?.[0]

    if (slide?.lowResImage) {
      try {
        return urlFor(slide.lowResImage).url()
      } catch (err) {
        console.error('Error generating low-res URL in getLowResImage:', err)
      }
    }

    if (slide?.image) {
      try {
        return getLowResUrl(urlFor(slide.image).url())
      } catch (err) {
        console.error('Error deriving low-res URL in getLowResImage:', err)
      }
    }

    return fallback
  }

  /**
   * getImageLink(name) — returns the redirect URL for the named slot's first image,
   * or null if that image isn't marked clickable (or has no image yet). Use alongside
   * getImage() to optionally wrap the <img> in an <a>.
   */
  const getImageLink = (name: string): string | null => {
    if (!allAssets) return null
    const doc = allAssets.find((asset) => asset.name === name)
    const slide = doc?.images?.[0]
    return slide?.enableLink && slide.link ? slide.link : null
  }

  /**
   * getSliderImages(name, defaultPaths) — returns all image URLs for the named slot.
   * Falls back to the local `defaultPaths` array if Sanity has no images yet.
   */
  const getSliderImages = (name: string, defaultPaths: string[]): string[] => {
    if (!allAssets) return defaultPaths

    const doc = allAssets.find((asset) => asset.name === name)
    if (doc?.images && Array.isArray(doc.images) && doc.images.length > 0) {
      const urls = doc.images.map((slide: any) => {
        if (slide?.image) {
          try {
            return urlFor(slide.image).url()
          } catch (err) {
            console.error('Error in getSliderImages urlFor:', err)
          }
        }
        return null
      }).filter(Boolean) as string[]

      if (urls.length > 0) return urls
    }

    return defaultPaths
  }

  /**
   * getSliderImageLinks(name) — returns an array parallel to getSliderImages(), where
   * each entry is the redirect URL for that slide, or null if it isn't clickable.
   */
  const getSliderImageLinks = (name: string): (string | null)[] => {
    if (!allAssets) return []
    const doc = allAssets.find((asset) => asset.name === name)
    if (!doc?.images || !Array.isArray(doc.images)) return []
    return doc.images.map((slide: any) => (slide?.enableLink && slide.link ? slide.link : null))
  }

  const getVideo = (name: string, fallback: string): string => {
    if (!allAssets) return fallback
    const doc = allAssets.find((asset) => asset.name === name)
    const video: any = doc?.videos?.[0]?.video
    if (!video) return fallback
    if (typeof video === 'string') return video
    // Prefer the Sanity CDN copy; the external (Supabase) url is only a fallback for
    // videos that were never uploaded to Sanity, since that bucket can go offline.
    if (video.asset?.url) return video.asset.url
    if (video.url) return video.url
    return fallback
  }

  /**
   * getVideoThumbnail(name, fallback) — returns the poster image URL for the named
   * slot's first video. Only returns a URL if the editor uploaded a custom thumbnail
   * (there's no way to auto-derive a video poster the way getLowResImage does for images);
   * otherwise returns `fallback` unchanged (pass '' to mean "no poster").
   */
  const getVideoThumbnail = (name: string, fallback: string): string => {
    if (!allAssets) return fallback
    const doc = allAssets.find((asset) => asset.name === name)
    const thumbnail = doc?.videos?.[0]?.thumbnail
    if (thumbnail) {
      try {
        return urlFor(thumbnail).url()
      } catch (err) {
        console.error('Error generating URL in getVideoThumbnail:', err)
      }
    }
    return fallback
  }

  /**
   * getVideoLink(name) — returns the redirect URL for the named slot's first video,
   * or null if that video isn't marked clickable (or has no video yet).
   */
  const getVideoLink = (name: string): string | null => {
    if (!allAssets) return null
    const doc = allAssets.find((asset) => asset.name === name)
    const slide = doc?.videos?.[0]
    return slide?.enableLink && slide.link ? slide.link : null
  }

  /**
   * getCategoryImage(categoryName, fallback) — returns the image URL linked to the named
   * Product Range category on the Products document's "Category Featured" tab (matching any
   * category merged into that entry, not just a single-category one). Falls back to the local
   * `fallback` path if that category has no image linked yet.
   */
  const getCategoryImage = (categoryName: string, fallback: string): string => {
    if (!categoryImages) return fallback
    const key = computeCategoryKey(categoryName)
    const link = categoryImages.find((c) => linkCategoryKeys(c).includes(key))
    if (link?.image) {
      try {
        return urlFor(link.image).url()
      } catch (err) {
        console.error('Error generating category image URL:', err)
      }
    }
    return fallback
  }

  /**
   * getCategoryOrder(categoryName) — returns the display order set for the named category on
   * the Products document's "Category Featured" tab, or undefined if it isn't featured there.
   */
  const getCategoryOrder = (categoryName: string): number | undefined => {
    if (!categoryImages) return undefined
    const key = computeCategoryKey(categoryName)
    return categoryImages.find((c) => linkCategoryKeys(c).includes(key))?.order
  }

  return {
    getImage,
    getLowResImage,
    getImageLink,
    getSliderImages,
    getSliderImageLinks,
    getVideo,
    getVideoThumbnail,
    getVideoLink,
    getCategoryImage,
    getCategoryOrder,
    // The raw curated "Category Featured" list (which categories are featured, and in what
    // order) — for pages that need to build their own list/grid from it (see home.tsx's
    // Therapeutic Areas section) rather than just looking up one category at a time.
    categoryImages,
    categoryImagesLoading,
    loading,
    error,
  }
}

// ─────────────────────────────────────────────
// News & Articles Hooks
// ─────────────────────────────────────────────

export function useNews() {
  return useFetch<News[]>(getNews)
}

export function useNewsById(id: string, preview: boolean = false) {
  return useFetchWithParam<News | null, string>((paramId) => getNewsById(paramId, preview), id)
}

export function useNewsBySlug(slug: string, preview: boolean = false) {
  // A preview shows the draft, so it never takes the published copy baked into the page.
  return useFetchWithParam<News | null, string>(
    (paramSlug) => getNewsBySlug(paramSlug, preview),
    slug,
    preview ? undefined : (paramSlug) => readPreload<News>('news', paramSlug),
  )
}

export function useNewsPaginated(perPage: number = BLOG_PAGE_SIZE) {
  const [articles, setArticles] = useState<News[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [error, setError] = useState<Error | null>(null)
  const [loadMoreError, setLoadMoreError] = useState<Error | null>(null)

  // Load the first page on mount
  useEffect(() => {
    let cancelled = false
    setLoading(true)

    getNewsPage(1, perPage)
      .then(({ items, totalPages }) => {
        if (!cancelled) {
          setArticles(items)
          setCurrentPage(1)
          setHasMore(1 < totalPages)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadMore = () => {
    if (loadingMore || !hasMore) return
    const nextPage = currentPage + 1
    setLoadingMore(true)
    setLoadMoreError(null)

    getNewsPage(nextPage, perPage)
      .then(({ items, totalPages }) => {
        setArticles(prev => [...prev, ...items])
        setCurrentPage(nextPage)
        setHasMore(nextPage < totalPages)
      })
      .catch((err) => {
        setLoadMoreError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        setLoadingMore(false)
      })
  }

  return { articles, loading, loadingMore, hasMore, loadMore, error, loadMoreError }
}

export function useFeaturedNews() {
  return useFetch<News[]>(getFeaturedNews)
}

export function useNewsCategories() {
  return useFetch<string[]>(getNewsCategories)
}


