// Keep in sync with getmeds_database/studio/lib/productImageKey.ts — both must
// derive the exact same key for the exact same product, since the Studio
// writes links keyed this way and this file looks them up the same way.
//
// Replaces the old naming-format + fuzzy-filename-matching system (see git
// history for imageNaming.ts): instead of guessing which uploaded file
// "probably" belongs to a product, a person explicitly attaches an image to
// a specific product row in the Studio, and the key below is just a stable
// handle for that link.

function normalizeKeyPart(value: any): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface KeyableProduct {
  brandName?: string
  genericName?: string
  name?: string
  strength?: string
  form?: string
  slug?: string | { current?: string }
  'slug.current'?: string
}

/**
 * Pulls the raw slug string off a product row, however it happens to be
 * shaped: SheetJS flattens a nested "slug.current" column into a literal
 * "slug.current" key rather than a nested object, while rows coming from
 * Sanity (or already-normalized data) carry slug as a string or
 * { current } object.
 */
function rawSlug(product: KeyableProduct): string {
  const slug = product.slug
  if (typeof slug === 'string') return slug
  if (slug && typeof slug === 'object' && slug.current) return slug.current
  return product['slug.current'] || ''
}

/** Brand names (lowercased/trimmed) that appear on more than one product row. */
export function findDuplicateBrandNames(products: KeyableProduct[]): Set<string> {
  const counts = new Map<string, number>()
  products.forEach((p) => {
    const brand = (p.brandName || '').toLowerCase().trim()
    if (brand) counts.set(brand, (counts.get(brand) || 0) + 1)
  })
  const duplicates = new Set<string>()
  counts.forEach((count, brand) => {
    if (count > 1) duplicates.add(brand)
  })
  return duplicates
}

/**
 * Stable key for linking an image to a product: the product's URL slug,
 * since that's the field the rest of the app already treats as each
 * product's canonical, immutable identity (dedup, routing, fetch-by-slug —
 * see src/lib/queries.ts). Keying on the slug means editing a brand name,
 * generic name, strength, or form later can never orphan an already-linked
 * image.
 *
 * Falls back to the old brandName + genericName + strength + form tuple (and
 * then bare product name) only for rows that have no slug at all, so
 * previously-linked images without a slug don't just disappear.
 * Returns null if there isn't enough data to key on.
 */
export function computeProductKey(product: KeyableProduct): string | null {
  const slugKey = normalizeKeyPart(rawSlug(product))
  if (slugKey) return slugKey

  const parts = [
    normalizeKeyPart(product.brandName),
    normalizeKeyPart(product.genericName),
    normalizeKeyPart(product.strength),
    normalizeKeyPart(product.form),
  ].filter(Boolean)

  if (parts.length) return parts.join('-')

  // Fall back to the bare product name when none of the identifying fields are present.
  return normalizeKeyPart(product.name) || null
}
