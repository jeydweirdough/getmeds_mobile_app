import { client } from './sanity'
import { sanityQuery } from './sanityProxy'
import { computeProductKey } from './productImageKey'
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
  PoliciesDisclaimers,
} from '../types/sanity'

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function cleanWordPressUrl(url: string | undefined | null): string {
  if (!url) return '';
  return url
    .replace(/^https?:\/\/(cms\.)?getmeds\.ph/i, '')
    .replace(/^https?:\/\/www\.getmeds\.ph/i, '')
    .replace(/^https?:\/\/173\.231\.197\.156/i, '');
}

// ─────────────────────────────────────────────
// Site-wide
// ─────────────────────────────────────────────

export async function getSiteSettings() {
  return sanityQuery<SiteSettings>('siteSettings.global')
}

export async function getNavigation() {
  return sanityQuery<Navigation>('navigation.main')
}

export async function getPoliciesDisclaimers() {
  return sanityQuery<PoliciesDisclaimers>('policiesDisclaimers.main', undefined, { fresh: true })
}

export async function getPolicyBySlug(slug: string) {
  return sanityQuery<PoliciesDisclaimers>('policiesDisclaimers.bySlug', { slug }, { fresh: true })
}

export async function getAllPolicies() {
  return sanityQuery<PoliciesDisclaimers[]>('policiesDisclaimers.all', undefined, { fresh: true })
}

// ─────────────────────────────────────────────
// Products
// ─────────────────────────────────────────────

interface ProductImageLink {
  productKey?: string
  image?: any
}

// The "Products Range" sheet repeats a product once per condition it's
// relevant to (each repeat carries the same Product URL Slug, with the other
// conditions listed in "Also Linked From") rather than one row per product.
// This builds a lookup from condition name -> its own condition slug/hub url
// across *all* raw rows (before rows sharing a slug are collapsed to one
// canonical product below), so a product can still link to the hub page of
// a condition it's "also linked from" even though that condition's row was
// deduped away.
function buildConditionSlugLookup(rawProducts: any[]): Map<string, { conditionSlug?: string; conditionHubUrl?: string }> {
  const lookup = new Map<string, { conditionSlug?: string; conditionHubUrl?: string }>()
  rawProducts.forEach((p) => {
    const name = (p.subCategory || '').trim()
    if (!name || lookup.has(name.toLowerCase())) return
    lookup.set(name.toLowerCase(), { conditionSlug: p.conditionSlug, conditionHubUrl: p.conditionHubUrl })
  })
  return lookup
}

