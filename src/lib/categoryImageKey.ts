// Keep in sync with getmeds_database/studio/lib/categoryImageKey.ts — both
// must derive the exact same key for the exact same category name, since the
// Studio writes links keyed this way and this file looks them up the same
// way.

function normalizeKeyPart(value: any): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function computeCategoryKey(categoryName: string): string {
  return normalizeKeyPart(categoryName)
}

export interface MergeableCategoryLink {
  categoryKeys?: string[]
  categoryKey?: string
}

/**
 * The category keys a Category Featured entry actually covers — categoryKeys when present
 * (one entry, or several when merged into one card, e.g. "Nephrology / Renal"), falling back to
 * the legacy single categoryKey field for entries published before merging was supported.
 */
export function linkCategoryKeys(link: MergeableCategoryLink): string[] {
  if (link.categoryKeys && link.categoryKeys.length) return link.categoryKeys
  return link.categoryKey ? [link.categoryKey] : []
}

export interface FeaturedOrderLink extends MergeableCategoryLink {
  order?: number
}

/**
 * The Category Featured order for a display category name, which may itself already be a
 * merged/combined name (e.g. "Nephrology / Renal") — splits on "/" and "," the same way the
 * Studio's extractCategoryOptions() does, so it matches if ANY constituent part is featured,
 * not just an exact whole-string match. Returns undefined if nothing matches (not featured).
 */
export function getFeaturedCategoryOrder(
  categoryName: string,
  categoryImages: FeaturedOrderLink[] | null | undefined
): number | undefined {
  if (!categoryImages || categoryImages.length === 0) return undefined
  const parts = String(categoryName)
    .split(/[\/,]/)
    .map((s) => computeCategoryKey(s.trim()))
    .filter(Boolean)
  if (parts.length === 0) return undefined
  for (const link of categoryImages) {
    const keys = linkCategoryKeys(link)
    // Every part of this (possibly already-merged) display name must belong to the SAME
    // featured entry — "any part" would wrongly match e.g. "Hematology / OB-GYN" against a
    // featured "Hematology" entry just because they share that one word.
    if (parts.every((p) => keys.includes(p))) return link.order
  }
  return undefined
}

/**
 * Sorts items by their Category Featured order (the drag-and-drop order set in the Studio's
 * "Category Featured" tab) — featured items first, ascending by order; anything not featured
 * keeps its original relative order, appended after every featured item (rather than being
 * hidden or interleaved alphabetically among them).
 */
export function sortByFeaturedOrder<T>(
  items: T[],
  getName: (item: T) => string,
  categoryImages: FeaturedOrderLink[] | null | undefined
): T[] {
  return items
    .map((item, index) => ({ item, index, order: getFeaturedCategoryOrder(getName(item), categoryImages) }))
    .sort((a, b) => {
      const aOrder = a.order ?? Number.MAX_SAFE_INTEGER
      const bOrder = b.order ?? Number.MAX_SAFE_INTEGER
      return aOrder !== bOrder ? aOrder - bOrder : a.index - b.index
    })
    .map((entry) => entry.item)
}
