'use client';

import React, { useEffect, useLayoutEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useProducts, useCategories, useImageMapper } from '@/lib/useSanity';
import { AddToCart } from '@/lib/AddToCart';
import { urlFor } from '@/lib/sanity';
import type { Product as SanityProduct, Category } from '@/types/sanity';
import { sortByFeaturedOrder } from '@/lib/categoryImageKey';
import { setPageMeta, injectJsonLd, removeJsonLd, specialtyUrl, conditionReviewFields, ogImageForFolder, CONDITIONS_OG_IMAGE, ORGANIZATION_ID } from '@/lib/seo';
import { folderDisplayName } from '@/lib/queries';
import { usePageReady } from '@/lib/handoff';
import './CatalogClient.css';
import { goTo } from '@/platform/navigation';
import { CatalogueRow, cartItemFor, displayName, productImage, productUrl, rxRequired, specLine } from '@/lib/catalogueItem';
import { useLang } from '@/lib/i18n';


interface ProductWithCategory extends Omit<SanityProduct, 'category'> {
  category?: Category;
}

// ── Typo-tolerant search matching (Google-style: forgives small misspellings) ──
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = Array.from({ length: bl + 1 }, (_, j) => j);
  const curr = new Array(bl + 1).fill(0);
  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = [...curr];
  }
  return prev[bl];
}

function isCloseMatch(term: string, word: string): boolean {
  if (term.length < 4 || word.length < 4) return false;
  const distance = levenshteinDistance(term, word);
  const maxLen = Math.max(term.length, word.length);
  return 1 - distance / maxLen >= 0.75;
}

// Matches one query word against one field: exact substring first (cheap,
// also catches partial/prefix typing like "pacli"), falling back to a
// typo-tolerant word-level comparison for near-misses — e.g. "paklitaxel"
// or "paclitaxol" still finds "Paclitaxel", the way Google forgives typos.
function termMatchesText(term: string, text: string): boolean {
  if (!text) return false;
  if (text.includes(term)) return true;
  if (term.length < 4) return false;
  return text.split(/\s+/).some(word => isCloseMatch(term, word));
}

// Google-style multi-word search: every word in the query must match
// *somewhere* across the given fields (exact or close-typo) — not
// necessarily the same field or in the same order.
function fieldsMatchSearch(fields: (string | undefined | null)[], search: string): boolean {
  const terms = search.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const lowerFields = fields.filter((f): f is string => !!f).map(f => f.toLowerCase());
  return terms.every(term => lowerFields.some(field => termMatchesText(term, field)));
}


const ITEMS_PER_PAGE = 12;

const SidebarSkeleton = () => (
  <div className="animate-pulse space-y-4 py-4 px-6">
    <div className="h-5 bg-gray-200 rounded-full w-1/2 mb-6" />
    {[1, 2, 3, 4, 5].map(i => (
      <div key={i} className="flex justify-between items-center py-2">
        <div className="h-4 bg-gray-100 rounded-full w-2/3" />
        <div className="h-3 bg-gray-100 rounded-full w-4" />
      </div>
    ))}
  </div>
);

const TableSkeleton = () => (
  <div className="animate-pulse space-y-4 p-6">
    {[1, 2, 3, 4, 5].map(i => (
      <div key={i} className="flex items-center justify-between border-b border-gray-50 pb-4 last:border-0 last:pb-0">
        <div className="flex items-center gap-4 w-1/3">
          <div className="w-12 h-12 bg-gray-100 rounded-xl" />
          <div className="space-y-2 flex-grow">
            <div className="h-4 bg-gray-100 rounded-full w-3/4" />
            <div className="h-3 bg-gray-100 rounded-full w-1/2" />
          </div>
        </div>
        <div className="h-4 bg-gray-100 rounded-full w-24" />
        <div className="h-4 bg-gray-100 rounded-full w-16" />
        <div className="h-8 bg-gray-100 rounded-full w-24" />
      </div>
    ))}
  </div>
);



const formatFieldWithLineBreaks = (text: string | undefined | null) => {
  if (!text) return null;
  const parts = text.split(/\\n|\n/g);
  return parts.map((part, i) => (
    <React.Fragment key={i}>
      {part.trim()}
      {i < parts.length - 1 && <br />}
    </React.Fragment>
  ));
};

// Product name shown in the table/cards is always built straight from the
// brandName/genericName fields.
const getProductDisplayName = (p: { name?: string; brandName?: string; genericName?: string }) =>
  p.brandName && p.genericName && p.brandName !== p.genericName
    ? `${p.brandName} (${p.genericName})`
    : p.name || p.brandName || p.genericName || 'Unnamed Product';

// Categories/subcategories are keyed on the sheet's own Category Folder /
// Condition (+ Condition Slug) columns now (see queries.ts getCategories()),
// so there's no more hardcoded name->slug remap table or cancer/non-cancer
// classification here — a product's own `categoryFolder`/`conditionSlug`
// fields are used directly wherever a URL or slug is needed.
const getProductConditions = (p: { conditions?: string[]; subCategory?: string }) =>
  p.conditions && p.conditions.length ? p.conditions : (p.subCategory ? [p.subCategory] : []);

// "Breast Cancer" -> "Breast Cancer Medicines". A name that already names a product type
// ("Iohexol Contrast Media") is used as-is. Kept in step with conditionHeading() in
// scripts/prerender-slugs.cjs, which writes the same heading into the prerendered page.
const conditionHeading = (name: string) =>
  /\b(medicines?|media)$/i.test(name.trim()) ? name.trim() : `${name.trim()} Medicines`;

// The visible <h1> in Tagalog. The English conditionHeading() stays the SEO heading.
const conditionHeadingTl = (name: string) =>
  /\b(medicines?|media)$/i.test(name.trim()) ? name.trim() : `Mga Gamot sa ${name.trim()}`;

/**
 * One product in the two-across mobile grid. The same card as the home screen's
 * featured products — packshot over a soft brand wash, Rx / stock pills on the
 * image, frosted Inquire + request-list buttons — scaled down to half a screen.
 * The whole card opens the product page, which is where the inquiry form is.
 */