function splitConditionList(value: any): string[] {
  if (!value) return []
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

async function fetchProductsFromExcel(): Promise<Product[]> {
  const result = await sanityQuery<{ json_data?: string; productImages?: ProductImageLink[] }>('product.excelJson')
  if (!result || !result.json_data) return []
  try {
    const data = JSON.parse(result.json_data)
    const firstSheetName = Object.keys(data)[0]
    if (!firstSheetName) return []
    // The sheet's used range can extend well past the last real row (trailing
    // blank rows still parse as objects with every value ''), so anything with
    // no identifying data at all is dropped before it can become a phantom product.
    const allRawRows = (data[firstSheetName] || []).filter(
      (r: any) => r && (r.brandName || r.genericName || r.name || r.slug || r['slug.current'])
    )
    const conditionSlugLookup = buildConditionSlugLookup(allRawRows)

    // Collapse rows that share the same Product URL Slug into a single
    // canonical product (first occurrence wins for display fields), merging
    // every row's condition + "Also Linked From" names into one `conditions`
    // list — this is what drives which condition hub pages the product
    // surfaces on, without duplicating the product page itself.
    const bySlug = new Map<string, any>()
    const slugOrder: string[] = []
    allRawRows.forEach((p: any) => {
      const slugKey = String(p.slug || p['slug.current'] || p._id || '').toLowerCase().trim()
      if (!slugKey) {
        // No slug to dedupe on — keep as its own row.
        slugOrder.push(`__noslug-${slugOrder.length}`)
        bySlug.set(slugOrder[slugOrder.length - 1], p)
        return
      }
      const allConditions = new Set<string>(
        [p.subCategory, ...splitConditionList(p.alsoLinkedFrom)].map((s) => (s || '').trim()).filter(Boolean)
      )
      if (!bySlug.has(slugKey)) {
        slugOrder.push(slugKey)
        bySlug.set(slugKey, { ...p, _conditions: allConditions })
      } else {
        const existing = bySlug.get(slugKey)
        allConditions.forEach((c) => existing._conditions.add(c))
      }
    })
    const rawProducts = slugOrder.map((key) => {
      const row = bySlug.get(key)
      const conditions: string[] = Array.from(row._conditions || [])
      delete row._conditions
      return { ...row, conditions }
    })

    // Images are linked explicitly per product (via the Studio's Product
    // Images tab) rather than guessed from an uploaded file's name — look
    // each one up by the same stable key the Studio computed when it was
    // attached. See productImageKey.ts.
    const imageByKey = new Map<string, any>()
    ;(result.productImages || []).forEach((link) => {
      if (link.productKey && link.image) imageByKey.set(link.productKey, link.image)
    })

    // Fetch all individual product documents (which don't have title defined) that are active/present or undefined remarks
    const originalProducts = await sanityQuery<any[]>('product.individualDocs')
    // Fetch all category documents to resolve category references
    const categories = await sanityQuery<Category[]>('category.all') || []



    // Create a lookup map for original products by their document _id
    const originalMap = new Map<string, any>()
    originalProducts.forEach(op => {
      originalMap.set(op._id, op)
    })

    const getCategoryReference = (pCat: any) => {
      if (!pCat) return undefined
      if (typeof pCat === 'object' && pCat._id) return pCat
      if (typeof pCat !== 'string') return undefined

      const excelCat = pCat.trim()
      if (!excelCat) return undefined

      const parts = excelCat.split(/[\/,]/).map(s => s.trim().toLowerCase()).filter(Boolean)
      for (const part of parts) {
        const matched = categories.find(c => c.category.toLowerCase().trim() === part)
        if (matched) {
          return {
            _id: matched._id,
            _type: 'reference',
            category: matched.category,
            slug: matched.slug
          }
        }
      }

      for (const part of parts) {
        const matched = categories.find(c => 
          c.category.toLowerCase().includes(part) || part.includes(c.category.toLowerCase())
        )
        if (matched) {
          return {
            _id: matched._id,
            _type: 'reference',
            category: matched.category,
            slug: matched.slug
          }
        }
      }

      const cleanName = excelCat.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      const titleCased = excelCat.split('/')
        .map(s => toTitleCase(s.trim()))
        .join(' / ')
      return {
        _id: `temp-${cleanName}`,
        _type: 'reference',
        category: titleCased,
        slug: { _type: 'slug', current: cleanName }
      }
    }

    const allowedProducts = rawProducts.map((p: any) => {
      // Find matching original product
      const orig = originalMap.get(p._id) || {}

      // Exclude if the original document has remarks that are not active/present (e.g. previews)
      if (orig.remarks && orig.remarks !== 'present' && orig.remarks !== 'active') {
        return null
      }

      // Resolve slug
      // Note: SheetJS flattens nested "slug.current" columns into a literal "slug.current" key,
      // not a nested { slug: { current } } object, so that key must be checked explicitly.
      let slug = p.slug || p['slug.current'] || orig.slug
      if (typeof slug === 'string') {
        slug = { _type: 'slug', current: slug }
      } else if (slug && typeof slug === 'object' && slug.current) {
        // already formatted correctly
      } else if (p.name || orig.name) {
        slug = {
          _type: 'slug',
          current: String(p.name || orig.name).toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
        }
      } else {
        slug = { _type: 'slug', current: 'unnamed-product' }
      }

      const merged = {
        ...orig,
        ...p,
        _id: p._id || orig._id || `excel-${slug.current}`,
        _type: 'product',
        slug,
        category: orig.category || getCategoryReference(p.category),
        excelCategory: p.category,
        image: (() => {
          const key = computeProductKey({ ...p, slug })
          return (key && imageByKey.get(key)) || orig.image
        })(),
        // A blank/whitespace Availability cell in the Excel sheet comes through as `undefined`
        // (SheetJS omits the key entirely rather than writing an empty string), not `null` — so
        // this must not default blank cells to available. Only an exact `true` (boolean or the
        // string "true", case-insensitive) counts; anything else, including a missing column,
        // resolves to false and gets filtered out below.
        availability: p.availability === true || String(p.availability ?? '').trim().toLowerCase() === 'true',
        // Preserve rich-text / detail fields from the Sanity doc when Excel row is empty
        description: p.description || orig.description,
        indications: p.indications || orig.indications,
        dosageAdministration: p.dosageAdministration || orig.dosageAdministration,
        mechanismOfAction: p.mechanismOfAction || orig.mechanismOfAction,
        supportingFacts: p.supportingFacts || orig.supportingFacts,
        storageCondition: p.storageCondition || orig.storageCondition,
        packaging: p.packaging || orig.packaging,
        innovator: p.innovator || orig.innovator,
        // ── "Products Range" workbook fields — read directly, no re-derivation ──
        productGroup: p.productGroup || orig.productGroup,
        categoryFolder: p.categoryFolder || orig.categoryFolder,
        conditionSlug: p.conditionSlug || orig.conditionSlug,
        conditionHubUrl: p.conditionHubUrl || orig.conditionHubUrl,
        productPageUrl: p.productPageUrl || orig.productPageUrl,
        breadcrumb: p.breadcrumb || orig.breadcrumb,
        alsoLinkedFrom: p.alsoLinkedFrom || orig.alsoLinkedFrom,
        conditions: (p.conditions && p.conditions.length ? p.conditions : undefined) || orig.conditions,
        metaTitle: p.metaTitle || orig.metaTitle,
        metaDescription: p.metaDescription || orig.metaDescription,
        status: p.status || orig.status,
        notes: p.notes || orig.notes,
        prescription: p.prescription || (p as any).Prescription || orig.prescription,
        // ── Structured-data columns ──
        manufacturer: p.manufacturer || orig.manufacturer,
        conditionFilipinoName: p.conditionFilipinoName || orig.conditionFilipinoName,
        conditionSpecialty: p.conditionSpecialty || orig.conditionSpecialty,
        conditionLastReviewed: p.conditionLastReviewed || orig.conditionLastReviewed,
        conditionReviewedBy: p.conditionReviewedBy || orig.conditionReviewedBy,
      } as Product;

      // Every condition this product belongs under gets its own hub slug/url,
      // even conditions whose own sheet row got deduped away above.
      merged.conditionSlugsByName = Object.fromEntries(
        (merged.conditions || []).map((name) => [name, conditionSlugLookup.get(name.toLowerCase())])
      )



      return merged;
    }).filter(Boolean) as Product[]

    // Find manually created individual product documents (which have remarks present or active)
    const excelProductIds = new Set(rawProducts.map((p: any) => p._id))
    const individualOnlyProducts = originalProducts.filter(op => {
      if (excelProductIds.has(op._id)) return false
      return op.remarks === 'present' || op.remarks === 'active'
    }).map(op => {
      // Resolve slug
      let slug = op.slug
      if (typeof slug === 'string') {
        slug = { _type: 'slug', current: slug }
      } else if (slug && typeof slug === 'object' && slug.current) {
        // already formatted correctly
      } else if (op.name) {
        slug = {
          _type: 'slug',
          current: String(op.name).toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
        }
      } else {
        slug = { _type: 'slug', current: 'unnamed-product' }
      }

      return {
        ...op,
        _type: 'product',
        slug,
        availability: op.availability === undefined ? true : (op.availability === true || String(op.availability).toLowerCase() === 'true'),
      } as Product
    })

    // Rows whose Availability column isn't literally true (blank/null, "Needs Review", etc.)
    // aren't confirmed for public display yet — exclude them everywhere, not just from the
    // in-stock/out-of-stock filter toggle on the product listing page.
    return [...allowedProducts, ...individualOnlyProducts].filter((p) => p.availability === true)
  } catch (err) {
    console.error('Failed to parse Excel products:', err)
    return []
  }
}

export async function getProducts() {
  const products = await fetchProductsFromExcel()
  return products.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

export async function getProductBySlug(slug: string) {
  const products = await fetchProductsFromExcel()
  return products.find((p) => p.slug?.current === slug) || null
}

export async function getProductsByCategory(categoryId: string) {
  const products = await fetchProductsFromExcel()
  return products
    .filter((p) => (p.category as any)?._id === categoryId)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

export async function searchProducts(query: string) {
  const products = await fetchProductsFromExcel()
  const normalizedQuery = query.replace(/\*/g, '').toLowerCase().trim()
  if (!normalizedQuery) return products
  return products
    .filter((p) =>
      (p.name || '').toLowerCase().includes(normalizedQuery) ||
      (p.genericName || '').toLowerCase().includes(normalizedQuery) ||
      (p.brandName || '').toLowerCase().includes(normalizedQuery) ||
      (p.subCategory || '').toLowerCase().includes(normalizedQuery)
    )
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

// ─────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────

// A "category" for site navigation/routing purposes is now keyed on the
// Excel's Category Folder (the URL section a product lives under), not on
// the Product Range name — one Product Range can span more than one folder
// (e.g. Endocrinology → both "hormonal-therapy" and "diabetes-medicines"),
// so the folder is the real routing unit. Everything here comes straight
// from the sheet; there's no fuzzy string-matching or reclassification.
export function folderDisplayName(folder: string): string {
  return folder
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export async function getCategories() {
  const products = await fetchProductsFromExcel()
  const catMap = new Map<string, Category>()

  products.forEach((p: any) => {
    const rawCategory = p.excelCategory || (typeof p.category === 'string' ? p.category : p.category?.category) || (p.categoryFolder ? folderDisplayName(p.categoryFolder) : '')
    const catName = (rawCategory || '').trim()
    if (!catName) return

    const key = catName.toLowerCase()
    const folder = p.categoryFolder || key.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

    if (!catMap.has(key)) {
      catMap.set(key, {
        _id: `cat-${key}`,
        _type: 'category',
        category: catName,
        slug: { _type: 'slug', current: folder },
        subcategory: [],
        folders: [],
      } as Category)
    }

    const catObj = catMap.get(key)!
    // A category can be filed under more than one Category Folder, and each folder is its
    // own URL. Collecting all of them (rather than keeping only the first product's, which
    // is what `slug` still holds) is what lets /diabetes-medicines resolve to Endocrinology
    // instead of falling through to the unfiltered "all products" view.
    if (folder && !catObj.folders!.includes(folder)) catObj.folders!.push(folder)
    const conditions = p.conditions && p.conditions.length ? p.conditions : (p.subCategory ? [p.subCategory] : [])
    conditions.forEach((sub: string) => {
      if (sub && !catObj.subcategory!.includes(sub)) catObj.subcategory!.push(sub)
    })
  })

  return Array.from(catMap.values()).sort((a, b) => (a.category || '').localeCompare(b.category || ''))
}

export async function getCategoryBySlug(slug: string) {
  const categories = await getCategories()
  return categories.find(c => c.slug?.current === slug) || null
}

// ─────────────────────────────────────────────
// FAQs
// ─────────────────────────────────────────────

export async function getFAQs() {
  return sanityQuery<FAQ[]>('faq.all')
}

/** FAQs flagged for the homepage section, in the Studio's drag order. */
export async function getHomepageFAQs() {
  return sanityQuery<FAQ[]>('faq.homepage')
}

export async function searchFAQs(query: string) {
  return sanityQuery<FAQ[]>('faq.search', { query: `*${query}*` })
}

// ─────────────────────────────────────────────
// Reusable content
// ─────────────────────────────────────────────

export async function getServices() {
  return sanityQuery<Service[]>('service.all')
}

export async function getTeamMembers() {
  // { fresh: true } — bypasses Sanity's CDN cache so drag-reordering or
  // adding/removing a team member in Studio shows up on the About Us page
  // immediately instead of waiting out the CDN's cache TTL.
  return sanityQuery<TeamMember[]>('teams.all', undefined, { fresh: true })
}

export async function getTestimonials() {
  return sanityQuery<Testimonial[]>('testimonial.all')
}

export async function getCountries() {
  return sanityQuery<CountryPresence[]>('countryPresence.all')
}

export async function getCsrPrograms() {
  return sanityQuery<CsrProgram[]>('csrProgram.all')
}

// ─────────────────────────────────────────────
// Pages
// ─────────────────────────────────────────────

export async function getHomePage() {
  return sanityQuery<HomePage>('homePage.main')
}

export async function getAboutPage() {
  return sanityQuery<AboutPage>('aboutPage.main')
}

export async function getCareersPage() {
  return sanityQuery<CareersPage>('careersPage.main')
}

export async function getContactPage() {
  return sanityQuery<ContactPage>('contactPage.main')
}

export async function getCsrPage() {
  return sanityQuery<CsrPage>('csrPage.main')
}

export async function getGlobalPresencePage() {
  return sanityQuery<GlobalPresencePage>('globalPresencePage.main')
}

export async function getMeditationsPage() {
  return sanityQuery<MeditationsPage>('meditationsPage.main')
}

export async function getOrderMedicinesPage() {
  return sanityQuery<OrderMedicinesPage>('orderMedicinesPage.main')
}

export async function getPapPage() {
  return sanityQuery<PapPage>('papPage.main')
}

export async function getProductsPage() {
  return sanityQuery<ProductsPage>('productsPage.main')
}

export async function getServicesPage() {
  return sanityQuery<ServicesPage>('servicesPage.main')
}

export async function getUngcPage() {
  return sanityQuery<UngcPage>('ungcPage.main')
}

// ─────────────────────────────────────────────
// Page Assets (Images)
// ─────────────────────────────────────────────

export async function getPageAssets() {
  return sanityQuery<PageAsset[]>('pageAsset.all')
}

export async function getPageAssetsByPage(_page?: string) {
  // Page filtering is no longer used — all assets are fetched and matched by name.
  // This function is kept for backwards compatibility with existing hook calls.
  return sanityQuery<PageAsset[]>('pageAsset.all')
}

export async function getHeroSlides() {
  return sanityQuery<PageAsset[]>('pageAsset.heroSlides')
}

// ─────────────────────────────────────────────
// Category Images (per Product Range category, managed on the Products
// document's "Category Image" Studio tab)
// ─────────────────────────────────────────────

export interface CategoryImageLink {
  categoryKeys?: string[]
  /** @deprecated superseded by categoryKeys — kept for entries published before merging support */
  categoryKey?: string
  categoryLabel?: string
  image?: any
  order?: number
}

export async function getCategoryImages(): Promise<CategoryImageLink[]> {
  const result = await sanityQuery<{ categoryImages?: CategoryImageLink[] }>('product.categoryImages')
  return result?.categoryImages || []
}

export async function getGoogleSpreadsheetBySlug(slug: string) {
  return sanityQuery<{ _id: string; spreadsheetId: string; link: string } | null>('googleSpreadsheet.bySlug', { slug })
}

// ─────────────────────────────────────────────
// News & Articles
// ─────────────────────────────────────────────

// The blog is authored in WordPress and read through /api/blog/*, whose
// responses Vercel caches at the edge for an hour. Vercel offers no per-URL
// purge for that Python function, so invalidation works by changing the URL
// rather than clearing the cache: the "Sync Blog" tool in the Sanity Studio
// writes a new timestamp to siteSettings.blogVersion, and appending it here as
// `v` gives every blog URL a cache key no edge region has seen, which misses
// and refetches from WordPress immediately.
//
// Resolved once per page load and reused. The token only changes when someone
// clicks Sync, so re-reading it would put a second round trip in front of every
// blog request for nothing. If the lookup fails the token is simply omitted,
// leaving the ordinary hour-long cache in place rather than breaking the page.
let blogVersionPromise: Promise<string> | null = null

function getBlogVersion(): Promise<string> {
  if (!blogVersionPromise) {
    blogVersionPromise = sanityQuery<string | null>('siteSettings.blogVersion')
      .then((token) => (token ? String(token) : ''))
      .catch(() => '')
  }
  return blogVersionPromise
}

function getBackendApiBase(): string {
  // In the browser, same-origin: next.config.ts rewrites /api/* to the backend, as vercel.json did.
  if (typeof window !== 'undefined') return ''
  const envUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || process.env.VITE_BACKEND_API_URL || 'https://getmeds-admin.vercel.app'
  return envUrl.replace(/\/$/, '')
}

async function withBlogVersion(url: string): Promise<string> {
  const token = await getBlogVersion()
  const baseUrl = url.startsWith('/') ? `${getBackendApiBase()}${url}` : url
  if (!token) return baseUrl
  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(token)}`
}

/**
 * ⚠ TEMPORARY — page sizes chosen to dodge a stale cache, not for UX.
 *
 * Revert both to round numbers (20 and 9, or whatever suits) as soon as the
 * backend fix described below is deployed, and delete this comment.
 *
 * ── The actual cause ──
 * cms.getmeds.ph sits behind an nginx proxy cache that keys on the exact
 * request URL — it reports x-proxy-cache: HIT/MISS. The admin backend never
 * forwarded the `v` token from withBlogVersion() upstream: it used it only in
 * its own cache key, and asked WordPress for a byte-identical URL every time.
 * So Studio's "Sync Blog" busted our cache and Vercel's edge, then refetched
 * nginx's stale copy and cached that — which is why syncing looked like it did
 * nothing at all.
 *
 * Measured against live WordPress on 2026-09-22, minutes apart, one post:
 *
 *     ?_embed&page=1&per_page=9        HIT   post modified 00:56:34  (stale)
 *     ?_embed&page=1&per_page=24       MISS  post modified 02:29:40  (current)
 *     ?_embed&page=1&per_page=9&gm_v=… MISS  post modified 02:29:40  (current)
 *
 * Same post, same moment, two different bodies — the only variable being
 * whether that URL happened to be sitting in nginx's cache. 9 and 20 were the
 * only two sizes this site ever requested, so they were the only two URLs with
 * a stale entry; neighbouring sizes had never been requested, missed the cache,
 * and came back correct.
 *
 * (An earlier version of this comment blamed a stale deployment of the backend
 * for ignoring `v`. That was wrong: the committed code does put `v` in its own
 * cache key, it just never sent it to WordPress. The cache that mattered was
 * one layer further out.)
 *
 * ── What this is and is not ──
 * Moving to an unrequested page size fetches past nginx's stale entry once, so
 * the site shows current content immediately. It does NOT repair anything: the
 * new sizes get cached in their turn, and the next edit goes stale the same way.
 *
 * ── The real fix ──
 * app/api/routes/slug_resolver.py in getmeds_backend now forwards the token to
 * WordPress as `gm_v`, which changes the URL and therefore nginx's cache key.
 * WordPress ignores query parameters it does not recognise, so it is inert to
 * the API and decisive to the cache in front of it. That needs getmeds-admin
 * redeployed to take effect.
 */
const BLOG_LISTING_PER_PAGE = 24
export const BLOG_PAGE_SIZE = 12

export async function getNews() {
  try {
    const res = await fetch(await withBlogVersion(`/api/blog/posts?per_page=${BLOG_LISTING_PER_PAGE}`));
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    return (data.items || []).map(cleanNewsItem);
  } catch (err) {
    console.error('Error fetching news from backend API:', err);
    return [];
  }
}

export async function getNewsPage(page: number, perPage: number = 20): Promise<{ items: News[]; totalPages: number }> {
  try {
    const res = await fetch(await withBlogVersion(`/api/blog/posts?per_page=${perPage}&page=${page}`));
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    return {
      items: (data.items || []).map(cleanNewsItem),
      totalPages: data.totalPages || 1
    };
  } catch (err) {
    console.error(`Error fetching news page ${page} from backend API:`, err);
    return { items: [], totalPages: 0 };
  }
}

export async function getNewsById(id: string, preview: boolean = false) {
  try {
    const rawUrl = `/api/blog/posts/${id}`
    const url = preview ? `${getBackendApiBase()}${rawUrl}?preview=true` : await withBlogVersion(rawUrl);
    const res = await fetch(url, preview ? { cache: 'no-store' } : undefined);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return cleanNewsItem(await res.json());
  } catch (err) {
    console.error(`Error fetching news item ${id} from backend API:`, err);
    return null;
  }
}

// Category pills on the blog page used to need every loaded article fetched
// first just to know which categories have posts. WordPress's own "category"
// taxonomy (the same one shown on the WP admin Categories screen — Cancer,
// Blood Pressure, Covid-19, etc.) already carries a post `count` per term
// without touching any post body, so read the pill list straight off that —
// this is also the taxonomy `article.tag` is populated from (wp:term[0]).
export async function getNewsCategories(): Promise<string[]> {
  try {
    // Cache-busted + no-store, same as getFeaturedNews below — without this the
    // browser/CDN kept serving a stale category list (new/renamed WP categories
    // wouldn't show up in the pills until a hard refresh).
    const cacheBuster = `t=${Date.now()}`;
    const wpRoot = process.env.NEXT_PUBLIC_WORDPRESS_API_ROOT || process.env.VITE_WORDPRESS_API_ROOT || 'https://cms.getmeds.ph';
    const res = await fetch(`${wpRoot.replace(/\/$/, '')}/wp-json/wp/v2/categories?per_page=100&_fields=id,name,count&${cacheBuster}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const categories: { name: string; count: number }[] = await res.json();
    return categories
      .filter((c) => c.count > 0 && c.name.toLowerCase() !== 'uncategorized')
      .sort((a, b) => b.count - a.count)
      .map((c) => c.name)
  } catch (err) {
    console.error('Error fetching blog categories from WordPress:', err);
    return [];
  }
}

export async function getNewsBySlug(slug: string, preview: boolean = false) {
  try {
    const rawUrl = `/api/blog/posts?slug=${slug}`
    const url = preview ? `${getBackendApiBase()}${rawUrl}&preview=true` : await withBlogVersion(rawUrl);
    const res = await fetch(url, preview ? { cache: 'no-store' } : undefined);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    if (!data.items || data.items.length === 0) return null;
    return cleanNewsItem(data.items[0]);
  } catch (err) {
    console.error(`Error fetching news item by slug ${slug} from backend API:`, err);
    return null;
  }
}

// Older posts built with WPBakery (no longer active on the CMS) come through the API with their
// [vc_row][vc_column]... shortcodes as literal text, in the body and in any auto-built excerpt.
// Only vc_ tags are removed; posts contain other square brackets that must stay. Paragraphs left
// holding nothing but a shortcode are dropped too. Kept in step with the same function in
// scripts/prerender-blog.cjs, which writes the prerendered description.
function stripPageBuilderShortcodes(html: string): string {
  return html.replace(/\[\/?vc_[^\]]*\]/g, '').replace(/<p>\s*<\/p>/g, '');
}

// The backend's /api/blog/* passes WordPress text through as-is, shortcodes included, so every
// item read from it goes through here too — not just the posts parsed from WordPress directly.
function cleanNewsItem<T>(item: T): T {
  if (!item || typeof item !== 'object') return item;
  const post = item as T & { description?: unknown; contentHtml?: unknown };
  return {
    ...post,
    ...(typeof post.description === 'string' ? { description: stripPageBuilderShortcodes(post.description).trim() } : {}),
    ...(typeof post.contentHtml === 'string' ? { contentHtml: stripPageBuilderShortcodes(post.contentHtml) } : {}),
  };
}

function parseWpPost(item: any): News {
  const categories = item._embedded?.['wp:term']?.[0] || [];
  const tag = categories[0]?.name || 'News';
  
  const featuredMedia = item._embedded?.['wp:featuredmedia']?.[0] || {};
  const image = featuredMedia.source_url || '';
  
  const rawExcerpt = stripPageBuilderShortcodes(item.excerpt?.rendered || '');
  let description = rawExcerpt.replace(/<[^>]*>/g, '');
  description = description.replace(/&amp;nbsp;/g, ' ').replace(/&nbsp;/g, ' ');
  description = description.replace(/&#\d+;/g, '').trim();
  
  const rawContent = stripPageBuilderShortcodes(item.content?.rendered || '');
  const cleanContent = rawContent.replace(/<div id="ez-toc-container"[\s\S]*?<\/nav>\s*<\/div>/g, '');
  
  const textOnly = cleanContent.replace(/<[^>]*>/g, '');
  const wordCount = textOnly.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(wordCount / 200));
  const readTime = `${minutes} min read`;
  
  return {
    _id: String(item.id || ''),
    _type: 'news',
    tag,
    title: item.title?.rendered || '',
    slug: item.slug || '',
    date: item.date || '',
    description,
    readTime,
    image: cleanWordPressUrl(image),
    contentHtml: cleanContent,
    source_link: item.link || ''
  };
}

export async function getFeaturedNews() {
  try {
    const wp_root = "https://cms.getmeds.ph";
    const cacheBuster = `t=${Date.now()}`;
    const idsRes = await fetch(`${wp_root}/wp-json/getmeds/v1/featured-blogs?${cacheBuster}`, { cache: 'no-store' });
    if (!idsRes.ok) throw new Error(`HTTP error! status: ${idsRes.status}`);
    const featured_ids = await idsRes.json();
    if (!featured_ids || !Array.isArray(featured_ids)) return [];
    
    const ids = featured_ids.map(Number).filter(id => !isNaN(id) && id > 0);
    if (ids.length === 0) return [];
    
    const postPromises = ids.map(async (id) => {
      try {
        const postRes = await fetch(`${wp_root}/wp-json/wp/v2/posts/${id}?_embed=true&${cacheBuster}`, { cache: 'no-store' });
        if (!postRes.ok) return null;
        const postData = await postRes.json();
        return parseWpPost(postData);
      } catch (err) {
        console.error(`Error fetching post ${id} from WordPress:`, err);
        return null;
      }
    });
    
    const results = await Promise.all(postPromises);
    return results.filter((item): item is News => item !== null);
  } catch (err) {
    console.error('Error fetching featured news from WordPress:', err);
    return [];
  }
}

export async function getCareers() {
  return sanityQuery<any[]>('career.all')
}

export async function getVerifiedEmployees() {
  return client.fetch<any[]>(`
    *[_type == "verifiedEmployees" && (remarks == "present" || !defined(remarks))] {
      _id,
      title,
      json_data,
      remarks
    }
  `)
}




