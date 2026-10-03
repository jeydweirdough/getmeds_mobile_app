'use client';

import { useProducts } from '@/lib/useSanity';
import { CatalogueRow } from '@/lib/catalogueItem';
import { CategoryCard, useCatalogueCategories } from '@/lib/CategoryCard';
import { goBack } from '@/platform/navigation';
import { BackChevron } from '@/lib/ui/Screen';

/**
 * CategoriesClient.tsx
 * ─────────────────────────────────────────────
 * Every category in the catalogue, the home screen's swipe strip laid out as
 * one full-width card per row. Opened from "See all" beside Categories on the
 * home screen; each card goes to that folder's listing, as on the strip.
 */
export default function CategoriesClient() {
  const { data: raw } = useProducts();
  const categories = useCatalogueCategories((raw || []) as CatalogueRow[]);

  return (
    <div className="min-h-screen text-gray-800 antialiased" data-page="categories" style={{ background: '#FFFFFF' }}>
      <header
        className="sticky top-0 z-40 px-3 pb-3"
        style={{ background: '#FFFFFF', paddingTop: 'calc(10px + env(safe-area-inset-top, 0px))' }}
      >
        {/* Title centred on the screen, not in the space beside the back
            button, so it sits in the middle the way a native title bar does. */}
        <div className="relative mx-auto flex h-10 max-w-2xl items-center justify-center">
          <button
            type="button"
            aria-label="Back"
            onClick={() => goBack('/app-home')}
            className="absolute left-0 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-gray-900"
          >
            <BackChevron />
          </button>
          <h1 className="text-[17px] font-semibold tracking-tight text-gray-900">Categories</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-1.5 pb-6">
        {categories.length > 0 && (
          <p className="mb-1.5 px-2 text-[12.5px] text-gray-500">
            {categories.length} {categories.length === 1 ? 'category' : 'categories'}
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          {categories.length === 0
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[178px] animate-pulse rounded-[22px] bg-gray-100" />
              ))
            : categories.map(([folder, info], i) => (
                <CategoryCard key={folder} folder={folder} info={info} index={i} className="w-full" />
              ))}
        </div>
      </main>
    </div>
  );
}