function ProductGridCard({ p }: { p: CatalogueRow }) {
  const { tr } = useLang();
  const needsRx = rxRequired(p);
  const inStock = p.availability !== false;
  return (
    <a
      href={productUrl(p)}
      className="relative flex flex-col overflow-hidden rounded-[20px] border border-gray-100 bg-white p-1.5 transition active:scale-[0.98]"
    >
      <div
        className="relative h-[132px] overflow-hidden rounded-[15px]"
        style={{ background: 'linear-gradient(135deg,#E6F4FC 0%,#F3F8FB 50%,#EEF7E9 100%)' }}
      >
        <span aria-hidden="true" className="pointer-events-none absolute -left-8 -top-8 h-28 w-28 rounded-full blur-2xl" style={{ background: 'rgba(29,159,218,.18)' }} />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-10 -right-6 h-28 w-28 rounded-full blur-2xl" style={{ background: 'rgba(97,166,68,.16)' }} />
        <img
          src={productImage(p)}
          alt=""
          loading="lazy"
          className="relative h-full w-full object-contain p-3 mix-blend-multiply"
          onError={(e) => { const i = e.currentTarget; i.onerror = null; i.src = '/assets/no-image.png'; }}
        />
        <div className="absolute left-2 top-2 flex flex-wrap items-center gap-1">
          {needsRx && (
            <span className="rounded-full bg-[#E8F5FC] px-1.5 py-[1px] text-[9px] font-semibold text-[#1D9FDA]">Rx</span>
          )}
          {inStock ? (
            <span className="rounded-full bg-[#EEF6EA] px-1.5 py-[1px] text-[9px] font-semibold text-[#4E8F35]">{tr('In stock', 'In stock')}</span>
          ) : (
            <span className="rounded-full bg-red-50 px-1.5 py-[1px] text-[9px] font-semibold text-red-500">{tr('Out of stock', 'Wala nang stock')}</span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col px-1.5 pb-1 pt-2.5">
        <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-gray-900">{displayName(p)}</h3>
        <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-400">{specLine(p)}</p>

        {/* Small and flat: a quiet text pill plus the round request-list icon, so
            two cards side by side don't turn into a wall of buttons. */}
        <div className="mt-auto flex items-center gap-1.5 pt-2.5">
          <span className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-full bg-primary text-[11px] font-semibold text-white">
            {tr('Inquire', 'Magtanong')}
            <i className="fa-solid fa-arrow-right text-[9px]" />
          </span>
          <span className="contents [&>button]:h-8 [&>button]:w-8 [&_i]:text-[11px]">
            <AddToCart item={cartItemFor(p)} />
          </span>
        </div>
      </div>
    </a>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function CatalogClient(_props: { initialFolder?: string } = {}) {
  const { tr, lang } = useLang();
  const { getImage, categoryImages } = useImageMapper('product-range');
  const { data: productsDataRaw, loading: productsLoading } = useProducts();
  const productsData = productsDataRaw as ProductWithCategory[] | null;
  const { data: categoriesData, loading: categoriesLoading } = useCategories();
  // Swaps out the prerendered listing once the live one has its products and categories.
  usePageReady(!productsLoading && !categoriesLoading);

  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<{ category: string; subCategory: string }>({
    category: 'All',
    subCategory: 'All'
  });
  // Narrows the selected category to a single Category Folder, and is only ever set by
  // resolving a folder URL. A category filed under two folders (Endocrinology, under both
  // hormonal-therapy and diabetes-medicines) would otherwise show the same full product
  // list at both URLs; this keeps /diabetes-medicines to the products actually filed there.
  // Cleared whenever the category is chosen from the UI instead of the URL, so clicking
  // "Endocrinology" in the sidebar still shows all of it.
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  // Guards the localStorage-save effect: stays false until the restore-from-localStorage
  // effect has actually run once categories are loaded. Without this, the save effect fires
  // on first mount with the default {All, All} state and clobbers the real saved selection
  // before it's ever read back.
  const hasRestoredCategoryRef = useRef(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [sortBy, setSortBy] = useState('Default');
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('getmeds-search-history');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('getmeds-category-counts');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeFlyoutCat, setActiveFlyoutCat] = useState<any | null>(null);
  const [flyoutVisible, setFlyoutVisible] = useState(false);
  const [inquiryDropdown, setInquiryDropdown] = useState<{
    rowId: string;
    product: ProductWithCategory;
    top: number;
    left: number;
    width: number;
  } | null>(null);

  // Same wording as the inquiry form on product-detail, because picking one here
  // is what lands you there — the label must not change under you on the way.
  // The values are the ?userType= that page reads, so they stay as they are.
  const USER_TYPE_OPTIONS = [
    { label: 'Patient / Family',                      labelTl: 'Pasyente / Pamilya',                value: 'patient'  },
    { label: 'Doctor / Healthcare Professional',      labelTl: 'Doktor / Healthcare Professional',  value: 'doctor'   },
    { label: 'Distributor / Pharmacy',                labelTl: 'Distributor / Botika',              value: 'pharmacy' },
    { label: 'Hospital / Institution',                labelTl: 'Ospital / Institusyon',             value: 'hospital' },
  ];

  const navigateWithUserType = (p: ProductWithCategory, userType: string) => {
    const url = getProductDetailUrl(p) + `?userType=${userType}`;
    goTo(url);
  };

  // Positions the inquiry dropdown as a fixed-position portal anchored to the
  // trigger button's rect, so it renders above the table/card instead of being
  // clipped by the table's scroll container or covered by the floating chat widget.
  const toggleInquiryDropdown = (e: React.MouseEvent, rowId: string, p: ProductWithCategory, mode: 'fixed' | 'fill') => {
    e.stopPropagation();
    if (inquiryDropdown?.rowId === rowId) {
      setInquiryDropdown(null);
      return;
    }
    const wrapper = (e.currentTarget as HTMLElement).closest('.inquiry-dropdown-wrapper') as HTMLElement;
    const rect = wrapper.getBoundingClientRect();
    const width = mode === 'fill' ? rect.width : 256;
    const dropdownHeight = USER_TYPE_OPTIONS.length * 40 + 16;
    const openUpward = rect.bottom + dropdownHeight > window.innerHeight;
    let left = mode === 'fill' ? rect.left : rect.right - width;
    const maxLeft = window.innerWidth - width - 8;
    if (left > maxLeft) left = maxLeft;
    if (left < 8) left = 8;
    const top = openUpward ? rect.top - dropdownHeight - 8 : rect.bottom + 8;
    setInquiryDropdown({ rowId, product: p, top, left, width });
  };

  const openFlyout = (cat: any) => {
    if (activeFlyoutCat?.name === cat.name && flyoutVisible) {
      setFlyoutVisible(false);
      setTimeout(() => setActiveFlyoutCat(null), 450);
      return;
    }
    setFlyoutVisible(false);
    setActiveFlyoutCat(cat);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFlyoutVisible(true);
      });
    });
  };

  const closeFlyout = () => {
    setFlyoutVisible(false);
    setTimeout(() => setActiveFlyoutCat(null), 450);
  };

  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const query = urlParams.get('search');
    if (query) setSearchTerm(query);

    const handleClick = (e: MouseEvent) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
      // Close inquiry dropdown if click is outside the trigger wrapper or the portaled menu itself
      const target = e.target as HTMLElement;
      if (!target.closest('.inquiry-dropdown-wrapper') && !target.closest('.inquiry-dropdown-portal')) {
        setInquiryDropdown(null);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Close the inquiry dropdown on scroll since it's fixed-position and won't
  // follow the table/card it's anchored to.
  useEffect(() => {
    if (!inquiryDropdown) return;
    const closeOnScroll = () => setInquiryDropdown(null);
    window.addEventListener('scroll', closeOnScroll, true);
    return () => window.removeEventListener('scroll', closeOnScroll, true);
  }, [inquiryDropdown]);

  // Process dynamic categories into 4 columns using Jaccard Similarity Graph Grouping (sim >= 0.5)
  // Process dynamic categories directly from Sanity (no redundant grouping)
  const processedCats = useMemo(() => {
    if (!categoriesData) return [];

    const mapped = categoriesData
      .filter((cat) => cat.category && cat.slug?.current && cat.subcategory && Array.isArray(cat.subcategory) && cat.subcategory.length > 0)
      .map((cat) => ({
        category: cat.category,
        folders: (cat.folders && cat.folders.length ? cat.folders : [cat.slug.current]),
        slug: cat.slug.current,
        subcategory: (cat.subcategory || []).filter(Boolean)
      }));

    // Featured categories (Studio's "Category Featured" tab, drag-ordered) show first, in that
    // order; everything else keeps its existing (alphabetical) relative order, after them. Drives
    // both the sidebar list and the Therapeutic Areas filter, which both consume this array.
    return sortByFeaturedOrder(mapped, (cat) => cat.category, categoryImages);
  }, [categoriesData, categoryImages]);

  // Helper to resolve condition by slug or display name
  const resolveConditionName = (target: string, cats: typeof processedCats) => {
    const cleanTarget = target.trim().toLowerCase();
    for (const cat of cats) {
      const sub = cat.subcategory.find(s => {
        const sLower = s.toLowerCase();
        const sSlug = sLower.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        return sLower === cleanTarget || sSlug === cleanTarget;
      });
      if (sub) {
        return { category: cat.category, subCategory: sub };
      }
    }
    return null;
  };

  // Restore the selected category/subcategory from URL or localStorage
  useEffect(() => {
    // Must run at most once. processedCats gets recomputed (new array reference) more than
    // once as categoriesData/categoryImages settle asynchronously, each of which re-triggers
    // this effect — without this guard, every recompute re-ran the *entire* priority cascade
    // below from scratch. That's harmless for a category reachable via its own URL segment
    // (step 2 resolves it identically every time), but for a category whose Category Folder is
    // literally "cancer-medicines" (Oncology) — a folder step 2 deliberately treats as the
    // generic/ambiguous "all products" route, not a specific-category signal — resolution can
    // ONLY come from the localStorage fallback (step 4). A second run of this effect landing
    // between the first run's `setSelectedCategory` and its knock-on save-to-localStorage effect
    // could read back a not-yet-updated localStorage value and silently reset the selection to
    // "All" right after correctly resolving it — this guard makes that impossible.
    if (hasRestoredCategoryRef.current) return;
    if (processedCats.length > 0) {
      let resolved = false;

      // 1. Check if URL path has condition segment (e.g. /conditions/breast-cancer or /cancer-medicines/breast-cancer)
      const pathParts = typeof window !== 'undefined' ? window.location.pathname.split('/').filter(Boolean) : [];
      if (pathParts.length >= 2) {
        const urlParam = decodeURIComponent(pathParts[1]);
        const match = resolveConditionName(urlParam, processedCats);
        if (match) {
          setSelectedCategory(match);
          setCurrentPage(1);
          resolved = true;
        }
      }

      // 2. Check if URL path has 1 segment matching a category folder slug or category name (e.g.
      // /bone-health-medicines, /antibiotics, /heart-medicines, /cancer-medicines). "cancer-medicines"
      // used to be excluded here and treated purely as the generic "all products" route, but it's
      // also Oncology's real Category Folder — that made Oncology the only category unable to
      // resolve directly from its own URL, forced to depend on the (racier) localStorage fallback
      // below instead. "product-range" stays the true generic/no-specific-category route (that's
      // what the nav's "Product Range" link and the "All Products" reset both target), and
      // "conditions" stays excluded since it's the separate condition-hub namespace, not a category.
      if (!resolved && pathParts.length >= 1) {
        const firstSeg = decodeURIComponent(pathParts[0]).trim().toLowerCase();
        // The navbar's global search box redirects to "/cancer-medicines?search=..." expecting an
        // all-products search, not one scoped to Oncology — so a `search` param on that specific
        // path still takes the generic/no-category treatment, exactly like before this change.
        const hasSearchParam = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('search');
        const isGenericRoute = firstSeg === 'product-range' || firstSeg === 'conditions'
          || (firstSeg === 'cancer-medicines' && hasSearchParam);
        if (!isGenericRoute) {
          const matchedCat = processedCats.find(c => {
            // Every folder, not just c.slug (which is only the first one the sheet
            // happened to list) — otherwise the second folder of a category that spans
            // two is unreachable and silently falls through to "all products" below.
            const catFolders = c.folders.map(f => (f || '').toLowerCase());
            const catNameSlug = c.category.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            const catNameLower = c.category.toLowerCase();
            return catFolders.includes(firstSeg) || catNameSlug === firstSeg || catNameLower === firstSeg;
          });
          if (matchedCat) {
            setSelectedCategory({ category: matchedCat.category, subCategory: 'All' });
            // Only scope to the folder when the URL segment IS one of this category's
            // folders — it can also have matched on the category's name, which is not a
            // folder and would filter every product out.
            setActiveFolder(matchedCat.folders.includes(firstSeg) ? firstSeg : null);
            setCurrentPage(1);
            resolved = true;
          }
        }
      }

      // 2. Check query param (e.g. ?category=breast-cancer)
      if (!resolved && typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const categoryFromUrl = urlParams.get('category');
        if (categoryFromUrl) {
          const match = resolveConditionName(categoryFromUrl, processedCats);
          if (match) {
            setSelectedCategory(match);
            setCurrentPage(1);
            resolved = true;
          }
        }
      }

      // 3. Fallback to localStorage saved selection
      if (!resolved) {
        const savedCategoryStr = localStorage.getItem('selectedCategory');
        if (savedCategoryStr) {
          let savedObj: { category?: string; subCategory?: string } | null = null;
          try {
            savedObj = JSON.parse(savedCategoryStr);
          } catch {
            if (savedCategoryStr) {
              savedObj = { category: 'All', subCategory: savedCategoryStr };
            }
          }

          if (savedObj) {
            const searchSub = (savedObj.subCategory || '').trim();
            const searchCat = (savedObj.category || '').trim();

            if (searchSub && searchSub.toLowerCase() !== 'all') {
              const match = resolveConditionName(searchSub, processedCats);
              if (match) {
                setSelectedCategory(match);
                setCurrentPage(1);
                resolved = true;
              }
            }

            if (!resolved && searchCat && searchCat.toLowerCase() !== 'all') {
              const matchedCat = processedCats.find(c => c.category.toLowerCase() === searchCat.toLowerCase());
              if (matchedCat) {
                setSelectedCategory({ category: matchedCat.category, subCategory: 'All' });
                setCurrentPage(1);
                resolved = true;
              }
            }
          }
        }
      }

      if (!resolved) {
        setSelectedCategory({ category: 'All', subCategory: 'All' });
        setCurrentPage(1);
      }

      hasRestoredCategoryRef.current = true;
    }
  }, [processedCats]);

  // Save selected category/subcategory to localStorage as a JSON object. Skipped until
  // the restore effect above has actually run — otherwise this fires on mount with the
  // default {All, All} state and overwrites the real saved selection before it's read back.
  useEffect(() => {
    if (!hasRestoredCategoryRef.current) return;
    localStorage.setItem('selectedCategory', JSON.stringify(selectedCategory));
  }, [selectedCategory]);

  const getProductImage = (p: ProductWithCategory, size?: number) => {
    if (p.image && p.image.asset) {
      try {
        if (size) {
          return urlFor(p.image).width(size).height(size).url();
        }
        return urlFor(p.image).url();
      } catch (err) {
        console.error('Error generating image URL:', err);
      }
    }

    return '/assets/no-image.png';
  };

  const getCategorizationDisplay = (p: ProductWithCategory) => {
    const subcats = getProductConditions(p);
    if (subcats.length === 0) {
      return p.category?.category || 'General';
    }
    if (selectedCategory.subCategory !== 'All') {
      const matched = subcats.find(sub => sub && typeof sub === 'string' && sub.toLowerCase() === selectedCategory.subCategory.toLowerCase());
      if (matched) {
        return matched;
      }
    }
    return subcats.join(' / ');
  };

  const sidebarCategories = useMemo(() => {
    return processedCats.map(cat => ({
      _id: cat.slug,
      name: cat.category,
      subItems: cat.subcategory.map(sub => ({ label: sub }))
    }));
  }, [processedCats]);

  const getFiltered = (sel: { category: string; subCategory: string }) => {
    if (!productsData) return [];
    if (sel.category === 'All' && sel.subCategory === 'All') return productsData;

    const cleanCategory = sel.category.trim().toLowerCase();
    const cleanSub = (sel.subCategory || '').trim().toLowerCase();

    // Each processed category is keyed on its Category Folder (queries.ts
    // getCategories()), so matching a product to its parent category is just
    // an exact categoryFolder comparison — no more combined-name splitting.
    const matchedProcessed = processedCats.find(
      c => c.category.trim().toLowerCase() === cleanCategory
    );

    const matchesParentCategory = (p: ProductWithCategory) => {
      if (!cleanCategory || cleanCategory === 'all') return true;

      const pCat = (p.excelCategory || (typeof p.category === 'string' ? p.category : p.category?.category) || '').trim().toLowerCase();
      const pFolder = (p.categoryFolder || '').trim().toLowerCase();

      // Arrived here via a folder URL for a category spanning several folders — keep the
      // listing to that folder so each URL shows a distinct set of products.
      if (activeFolder) return pFolder === activeFolder;

      if (matchedProcessed) {
        return pCat === cleanCategory || pFolder === matchedProcessed.slug || pFolder === cleanCategory;
      }
      return pCat === cleanCategory || pFolder === cleanCategory;
    };

    if (cleanSub && cleanSub !== 'all') {
      // A condition is always scoped to its parent category folder — otherwise two
      // categories that happen to share a condition label would leak into each other.
      return productsData.filter(p => {
        if (!matchesParentCategory(p)) return false;
        const conditions = getProductConditions(p);
        return conditions.some(part => part.toLowerCase() === cleanSub);
      });
    }

    if (matchedProcessed) {
      return productsData.filter(matchesParentCategory);
    }

    // Fallback: category isn't a known processed category — search by condition name directly
    return productsData.filter(p => {
      const conditions = getProductConditions(p);
      return conditions.some(part => part.toLowerCase() === cleanCategory);
    });
  };

  const sorted = useMemo(() => {
    const categoryFiltered = getFiltered(selectedCategory);

    const searchFiltered = searchTerm
      ? categoryFiltered.filter(p => {
          const categoryText = p.excelCategory || (typeof p.category === 'string' ? p.category : p.category?.category);
          const conditions = getProductConditions(p);
          return fieldsMatchSearch(
            [p.name, p.brandName, p.genericName, p.subCategory, categoryText, p.categoryFolder, ...conditions],
            searchTerm
          );
        })
      : categoryFiltered;

    return [...searchFiltered].sort((a, b) => {
      const nameA = (a.brandName || a.name || '').toLowerCase();
      const nameB = (b.brandName || b.name || '').toLowerCase();
      if (sortBy === 'Name: A → Z') return nameA.localeCompare(nameB);
      if (sortBy === 'Name: Z → A') return nameB.localeCompare(nameA);
      if (sortBy === 'In Stock First') {
        const avA = a.availability === false ? 1 : 0;
        const avB = b.availability === false ? 1 : 0;
        return avA - avB;
      }
      if (sortBy === 'Form: A → Z') return (a.form || '').localeCompare(b.form || '');
      return 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsData, categoriesData, processedCats, selectedCategory, activeFolder, searchTerm, sortBy]);

  // ── Search History & Suggestions Logic ──────────────────
  const onEnterSearch = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed || !productsData) return;

    // 1. Save to search history (deduped, most recent first, max 10)
    setSearchHistory(prev => {
      const filtered = prev.filter(h => h.toLowerCase() !== trimmed.toLowerCase());
      const next = [trimmed, ...filtered].slice(0, 10);
      localStorage.setItem('getmeds-search-history', JSON.stringify(next));
      return next;
    });

    // 2. Find matching products and increment their category counts
    const matchedProducts = productsData.filter(p =>
      fieldsMatchSearch([p.name, p.brandName, p.genericName], trimmed)
    );

    if (matchedProducts.length > 0) {
      setCategoryCounts(prev => {
        const next = { ...prev };
        const seenCats = new Set<string>();
        matchedProducts.forEach(p => {
          const cat = p.category?.category || '';
          const cats = cat.split('/').map(s => s.trim()).filter(Boolean);
          cats.forEach(c => {
            if (c && !seenCats.has(c)) {
              seenCats.add(c);
              next[c] = (next[c] || 0) + 1;
            }
          });
        });
        localStorage.setItem('getmeds-category-counts', JSON.stringify(next));
        return next;
      });
    }
  };

  const removeSearchHistoryItem = (item: string) => {
    setSearchHistory(prev => {
      const next = prev.filter(h => h !== item);
      localStorage.setItem('getmeds-search-history', JSON.stringify(next));
      return next;
    });
  };

  const clearSearchHistory = () => {
    setSearchHistory([]);
    setCategoryCounts({});
    localStorage.removeItem('getmeds-search-history');
    localStorage.removeItem('getmeds-category-counts');
  };

  const suggestedProducts = useMemo(() => {
    if (!productsData || productsData.length === 0) return [];

    const MAX_SUGGESTIONS = 5;

    // If no category counts, show 5 random products
    if (Object.keys(categoryCounts).length === 0) {
      const shuffled = [...productsData].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, MAX_SUGGESTIONS);
    }

    // Sort categories by count descending
    const sortedCats = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat);

    const suggestions: ProductWithCategory[] = [];
    const usedIds = new Set<string>();

    for (const cat of sortedCats) {
      if (suggestions.length >= MAX_SUGGESTIONS) break;
      const catProducts = productsData.filter(
        p => {
          const pCat = p.category?.category || p.excelCategory || '';
          const pCats = pCat.split('/').map(s => s.trim().toLowerCase()).filter(Boolean);
          return pCats.includes(cat.toLowerCase()) && !usedIds.has(p._id);
        }
      );
      // Shuffle within category so it's not always the same order
      const shuffled = [...catProducts].sort(() => Math.random() - 0.5);
      const remaining = MAX_SUGGESTIONS - suggestions.length;
      const toAdd = shuffled.slice(0, remaining);
      toAdd.forEach(p => {
        suggestions.push(p);
        usedIds.add(p._id);
      });
    }

    // If still fewer than MAX, fill with random products from other categories
    if (suggestions.length < MAX_SUGGESTIONS) {
      const remaining = MAX_SUGGESTIONS - suggestions.length;
      const others = productsData
        .filter(p => !usedIds.has(p._id))
        .sort(() => Math.random() - 0.5)
        .slice(0, remaining);
      suggestions.push(...others);
    }

    return suggestions;
  }, [productsData, categoryCounts]);

  const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE);
  const paginated = sorted.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const toggleCat = (name: string) => {
    setOpenCategories(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Strips a bare domain-prefixed URL from the sheet (e.g. "getmeds.ph/conditions/x", with or
  // without a protocol) down to just its path, e.g. "/conditions/x" — same pattern already
  // used for productPageUrl below.
  const toPath = (url: string) => '/' + url.replace(/^https?:\/\//, '').replace(/^[^/]+\/?/, '');

  // Condition/subcategory name (lowercased) -> its precomputed "Condition Hub URL (Auto)"
  // path, sourced straight from the product catalog (each product carries its own
  // conditionHubUrl plus a conditionSlugsByName map for every condition it's linked to — see
  // fetchProductsFromExcel() in src/lib/queries.ts). This is the DB's canonical URL for a
  // condition; selectCategory() below prefers it over self-slugifying the name.
  const conditionHubPaths = useMemo(() => {
    const map = new Map<string, string>();
    productsData?.forEach((p: any) => {
      if (p.subCategory && p.conditionHubUrl && !map.has(p.subCategory.toLowerCase())) {
        map.set(p.subCategory.toLowerCase(), toPath(p.conditionHubUrl));
      }
      Object.entries(p.conditionSlugsByName || {}).forEach(([name, info]: [string, any]) => {
        if (info?.conditionHubUrl && !map.has(name.toLowerCase())) {
          map.set(name.toLowerCase(), toPath(info.conditionHubUrl));
        }
      });
    });
    return map;
  }, [productsData]);

  // Per-condition metadata (Filipino term, specialty, pharmacist review) keyed by condition
  // name. Conditions have no document type of their own, so the sheet repeats these values
  // on every product row filed under the condition — first non-empty wins, same shape as
  // conditionHubPaths above. Mirrors mergeConditionMeta() in scripts/prerender-slugs.cjs.
  const conditionMeta = useMemo(() => {
    const map = new Map<string, { filipinoName?: string; specialty?: string; lastReviewed?: string; reviewedBy?: string }>();
    productsData?.forEach((p: any) => {
      const key = (p.subCategory || '').trim().toLowerCase();
      if (!key) return;
      const entry = map.get(key) || {};
      if (!entry.filipinoName && p.conditionFilipinoName) entry.filipinoName = String(p.conditionFilipinoName).trim();
      if (!entry.specialty && p.conditionSpecialty) entry.specialty = String(p.conditionSpecialty).trim();
      if (!entry.lastReviewed && p.conditionLastReviewed) entry.lastReviewed = String(p.conditionLastReviewed).trim();
      if (!entry.reviewedBy && p.conditionReviewedBy) entry.reviewedBy = String(p.conditionReviewedBy).trim();
      map.set(key, entry);
    });
    return map;
  }, [productsData]);

  // Synchronize title, meta description, canonical, OG, and structured data to the
  // active category/condition. Previously this only patched document.title, so search
  // engines and social previews saw the Cancer Medicines default on every one of the
  // 14 category pages and 79 condition pages regardless of what was actually selected.
  // Placed after conditionHubPaths/getFiltered/processedCats above (not before) — this
  // effect's dependency array is evaluated during render, so referencing a const that's
  // declared later in the component throws "Cannot access before initialization".
  useEffect(() => {
    const sectionLabel = selectedCategory.category !== 'All' ? selectedCategory.category : 'Products';
    const displayLabel = selectedCategory.subCategory !== 'All' ? selectedCategory.subCategory : selectedCategory.category;
    const isCondition = displayLabel !== 'All' && selectedCategory.subCategory !== 'All';

    const matchedCat = processedCats.find(c => c.category.toLowerCase() === selectedCategory.category.toLowerCase());
    const path = isCondition
      ? conditionHubPaths.get(selectedCategory.subCategory.toLowerCase())
        ?? (matchedCat?.slug ? `/${matchedCat.slug}/${selectedCategory.subCategory.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}` : undefined)
      // activeFolder first: for a category spanning several folders this is the folder the
      // visitor actually arrived at, and each folder is a distinct page with its own
      // products, so it must be self-canonical rather than pointing at matchedCat.slug
      // (which is only ever the category's first folder).
      : activeFolder ? `/${activeFolder}`
      : matchedCat?.slug ? `/${matchedCat.slug}` : undefined;

    if (displayLabel === 'All') {
      setPageMeta({
        title: 'Products',
        description: "Browse Getmeds' full range of specialty pharmaceutical products across oncology, hematology, cardiology, and other therapeutic areas in the Philippines.",
        path: path || '/product-range',
      });
      // Mirrors the CollectionPage prerendered for /product-range and /conditions.
      injectJsonLd('jsonld-medical-webpage', {
        '@type': 'CollectionPage',
        name: 'Product Range — Getmeds Philippines',
        url: `${window.location.origin}${path || '/product-range'}`,
      });
      // "All Products" is the only crumb this view shows, and a one-item BreadcrumbList
      // tells a crawler nothing — drop any block left over from a previous selection.
      removeJsonLd('jsonld-breadcrumb');
      return;
    }

    // Real per-condition/category description, built from the products actually filed
    // under it — there is no dedicated Sanity description field for conditions/categories,
    // so this is generated from live product data rather than invented copy.
    const sampleNames = getFiltered(selectedCategory).slice(0, 3).map(getProductDisplayName).filter(Boolean);
    const description = sampleNames.length
      ? `Browse Getmeds' ${displayLabel} medicines available in the Philippines, including ${sampleNames.join(', ')}. FDA Philippines-licensed distributor, prescription-based ordering, nationwide delivery.`
      : `Browse Getmeds' ${displayLabel} medicines available in the Philippines. FDA Philippines-licensed distributor, prescription-based ordering, nationwide delivery.`;

    // On a category page displayLabel and sectionLabel are both the category name, which
    // rendered as "Endocrinology - Endocrinology". A category page is titled by its own
    // label alone; only a condition gets the "<condition> - <category>" pairing.
    // The folder qualifier disambiguates the one category filed under two folders, whose
    // two URLs are separate pages and would otherwise share a title.
    const folderQualifier = !isCondition && activeFolder && matchedCat && matchedCat.folders.length > 1
      ? ` — ${folderDisplayName(activeFolder)}`
      : '';

    setPageMeta({
      title: isCondition ? `${displayLabel} - ${sectionLabel}` : `${displayLabel}${folderQualifier}`,
      description,
      path,
      // Same cards scripts/prerender-slugs.cjs bakes in for conditions and category folders.
      image: isCondition ? CONDITIONS_OG_IMAGE : ogImageForFolder(activeFolder || matchedCat?.slug),
    });

    // Mirrors the BreadcrumbList baked in by scripts/prerender-slugs.cjs under this same
    // id, and matches the visible trail rendered below ("All Products > Category >
    // Condition"). The final crumb carries no "item" — it is the current page.
    const categoryPath = activeFolder ? `/${activeFolder}` : matchedCat?.slug ? `/${matchedCat.slug}` : undefined;
    const crumbs: Array<{ name: string; url?: string }> = [
      { name: 'All Products', url: '/product-range' },
      ...(isCondition && selectedCategory.category !== 'All'
        ? [{ name: selectedCategory.category, ...(categoryPath ? { url: categoryPath } : {}) }]
        : []),
      { name: isCondition ? displayLabel : `${displayLabel}${folderQualifier}` },
    ];
    injectJsonLd('jsonld-breadcrumb', {
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((crumb, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: crumb.name,
        ...(crumb.url && i < crumbs.length - 1 ? { item: `${window.location.origin}${crumb.url}` } : {}),
      })),
    });

    if (isCondition) {
      // Kept field-for-field in step with the block scripts/prerender-slugs.cjs bakes in
      // under this same id — this overwrites that one on hydration.
      const meta = conditionMeta.get(displayLabel.toLowerCase()) || {};
      const specialty = specialtyUrl(meta.specialty);
      injectJsonLd('jsonld-medical-webpage', {
        '@type': 'MedicalWebPage',
        name: `${displayLabel} Medicines in the Philippines`,
        description,
        inLanguage: 'en-PH',
        about: {
          '@type': 'MedicalCondition',
          name: displayLabel,
          ...(meta.filipinoName ? { alternateName: meta.filipinoName } : {}),
        },
        ...(specialty ? { specialty } : {}),
        ...(path ? { url: `${window.location.origin}${path}` } : {}),
        ...conditionReviewFields(meta.lastReviewed, meta.reviewedBy),
        publisher: { '@id': ORGANIZATION_ID },
      });
    } else {
      // Matches the CollectionPage baked in by scripts/prerender-slugs.cjs under this same
      // id — removing it here would strip the prerendered block on hydration.
      injectJsonLd('jsonld-medical-webpage', {
        '@type': 'CollectionPage',
        name: `${displayLabel}${folderQualifier} Medicines in the Philippines`,
        ...(path ? { url: `${window.location.origin}${path}` } : {}),
      });
    }
  }, [selectedCategory, activeFolder, productsData, processedCats, conditionHubPaths, conditionMeta]);

  const getProductDetailUrl = (p: ProductWithCategory) => {
    // productPageUrl from the sheet has no protocol (e.g. "getmeds.ph/cancer-medicines/..."),
    // so the leading domain segment has to be stripped even without an "https://" to match.
    if (p.productPageUrl) {
      return toPath(p.productPageUrl);
    }
    return `/${p.categoryFolder || 'product-range'}/${p.slug?.current || ''}`;
  };

  const selectCategory = (category: string, subCategory: string = 'All') => {
    setSelectedCategory({ category, subCategory });
    // Chosen from the UI rather than a folder URL, so show the whole category.
    setActiveFolder(null);
    setCurrentPage(1);
    scrollToTable();

    if (typeof window !== 'undefined') {
      const matched = processedCats.find(c => c.category.toLowerCase() === category.toLowerCase());
      if (matched && matched.slug) {
        const targetPath = subCategory !== 'All'
          ? conditionHubPaths.get(subCategory.toLowerCase())
            ?? `/${matched.slug}/${subCategory.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`
          : `/${matched.slug}`;
        if (window.location.pathname !== targetPath) {
          window.history.pushState(null, '', targetPath);
        }
      } else if (category === 'All' && subCategory === 'All') {
        // Pushes to "/product-range" specifically, not "/cancer-medicines" — that's now Oncology's
        // own resolvable category route (see the restore effect above), so reloading it must show
        // Oncology, not silently reset back to "All".
        if (window.location.pathname !== '/product-range' && window.location.pathname !== '/cancer-medicines') {
          window.history.pushState(null, '', '/product-range');
        }
      }
    }
  };

  const openModal = (product: ProductWithCategory) => {
    goTo(getProductDetailUrl(product));
  };


  const getPageRange = (current: number, total: number): (number | string)[] => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | string)[] = [];
    if (current <= 4) {
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push('...'); pages.push(total);
    } else if (current >= total - 3) {
      pages.push(1); pages.push('...');
      for (let i = total - 4; i <= total; i++) pages.push(i);
    } else {
      pages.push(1); pages.push('...');
      pages.push(current - 1); pages.push(current); pages.push(current + 1);
      pages.push('...'); pages.push(total);
    }
    return pages;
  };

  // Scrolls the product list's own scroll container back to the top (hero
  // section) on page change. Using scrollIntoView on tableRef here caused
  // mobile Safari/Chrome to land near the footer instead — once the page
  // content re-renders with a different item count, the element's position
  // shifts and scrollIntoView's target ends up miscalculated. Setting
  // scrollTop directly on the container is unambiguous regardless of layout.
  const scrollToTable = () => {
    setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }
      if (typeof window !== 'undefined') {
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        if (document.documentElement) {
          document.documentElement.scrollTop = 0;
        }
      }
    }, 50);
  };

  const isCatParentActive = (cat: any) =>
    selectedCategory.category === cat.name;

  const displayCategory = selectedCategory.subCategory !== 'All' ? selectedCategory.subCategory : selectedCategory.category;
  const conditionName = selectedCategory.subCategory !== 'All' ? selectedCategory.subCategory : '';

  // The layout renders the navbar above this page; size the h-screen shell to the
  // space below it (the original rendered the navbar inside the same shell).
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const nav = document.getElementById('global-nav-wrapper');
    const apply = () => {
      if (rootRef.current) rootRef.current.style.setProperty('--catalog-nav-h', `${nav ? nav.offsetHeight : 0}px`);
    };
    apply();
    if (!nav || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(apply);
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);

  // The original rendered the footer inside the scroll column (#footer-container). Here the
  // layout owns the footer, so once the live page is showing, the layout's <footer> element
  // is moved into that slot, and put back where it was when this page unmounts.
  const footerSlotRef = useRef<HTMLDivElement>(null);
  const pageDataReady = !productsLoading && !categoriesLoading;
  useLayoutEffect(() => {
    if (!pageDataReady) return;
    const footer = document.getElementById('site-footer');
    const slot = footerSlotRef.current;
    const home = footer?.parentNode;
    if (!footer || !slot || !home || slot.contains(footer)) return;
    const nextSibling = footer.nextSibling;
    slot.appendChild(footer);
    return () => {
      if (nextSibling && nextSibling.parentNode === home) home.insertBefore(footer, nextSibling);
      else home.appendChild(footer);
    };
  }, [pageDataReady]);

  return (
    <div ref={rootRef} style={{ fontFamily: "'Poppins', sans-serif" }} className="catalog-root bg-white text-gray-800 antialiased flex flex-col overflow-hidden">
      {/* BODY ROW */}
      <div className="flex flex-1 min-h-0 relative">

        {/* SIDEBAR */}
        <aside
          className="shrink-0 overflow-y-auto z-40 hidden lg:flex flex-col bg-white border-r border-gray-100 sidebar-scroll relative"
          style={{ width: sidebarOpen ? '256px' : '0px', minWidth: 0, transition: 'width 0.3s ease', overflow: sidebarOpen ? 'auto' : 'hidden' }}
        >
          <div className="px-5 py-4 border-b border-gray-100 whitespace-nowrap flex items-center justify-between">
            <p className="text-[15px] font-semibold text-gray-500">{tr('Categories', 'Mga Kategorya')}</p>
            <button
              onClick={() => setSidebarOpen(false)}
              className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors shrink-0"
              title={tr('Collapse sidebar', 'Isara ang sidebar')}
            >
              <i className="fa-solid fa-chevron-left text-[15px] text-gray-500" />
            </button>
          </div>
          <nav className="px-3 py-3 space-y-0.5">
            <button
              onClick={() => selectCategory('All', 'All')}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-[10px] text-[13px] font-semibold transition-all duration-200"
              style={selectedCategory.category === 'All' && !flyoutVisible
                ? { background: 'linear-gradient(to right, #61A644, #1D9FDA)', color: '#fff' }
                : { color: '#374151' }}
            >
              <span>{tr('All Products', 'Lahat ng Produkto')}</span>
            </button>
            {categoriesLoading ? (
              <SidebarSkeleton />
            ) : (
              sidebarCategories.map(cat => (
                <button
                   key={cat.name}
                   onClick={() => openFlyout(cat)}
                   className="w-full flex items-center justify-between px-4 py-2.5 rounded-[10px] text-[13px] font-semibold transition-all duration-200 hover:bg-gray-50 group"
                   style={(flyoutVisible ? activeFlyoutCat?.name === cat.name : isCatParentActive(cat))
                     ? { background: 'linear-gradient(to right, #61A644, #1D9FDA)', color: '#fff' }
                     : { color: '#374151' }}
                >
                  <span className="text-left leading-snug truncate">{cat.name}</span>
                </button>
              ))
            )}
          </nav>
        </aside>

        {/* FLYOUT BACKDROP */}
        {activeFlyoutCat && (
          <div
            className="absolute inset-0 z-20"
            style={{
              backdropFilter: flyoutVisible ? 'blur(4px)' : 'blur(0px)',
              background: flyoutVisible ? 'rgba(0,0,0,0.08)' : 'transparent',
              transition: 'backdrop-filter 0.4s ease, background 0.4s ease',
            }}
            onClick={closeFlyout}
          />
        )}

        {/* FLYOUT SUBCATEGORY PANEL */}
        {activeFlyoutCat && (
          <div
            className="absolute z-30 bg-white shadow-2xl flex flex-col sidebar-scroll overflow-y-auto"
            style={{
              left: (sidebarOpen ? 256 : 0) + 12,
              top: '12px',
              bottom: '12px',
              width: '250px',
              borderRadius: '15px',
              transform: flyoutVisible ? 'translateX(0)' : 'translateX(-48px)',
              opacity: flyoutVisible ? 1 : 0,
              transition: 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.35s ease',
            }}
          >
            <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <p
                className="font-semibold text-gray-800 text-[13px] leading-snug cursor-pointer hover:text-primary transition-colors"
                onClick={() => { selectCategory(activeFlyoutCat.name, 'All'); closeFlyout(); }}
              >
                {activeFlyoutCat.name}
              </p>
              <button onClick={closeFlyout} className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors">
                <i className="fa-solid fa-xmark text-gray-500 text-[16px]" />
              </button>
            </div>
            <div className="px-2 py-2 space-y-0.5">
              {activeFlyoutCat.subItems.map((sub: any, si: number) => (
                <button
                  key={si}
                  onClick={() => { selectCategory(activeFlyoutCat.name, sub.label); closeFlyout(); }}
                  className="w-full text-left px-3 py-2.5 rounded-[8px] text-[13.5px] transition-all duration-150 hover:bg-gray-50"
                  style={selectedCategory.subCategory === sub.label
                    ? { color: '#1D9FDA', fontWeight: 700, background: '#EFF8FF' }
                    : { color: '#6B7280' }}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* MAIN CONTENT COLUMN */}
        <div ref={scrollContainerRef} className="flex-1 min-w-0 overflow-y-auto product-range-scroll" style={{ transition: 'all 0.3s ease' }}>

          {/* PRODUCTS LIST */}
          <section className="px-4 sm:px-6 lg:px-8 pt-4 mb-24">
            {/* Toolbar */}
            <div className="flex flex-col gap-3 mb-3 sm:flex-row sm:items-start sm:justify-between">
              {/* The page's h1 — it used to live in the gradient banner, which is gone.
                  A condition page is headed by the condition ("Breast Cancer Medicines")
                  with its category as a label above it, as before. */}
              <div className="sm:max-w-[55%]">
                {conditionName && selectedCategory.category !== 'All' && (
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-0.5">{selectedCategory.category}</p>
                )}
                <h1 className="text-xl font-semibold text-gray-900 leading-snug tracking-tight">
                  {conditionName ? (lang === 'tl' ? conditionHeadingTl(conditionName) : conditionHeading(conditionName)) : displayCategory === 'All' ? tr('Products', 'Mga Produkto') : displayCategory}
                </h1>
              </div>

              {/* Check Products */}
              {!sidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full bg-primary hover:bg-blue-600 text-white text-[13px] font-bold transition-all whitespace-nowrap shadow-sm"
                >
                  <i className="fa-solid fa-list text-[12px]" />
                  {tr('Check Products', 'Tingnan ang Produkto')}
                </button>
              )}

              {/* Search Bar */}
              <div className="relative w-full sm:flex-1 sm:min-w-0" ref={searchWrapperRef}>
                <div className="rounded-full py-1.5 px-1.5 border border-transparent focus-within:border-primary flex items-center" style={{ background: '#F6F7F9' }}>
                  <div className="relative flex-grow flex items-center ml-3">
                    <i className="fa-solid fa-magnifying-glass text-gray-400 text-[13px]" />
                    <input
                      type="text"
                      placeholder={tr('Search by brand, generic name, category, or disease...', 'Maghanap ayon sa brand, generic name, kategorya, o sakit...')}
                      value={searchTerm}
                      onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                      onFocus={() => setShowSuggestions(true)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          onEnterSearch(searchTerm);
                          setShowSuggestions(false);
                          scrollToTable();
                        }
                      }}
                      className="w-full bg-transparent border-none pl-2.5 pr-2 py-1.5 text-[13px] text-gray-700 outline-none placeholder-gray-400"
                    />
                    {searchTerm && (
                      <button
                        onClick={() => { setSearchTerm(''); setCurrentPage(1); }}
                        className="mr-2 text-gray-300 hover:text-gray-500 transition flex-shrink-0"
                        aria-label={tr('Clear search', 'I-clear ang search')}
                      >
                        <i className="fa-solid fa-xmark text-[11px]" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Suggestions Dropdown */}
                {showSuggestions && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 p-4 z-50">
                    <div className="flex items-center justify-between mb-3 px-1">
                      <h4 className="text-[12px] font-medium text-gray-500">{tr('Recent Searches', 'Mga Huling Hinanap')}</h4>
                      {searchHistory.length > 0 && (
                        <button
                          onClick={() => clearSearchHistory()}
                          className="text-[11px] font-bold text-primary hover:text-blue-700 transition"
                        >
                          {tr('Clear All', 'I-clear Lahat')}
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-1 mb-4">
                      {searchHistory.length > 0 ? (
                        searchHistory.map((term, idx) => (
                          <div
                            key={`${term}-${idx}`}
                            className="flex items-center justify-between p-2 hover:bg-blue-50/50 rounded-xl cursor-pointer group transition"
                            onClick={() => {
                              setSelectedCategory({ category: 'All', subCategory: 'All' });
                              setSearchTerm(term);
                              setCurrentPage(1);
                              setShowSuggestions(false);
                              scrollToTable();
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <i className="fa-solid fa-clock-rotate-left text-gray-300 text-[11px]" />
                              <span className="text-[13px] text-gray-600 font-medium">{term}</span>
                            </div>
                            <button
                              onClick={e => { e.stopPropagation(); removeSearchHistoryItem(term); }}
                              className="p-1"
                              aria-label={tr(`Remove ${term}`, `Alisin ang ${term}`)}
                            >
                              <i className="fa-solid fa-xmark text-gray-300 hover:text-red-500 text-[10px] transition opacity-0 group-hover:opacity-100" />
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="col-span-full py-8 text-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-100">
                          <i className="fa-solid fa-ghost text-gray-300 text-2xl mb-3 block" />
                          <p className="text-xs font-semibold text-gray-400">{tr('No search history found', 'Wala pang search history')}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between mb-3 px-1">
                      <h4 className="text-[12px] font-medium text-gray-500">{tr('Suggested', 'Mungkahi')}</h4>
                    </div>
                    <div className="grid grid-cols-1 gap-2 max-h-[280px] overflow-y-auto">
                      {suggestedProducts.map(sp => (
                        <div
                          key={sp._id}
                          className="flex items-center gap-3 p-2 hover:bg-blue-50/50 rounded-xl cursor-pointer transition group"
                          onClick={() => {
                            setSelectedCategory({ category: 'All', subCategory: 'All' });
                            setSearchTerm(sp.brandName || sp.name || '');
                            setCurrentPage(1);
                            setShowSuggestions(false);
                            scrollToTable();
                          }}
                        >
                          <div className="w-10 h-10 bg-white border border-gray-100 p-1.5 rounded-lg flex items-center justify-center overflow-hidden">
                            <img
                              src={getProductImage(sp, 80)}
                              className="w-full h-full object-contain mix-blend-multiply group-hover:scale-110 transition duration-300"
                              alt={sp.brandName || sp.name || tr('Product', 'Produkto')}
                              onError={(e) => { const img = e.currentTarget; img.onerror = null; img.src = '/assets/no-image.png'; }}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-bold text-gray-800 truncate">{sp.brandName || sp.name}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{sp.category?.category || 'General'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>

            {/* Category pills — the filter, out in the open where a thumb can reach it,
                instead of behind a button. Bleeds to the screen edge so the next pill
                peeks in and says "swipe". */}
            <div className="no-scrollbar -mx-4 sm:-mx-6 lg:-mx-8 flex gap-2 overflow-x-auto px-4 sm:px-6 lg:px-8 pb-1">
              {[{ key: 'All', label: tr('All', 'Lahat') }, ...processedCats.map(cat => ({ key: cat.category, label: cat.category }))].map(pill => {
                const active = selectedCategory.category === pill.key;
                return (
                  <button
                    key={pill.key}
                    onClick={() => selectCategory(pill.key, 'All')}
                    className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[12.5px] font-semibold transition active:scale-95 ${
                      active ? 'bg-primary text-white shadow-sm' : 'bg-[#F6F7F9] text-gray-600'
                    }`}
                  >
                    {pill.label}
                  </button>
                );
              })}
              {categoriesLoading && Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[34px] w-24 shrink-0 animate-pulse rounded-full bg-[#F6F7F9]" />
              ))}
            </div>

            {/* A chosen category's conditions, one level down — smaller and outlined so
                the two rows never read as the same control. */}
            {(() => {
              const cat = processedCats.find(c => c.category === selectedCategory.category);
              if (!cat || cat.subcategory.length === 0) return null;
              return (
                <div className="no-scrollbar -mx-4 sm:-mx-6 lg:-mx-8 mt-2 flex gap-1.5 overflow-x-auto px-4 sm:px-6 lg:px-8 pb-1">
                  {['All', ...cat.subcategory].map(sub => {
                    const active = selectedCategory.subCategory === sub;
                    return (
                      <button
                        key={sub}
                        onClick={() => selectCategory(cat.category, sub)}
                        className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition active:scale-95 ${
                          active ? 'border-primary bg-[#EFF8FF] text-primary' : 'border-gray-200 bg-white text-gray-500'
                        }`}
                      >
                        {sub === 'All' ? tr(`All ${cat.category}`, `Lahat ng ${cat.category}`) : sub}
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            <div className="mt-4 mb-4 flex items-center justify-between gap-2">
              <span className="text-[12.5px] text-gray-400">{sorted.length} {tr(sorted.length === 1 ? 'item' : 'items', 'item')}</span>
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={e => { setSortBy(e.target.value); setCurrentPage(1); scrollToTable(); }}
                  aria-label={tr('Sort products', 'Ayusin ang mga produkto')}
                  className="appearance-none bg-white border border-gray-200 hover:border-primary rounded-full pl-3.5 pr-8 py-1.5 text-[12px] font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                >
                  <option value="Default">{tr('Default', 'Default')}</option>
                  <option value="Name: A → Z">{tr('Name: A → Z', 'Pangalan: A → Z')}</option>
                  <option value="Name: Z → A">{tr('Name: Z → A', 'Pangalan: Z → A')}</option>
                  <option value="In Stock First">{tr('In Stock First', 'Unahin ang In Stock')}</option>
                  <option value="Form: A → Z">{tr('Form: A → Z', 'Anyo: A → Z')}</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500">
                  <i className="fa-solid fa-arrow-down-wide-short text-[10px]" />
                </div>
              </div>
            </div>

            {/* Product List */}
            <div ref={tableRef}>
              {productsLoading ? (
                <>
                  <div className="lg:hidden grid grid-cols-2 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-[268px] animate-pulse rounded-[20px] bg-[#F6F7F9]" />
                    ))}
                  </div>
                  <div className="hidden lg:block"><TableSkeleton /></div>
                </>
              ) : paginated.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center bg-white rounded-2xl border border-gray-100 shadow-sm py-16 px-6">
                  <img
                    src="/assets/noproductsfound.png"
                    alt={tr('No products found', 'Walang nahanap na produkto')}
                    className="w-44 sm:w-56 object-contain mb-6"
                  />
                  <h3 className="text-lg font-bold text-gray-900 mb-1.5">{tr('No Products Found', 'Walang Nahanap na Produkto')}</h3>
                  <p className="text-sm text-gray-500 max-w-sm">
                    {searchTerm.trim() && displayCategory !== 'All' ? (
                      <>{tr('No products found for', 'Walang nahanap na produkto para sa')} <span className="font-semibold text-gray-700">"{searchTerm.trim()}"</span> {tr('in', 'sa')} <span className="font-semibold text-gray-700">{displayCategory}</span>.</>
                    ) : searchTerm.trim() ? (
                      <>{tr('No products found for', 'Walang nahanap na produkto para sa')} <span className="font-semibold text-gray-700">"{searchTerm.trim()}"</span>.</>
                    ) : displayCategory !== 'All' ? (
                      <>{tr('No products found in', 'Walang nahanap na produkto sa')} <span className="font-semibold text-gray-700">{displayCategory}</span>.</>
                    ) : (
                      tr("We couldn't find any products matching your search or filters.", 'Walang produktong tumugma sa iyong search o mga filter.')
                    )}
                  </p>
                </div>
              ) : (
                <>
                  {/* MOBILE GRID — two across, in the home screen's featured-card style */}
                  <div className="lg:hidden grid grid-cols-2 gap-3">
                    {paginated.map((p, i) => (
                      <ProductGridCard key={`${p._id || 'idx'}-${i}`} p={p as unknown as CatalogueRow} />
                    ))}
                  </div>

                  {/* DESKTOP TABLE */}
                  <div className="hidden lg:block overflow-x-auto no-scrollbar bg-white rounded-[10px] border border-gray-100 shadow-sm">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50/50 border-b border-gray-100">
                          <th className="px-6 py-4 text-[14px] font-semibold text-gray-900 capitalize">{tr('Product', 'Produkto')}</th>
                          <th className="px-6 py-4 text-[14px] font-semibold text-gray-900 capitalize">{tr('Category', 'Kategorya')}</th>
                          <th className="px-6 py-4 text-[14px] font-semibold text-gray-900 capitalize">{tr('Strength', 'Lakas')}</th>
                          <th className="px-6 py-4 text-[14px] font-semibold text-gray-900 capitalize">{tr('Form', 'Anyo')}</th>
                          <th className="px-6 py-4 text-[14px] font-semibold text-gray-900 capitalize text-center">{tr('Availability', 'Availability')}</th>
                          <th className="px-6 py-4 text-[14px] font-semibold text-gray-900 capitalize text-center">{tr('Action', 'Aksyon')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {paginated.map((p, i) => {
                          const displayName = getProductDisplayName(p);
                          const rowId = `dt-${p._id || 'idx'}-${i}`;
                          return (
                            <tr key={rowId} className="hover:bg-blue-50/30 transition-colors group">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-4">
                                  <div className="w-12 h-12 bg-gray-50 rounded-xl overflow-hidden flex-shrink-0 border border-gray-100 p-1">
                                    <img
                                      src={getProductImage(p, 120)}
                                      alt={displayName}
                                      className="w-full h-full object-contain mix-blend-multiply"
                                      onError={(e) => { const img = e.currentTarget; img.onerror = null; img.src = '/assets/no-image.png'; }}
                                    />
                                  </div>
                                  <span
                                    className="text-[14px] font-semibold text-gray-900 group-hover:text-primary transition-colors cursor-pointer"
                                    onClick={() => openModal(p)}
                                  >
                                    {displayName}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-[13px] text-gray-600 font-medium">
                                {getCategorizationDisplay(p)}
                              </td>
                              <td className="px-6 py-4 text-[13px] text-gray-700">
                                {formatFieldWithLineBreaks(p.strength) || <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-6 py-4 text-[13px] text-gray-700">
                                {formatFieldWithLineBreaks(p.form) || <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-6 py-4 text-center">
                                {p.availability === false
                                  ? <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-red-50 text-red-500 border border-red-100">{tr('Out of Stock', 'Wala nang Stock')}</span>
                                  : <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-green-50 text-green-600 border border-green-100">{tr('In Stock', 'In Stock')}</span>
                                }
                              </td>
                              <td className="px-6 py-4 text-center">
                                <div className="relative inline-block inquiry-dropdown-wrapper">
                                  <button
                                    onClick={e => toggleInquiryDropdown(e, rowId, p, 'fixed')}
                                    className="bg-primary hover:bg-blue-600 text-white text-[12px] font-semibold px-4 py-1.5 rounded-full transition-all duration-300 shadow-md hover:shadow-lg active:scale-95 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                                  >
                                    <i className="fa-solid fa-paper-plane text-[10px]" />
                                    {tr('Send Inquiry', 'Magtanong')}
                                    <i className="fa-solid fa-chevron-down text-[9px]" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-16 flex justify-center items-center gap-2">
                <button
                  onClick={() => { if (currentPage > 1) { setCurrentPage(p => p - 1); scrollToTable(); } }}
                  disabled={currentPage === 1}
                  aria-label={tr('Previous page', 'Nakaraang page')}
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition cursor-pointer select-none ${currentPage === 1 ? 'border border-gray-100 text-gray-300 cursor-not-allowed' : 'border border-gray-200 text-gray-400 hover:border-primary hover:text-primary'}`}
                >
                  <i className="fa-solid fa-chevron-left text-xs" />
                </button>
                {getPageRange(currentPage, totalPages).map((p, i) =>
                  p === '...' ? (
                    <span key={i} className="text-gray-400 px-1 flex items-center">...</span>
                  ) : (
                    <button
                      key={i}
                      onClick={() => { setCurrentPage(p as number); scrollToTable(); }}
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition cursor-pointer select-none ${p === currentPage ? 'bg-primary text-white shadow-md' : 'border border-gray-200 text-gray-600 hover:border-primary hover:text-primary'}`}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  onClick={() => { if (currentPage < totalPages) { setCurrentPage(p => p + 1); scrollToTable(); } }}
                  disabled={currentPage === totalPages}
                  aria-label={tr('Next page', 'Susunod na page')}
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition cursor-pointer select-none ${currentPage === totalPages ? 'border border-gray-100 text-gray-300 cursor-not-allowed' : 'border border-gray-200 text-gray-400 hover:border-primary hover:text-primary'}`}
                >
                  <i className="fa-solid fa-chevron-right text-xs" />
                </button>
              </div>
            )}
          </section>

          <div id="footer-container" ref={footerSlotRef} />

          {/* ── Inquiry User-Type Dropdown (portaled so it isn't clipped by the table/card scroll containers) ── */}
          {inquiryDropdown && createPortal(
            <div
              className="inquiry-dropdown-portal fixed bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-[100]"
              style={{ top: inquiryDropdown.top, left: inquiryDropdown.left, width: inquiryDropdown.width }}
            >
              {USER_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => {
                    const prod = inquiryDropdown.product;
                    setInquiryDropdown(null);
                    navigateWithUserType(prod, opt.value);
                  }}
                  className="w-full text-left px-4 py-2.5 text-[12px] text-gray-700 hover:bg-blue-50 hover:text-primary transition-colors font-medium flex items-center gap-2"
                >
                  <i className="fa-solid fa-user-tag text-[10px] text-primary/60" />
                  {tr(opt.label, opt.labelTl ?? opt.label)}
                </button>
              ))}
            </div>,
            document.body
          )}

          {/* ── Product Inquiry Success Modal ── */}
          {successModalOpen && (
            <>
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
              <div className="bg-white w-full max-w-[400px] rounded-2xl shadow-2xl relative overflow-hidden">
                <button onClick={() => setSuccessModalOpen(false)}
                  aria-label={tr('Close', 'Isara')}
                  className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition z-10">
                  <i className="fa-solid fa-xmark text-base"></i>
                </button>
                <div className="px-10 pt-12 pb-8 text-center">
                  <div className="flex justify-center mb-7">
                    <div className="check-bounce w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#61A644,#1D9FDA)' }}>
                      <i className="fa-solid fa-check text-white text-xl"></i>
                    </div>
                  </div>
                  <h2 className="text-[19px] font-semibold text-gray-900 mb-4 leading-snug">{tr('Thank you for your inquiry.', 'Salamat sa iyong pagtatanong.')}</h2>
                  <p className="text-[13px] text-gray-500 leading-relaxed">
                    {tr(
                      'Our team will contact you shortly to discuss your pharmaceutical product needs. For urgent concerns, please call',
                      'Kokontakin ka agad ng aming team para pag-usapan ang mga gamot na kailangan mo. Para sa agarang tanong, tumawag sa',
                    )}{' '}
                    <a href="tel:+639190769105" className="text-[#1D9FDA] font-semibold hover:underline">+63 919 076 9105</a>.
                  </p>
                </div>
                <div className="border-t border-gray-100 px-10 py-4 text-center">
                  <button onClick={() => setSuccessModalOpen(false)}
                    className="text-[13px] font-semibold hover:underline"
                    style={{ background: 'linear-gradient(to right,#61A644,#1D9FDA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                    {tr('Close', 'Isara')}
                  </button>
                </div>
              </div>
            </div>
            </>
          )}
        </div>
      </div>{/* end body row */}

    </div>
  );
}
