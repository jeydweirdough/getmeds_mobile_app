'use client';

import ProductName from '@/lib/ProductName';
import { createPortal } from 'react-dom';
import React, { useEffect, useLayoutEffect, useMemo, useState, useRef } from 'react';
import { useProducts, useCategories, useImageMapper } from '@/lib/useSanity';
import { urlFor } from '@/lib/sanity';
import type { Product as SanityProduct, Category } from '@/types/sanity';
import { getApiUrl } from '@/lib/api';
import { submitInquiry } from '@/lib/offlineInquiry';
import { Turnstile, useTurnstile } from '@/lib/turnstile';
import { AddToCart } from '@/lib/AddToCart';
import { ProductAccountPanel, SaveProductButton } from '@/lib/account/ProductActions';
import { isAppMode, needsPrescription } from '@/lib/cart';
import { loadDetails } from '@/lib/accountStore';
import { useAccountData } from '@/lib/accountApi';
import { setPageMeta, injectJsonLd, truncateAtWord, ogImageForFolder, ORGANIZATION_ID } from '@/lib/seo';
import { validateFiles, ALLOWED_FILE_TYPES_ACCEPT } from '@/lib/fileUpload';
import AlertModal from '@/lib/AlertModal';
import { PortableText } from '@portabletext/react';
import { usePageReady } from '@/lib/handoff';
import { goBack, goTo } from '@/platform/navigation';
import { RatingLine, ReviewsSection, useReviews } from '@/lib/ProductReviews';
import StrengthPicker from '@/lib/StrengthPicker';
import { useLang } from '@/lib/i18n';
import './ProductDetailClient.css';

interface ProductWithCategory extends Omit<SanityProduct, 'category'> {
  category?: Category;
}

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

/**
 * Same rule the products listing uses: the sheet's own URL wins, and only when
 * there is none is one assembled from folder + slug. The sheet's URL is the
 * canonical one — it is what the sitemap and the prerenderer both emit — so
 * guessing when it exists would quietly produce a second address for the same
 * page.
 */
const productHref = (p: { productPageUrl?: string; categoryFolder?: string; slug?: { current?: string } }) => {
  if (p.productPageUrl) {
    return '/' + p.productPageUrl.replace(/^https?:\/\//, '').replace(/^[^/]+\/?/, '');
  }
  return `/${p.categoryFolder || 'product-range'}/${p.slug?.current || ''}`;
};

const renderRichContent = (val: any) => {
  if (!val) return null;
  if (Array.isArray(val)) {
    return <PortableText value={val} />;
  }
  return <React.Fragment>{formatFieldWithLineBreaks(val)}</React.Fragment>;
};

// Props are informational only: like the original, the product is resolved from
// window.location (path segment, then ?product=).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
/**
 * My details takes the relationship as free text ("Daughter", "Spouse"); this
 * form asks for one of a fixed list. Map the one onto the other so autofill
 * can choose it: an exact match stays, family words become "Family member",
 * anything else "Other". Empty stays empty.
 */
const RELATIONSHIP_OPTIONS = ['Family member', 'Caregiver', 'Guardian', 'Healthcare professional', 'Other'];
const FAMILY_WORDS = /\b(family|spouse|wife|husband|partner|mother|mom|mum|father|dad|parent|daughter|son|child|sister|brother|sibling|grand\w*|aunt|uncle|niece|nephew|cousin|in-?law|asawa|anak|nanay|tatay|kapatid|lola|lolo)\b/i;
function toRelationshipOption(raw?: string): string {
  const v = (raw || '').trim();
  if (!v) return '';
  const exact = RELATIONSHIP_OPTIONS.find((o) => o.toLowerCase() === v.toLowerCase());
  if (exact) return exact;
  if (/caregiver|yaya|nurse aide/i.test(v)) return 'Caregiver';
  if (/guardian/i.test(v)) return 'Guardian';
  if (/doctor|physician|nurse|pharmacist|health/i.test(v)) return 'Healthcare professional';
  return FAMILY_WORDS.test(v) ? 'Family member' : 'Other';
}

export default function ProductDetailClient(_props: { categorySlug?: string; productSlug?: string } = {}) {
  const { getImage } = useImageMapper('product-range');
  const { tr } = useLang();
  const { data: productsDataRaw, loading: productsLoading } = useProducts();
  const productsData = productsDataRaw as ProductWithCategory[] | null;
  const { data: categoriesData } = useCategories();
  const [product, setProduct] = useState<ProductWithCategory | null>(null);
  const [notFound, setNotFound] = useState(false);
  // Swaps out the prerendered copy of this product once the live one (or not-found) is drawn.
  usePageReady(!productsLoading && (product !== null || notFound));
  const [descriptionTab, setDescriptionTab] = useState<'description' | 'prescription'>('description');
  /**
   * Whether to draw the phone-shaped version of this page.
   *
   * This page is shared between the website and the installed app, and the two
   * want genuinely different things from the top of it: the website wants a
   * breadcrumb trail and a side-by-side hero, because it is a page someone
   * landed on from search and needs to orient in. The app wants a back arrow,
   * one big picture and a thumb-reachable action, because it is a screen
   * someone tapped into from a list they were already browsing.
   *
   * Decided during the first render rather than in an effect, so the app never
   * shows a frame of the website layout before correcting itself. That is only
   * safe because the entry mounts with createRoot, not hydrateRoot — nothing
   * server-rendered has to match. The prerender passes are pure HTML string
   * templating and never execute this component, so they see none of this.
   */
  // (Next.js port) Resolved in a layout effect rather than the useState initializer: this
  // component is server-rendered now, so the first client render must match the server
  // (website layout). The layout effect corrects it before the first paint.
  const [app, setApp] = useState(false);
  useLayoutEffect(() => { setApp(isAppMode()); }, []);
  // Ratings and reviews (app only): keyed by the product's slug, the last part of its address.
  const reviewSlug = app && product ? product.slug?.current || location.pathname.split('/').filter(Boolean).pop() : undefined;
  const reviews = useReviews(reviewSlug);

  const [zoomedImageOpen, setZoomedImageOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [formData, setFormData] = useState({
    name: '', phone: '', email: '', message: '', age: '',
    address: '', contactName: '', contactRelationship: '', terms: false, privacyConsent: false
  });
  /**
   * Autofill from the account, matching the request list and the order form.
   * Fills only still-empty fields, and runs once — see the note in cart.tsx.
   */
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current) return;
    prefilled.current = true;
    loadDetails().then((d) => {
      if (!d) return;
      setFormData((f) => ({
        ...f,
        name: f.name || d.name || '',
        email: f.email || d.email || '',
        phone: f.phone || d.phone || '',
        age: f.age || d.age || '',
        address: f.address || d.address || '',
        contactName: f.contactName || d.contactName || '',
        contactRelationship: f.contactRelationship || toRelationshipOption(d.contactRelationship),
      }));
    });
  }, []);

  /**
   * The signed-in customer's profile (My details) fills the form too, and
   * says who they are, so "Who is requesting?" is answered for them (they can
   * still change it). Like the phone's saved details above, it only fills
   * fields that are still empty, so nothing typed is overwritten.
   */
  const accountData = useAccountData().data;
  const accountPrefilled = useRef(false);
  useEffect(() => {
    const prof = accountData?.profile;
    if (!prof || accountPrefilled.current) return;
    accountPrefilled.current = true;
    setFormData((f) => ({
      ...f,
      name: f.name || prof.name || '',
      email: f.email || prof.email || '',
      phone: f.phone || prof.phone || '',
      age: f.age || prof.age || '',
      address: f.address || prof.address || '',
      contactName: f.contactName || prof.contactName || '',
      contactRelationship: f.contactRelationship || toRelationshipOption(prof.contactRelationship),
    }));
    if (prof.userType && ['patient', 'doctor', 'pharmacy', 'hospital'].includes(prof.userType)) {
      setUserType((t) => t || prof.userType!);
      setUserTypeConfirmed(true);
    }
  }, [accountData]);

  /**
   * In the app the inquiry form is a sheet over the page, opened by "Send
   * inquiry", instead of a long form at the bottom of it. It takes a history
   * entry, so the phone's Back closes it like any screen.
   */
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const inquiryPushed = useRef(false);
  const openInquiry = () => {
    if (inquiryOpen) return;
    window.history.pushState({ gmInquiry: true }, '');
    inquiryPushed.current = true;
    setInquiryOpen(true);
  };
  const closeInquiry = () => {
    if (inquiryPushed.current) window.history.back();
    else setInquiryOpen(false);
  };
  useEffect(() => {
    if (!inquiryOpen) return;
    const onPop = () => {
      inquiryPushed.current = false;
      setInquiryOpen(false);
    };
    window.addEventListener('popstate', onPop);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('popstate', onPop);
      document.body.style.overflow = prev;
    };
  }, [inquiryOpen]);

  const [ageDropdownOpen, setAgeDropdownOpen] = useState(false);
  const ageDropdownRef = useRef<HTMLDivElement>(null);
  const [userTypeMenuOpen, setUserTypeMenuOpen] = useState(false);
  const userTypeMenuRef = useRef<HTMLDivElement>(null);
  const [submitState, setSubmitState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  // One handle for both form variants: they are the two arms of a ternary, so
  // only ever one is mounted and the ref attaches to whichever that is.
  const turnstile = useTurnstile();
  const [userType, setUserType] = useState<string>('');
  const [userTypeConfirmed, setUserTypeConfirmed] = useState(false);
  const [prescriptionRequiredModalOpen, setPrescriptionRequiredModalOpen] = useState(false);
  const [prescriptionModalVisible, setPrescriptionModalVisible] = useState(false);
  // Patient/Caregiver flow only — mirrors the Customer Information form on order-medicines.tsx
  const [patientIdFile, setPatientIdFile] = useState<File | null>(null);
  const [contactSameAsPatient, setContactSameAsPatient] = useState(false);
  const [alertModal, setAlertModal] = useState<{ title?: string; message: string | string[] } | null>(null);
  const showAlert = (message: string | string[], title?: string) => setAlertModal({ title, message });
  const [viewingFileUrl, setViewingFileUrl] = useState<string | null>(null);
  const [idRequiredModalOpen, setIdRequiredModalOpen] = useState(false);
  const [idModalVisible, setIdModalVisible] = useState(false);

  // The order-medicines audience wording, singularised and joined with a slash:
  // that page names whole groups and reads as a list ("Patients & Families"),
  // while this one asks one person to pick which of two things they are.
  // Keys stay as they were — they are what reaches the sheet's userType column.
  const USER_TYPE_LABELS: Record<string, string> = {
    patient:  'Patient / Family',
    doctor:   'Doctor / Healthcare Professional',
    pharmacy: 'Distributor / Pharmacy',
    hospital: 'Hospital / Institution',
  };
  const USER_TYPE_LABELS_TL: Record<string, string> = {
    patient:  'Pasyente / Pamilya',
    doctor:   'Doktor / Healthcare Professional',
    pharmacy: 'Distributor / Botika',
    hospital: 'Ospital / Institusyon',
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ut = params.get('userType');
    if (ut) {
      setUserType(ut);
      setUserTypeConfirmed(true);
    }
  }, []);

  useEffect(() => {
    if (!ageDropdownOpen) return;
    const close = (e: MouseEvent) => {
      if (ageDropdownRef.current && !ageDropdownRef.current.contains(e.target as Node)) {
        setAgeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [ageDropdownOpen]);

  useEffect(() => {
    if (!userTypeMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (userTypeMenuRef.current && !userTypeMenuRef.current.contains(e.target as Node)) {
        setUserTypeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [userTypeMenuOpen]);

  // Excel rows often only populate brandName/genericName and leave `name` blank,
  // so every display spot needs the same brandName+genericName fallback chain.
  const getProductDisplayName = (p: ProductWithCategory) =>
    p.brandName && p.genericName && p.brandName !== p.genericName
      ? `${p.brandName} (${p.genericName})`
      : p.name || p.brandName || p.genericName || 'Product Details';

  // Conditions this product belongs under (primary subCategory + "Also Linked
  // From") come straight from the sheet now — see queries.ts `conditions`.
  const getProductSubcategories = (p: ProductWithCategory) =>
    p.conditions && p.conditions.length ? p.conditions : (p.subCategory ? [p.subCategory] : []);

  // Which condition the user was actually browsing under, so the badge and
  // breadcrumb agree with the listing page instead of always showing the
  // product's primary condition. Checked in order: explicit "?category="
  // link, then the cancer-medicines listing's saved `selectedCategory`
  // (localStorage) — same key cancer-medicines.tsx reads/writes.
  const getContextCondition = (p: ProductWithCategory) => {
    if (typeof window === 'undefined') return null;
    const subcats = getProductSubcategories(p);
    if (subcats.length === 0) return null;

    const urlParams = new URLSearchParams(window.location.search);
    const categoryFromUrl = urlParams.get('category');
    if (categoryFromUrl) {
      const matched = subcats.find(s => s.toLowerCase() === categoryFromUrl.toLowerCase());
      if (matched) return matched;
    }

    try {
      const saved = localStorage.getItem('selectedCategory');
      if (saved) {
        const savedObj = JSON.parse(saved) as { subCategory?: string };
        if (savedObj?.subCategory && savedObj.subCategory !== 'All') {
          const matched = subcats.find(s => s.toLowerCase() === savedObj.subCategory!.toLowerCase());
          if (matched) return matched;
        }
      }
    } catch {
      // Ignore malformed localStorage value
    }

    return null;
  };

  const getCategorizationDisplay = (p: ProductWithCategory) => {
    const contextCondition = getContextCondition(p);
    if (contextCondition) return contextCondition;

    const subcats = getProductSubcategories(p);
    if (subcats.length === 0) {
      return p.category?.category || 'General';
    }
    return subcats[0] || 'General';
  };

  // "Home > Category > Condition > Product" — precomputed in the sheet
  // (Breadcrumb (auto)). The Condition segment is swapped for the actual
  // browsing context (see getContextCondition) so it matches the badge above
  // instead of always showing the product's primary condition.
  const getBreadcrumbParts = (p: ProductWithCategory | null) => {
    if (!p?.breadcrumb) return [];
    const parts = p.breadcrumb.split('>').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const contextCondition = getContextCondition(p);
      if (contextCondition) {
        parts[parts.length - 2] = contextCondition;
      }
    }
    return parts;
  };

  // The same trail as { name, url } crumbs. Single source for both the visible breadcrumb
  // below and the BreadcrumbList JSON-LD, so the two cannot drift — Google requires the
  // marked-up trail to match the one the visitor can actually see.
  const getBreadcrumbTrail = (p: ProductWithCategory): Array<{ name: string; url: string | null }> => {
    const parts = getBreadcrumbParts(p).filter(part => part.toLowerCase() !== 'home');
    const rest = parts.length
      ? parts
      : [getCategorizationDisplay(p), p.brandName || p.name || 'Product Details'];

    return rest.map((name, idx) => {
      const isLast = idx === rest.length - 1;
      let url: string | null = null;
      // Condition Hub URL (auto) is a separate "/conditions/:slug" namespace used only for
      // the sitemap/crawling, not an in-app destination — every link here uses the category
      // folder instead, same as the rest of the app's internal navigation.
      if (!isLast && p.categoryFolder) {
        if (idx === 0) {
          url = `/${p.categoryFolder}`;
        } else if (idx === rest.length - 2) {
          const conditionSlug =
            p.conditionSlugsByName?.[name]?.conditionSlug ||
            p.conditionSlug ||
            name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          url = `/${p.categoryFolder}/${conditionSlug}`;
        }
      }
      return { name, url };
    });
  };

  useEffect(() => {
    if (!productsLoading && productsData) {
      let productSlug = '';

      const pathParts = window.location.pathname.split('/').filter(Boolean);
      if (pathParts.length === 2) {
        productSlug = pathParts[1];
      }

      // Fallback to query param
      if (!productSlug) {
        const urlParams = new URLSearchParams(window.location.search);
        productSlug = urlParams.get('product') || '';
      }

      if (!productSlug) {
        setNotFound(true);
        return;
      }

      const targetSlug = productSlug.toLowerCase();
      const decodedTarget = decodeURIComponent(productSlug).toLowerCase();

      const found = productsData.find(p => {
        const pSlug = p.slug?.current?.toLowerCase();
        const bName = p.brandName?.toLowerCase();

        if (pSlug === targetSlug || pSlug === decodedTarget) return true;
        if (bName === targetSlug || bName === decodedTarget) return true;

        if (p.productPageUrl) {
          const stripped = p.productPageUrl.replace(/^https?:\/\//, '').replace(/^[^/]+\/?/, '').toLowerCase();
          const pageSlug = stripped.split('/').filter(Boolean).pop();
          if (pageSlug === targetSlug || pageSlug === decodedTarget) return true;
        }

        return false;
      });
      if (found) {
        // productPageUrl from the sheet has no protocol (e.g. "getmeds.ph/cancer-medicines/..."),
        // so the leading domain segment has to be stripped even without an "https://" to match.
        const prettyPath = found.productPageUrl
          ? '/' + found.productPageUrl.replace(/^https?:\/\//, '').replace(/^[^/]+\/?/, '')
          : `/${found.categoryFolder || 'product-range'}/${found.slug?.current || ''}`;

        // Canonicalize any other URL this product is reachable from — the legacy singular
        // "/cancer-medicine/<slug>" alias, the "/product-detail?product=<slug>" fallback, etc. —
        // to its one real Category-Folder URL. This is a live, data-driven redirect off the
        // product's own resolved productPageUrl, not a guessed/hardcoded slug mapping, so it
        // self-corrects for every legacy URL automatically without needing to know it in advance.
        if (prettyPath && window.location.pathname !== prettyPath) {
          // Drop the "product" query param specifically — it's just the lookup fallback's own
          // input mechanism, redundant once the real slug is already in the path — but keep any
          // other real param (e.g. "?userType=doctor") intact on the canonical URL.
          const carryOverParams = new URLSearchParams(window.location.search);
          carryOverParams.delete('product');
          const query = carryOverParams.toString();
          // In place, not location.replace: a reload would restart the app and
          // lose the Back trail (platform/router.ts).
          goTo(prettyPath + (query ? `?${query}` : ''), { replace: true });
          return;
        }

        setProduct(found);
        const displayName = found.brandName && found.genericName && found.brandName !== found.genericName
          ? `${found.brandName} (${found.genericName})`
          : found.name || found.brandName || 'Product Details';
        // The Meta Description column in the product sheet is the source of truth for what
        // Google shows. Do not fall back to indications or description body text, so search
        // engines strictly index metaDescription for SEO snippet text.
        const description = (
          found.metaDescription
          || `${displayName} — available through Getmeds Philippines. Quality pharmaceutical product for healthcare needs.`
        ).replace(/\s+/g, ' ').trim();
        const imgUrl = found.image ? urlFor(found.image).width(1200).url() : undefined;
        setPageMeta({
          title: found.metaTitle || displayName,
          description: truncateAtWord(description, 160),
          path: prettyPath,
          // The category's share card, not the pack shot: medicine photography beside our paid
          // campaigns is what Meta flags, and matches what scripts/prerender-slugs.cjs serves.
          image: ogImageForFolder(found.categoryFolder),
          type: 'product',
        });
        // Kept field-for-field in step with the block scripts/prerender-slugs.cjs bakes in
        // under this same id — this overwrites that one on hydration, so anything missing
        // here is silently dropped from the rendered page's structured data.
        const isBranded = Boolean(found.brandName && found.genericName && found.brandName !== found.genericName);
        injectJsonLd('jsonld-drug', {
          '@type': 'Drug',
          name: displayName,
          ...(isBranded ? { alternateName: String(found.brandName).trim() } : {}),
          ...(found.genericName ? { nonProprietaryName: found.genericName, activeIngredient: found.genericName } : {}),
          // Only true for a row carrying a brand distinct from its generic name — a plain
          // generic has no proprietary name to claim.
          isProprietary: isBranded,
          ...(found.strength && found.form ? { dosageForm: `${found.form}, ${found.strength}` } : { dosageForm: found.form || found.strength }),
          description: truncateAtWord(description, 160),
          url: `${window.location.origin}${prettyPath}`,
          ...(imgUrl ? { image: imgUrl } : {}),
          legalStatus: 'Prescription only medicine (Rx), Philippines',
          prescriptionStatus: 'PrescriptionOnly',
          // Getmeds is the importer and distributor, never assumed to be the maker: omitted
          // unless the sheet's Manufacturer column is filled in for this SKU.
          ...(found.manufacturer ? { manufacturer: { '@type': 'Organization', name: String(found.manufacturer).trim() } } : {}),
          mainEntityOfPage: {
            '@type': 'WebPage',
            '@id': `${window.location.origin}${prettyPath}`,
            publisher: { '@id': ORGANIZATION_ID },
          },
        });
        // Mirrors the BreadcrumbList baked in by scripts/prerender-slugs.cjs under this
        // same id, built from the trail the page actually renders. The final crumb carries
        // no "item" — it is the page the visitor is already on.
        const trail = getBreadcrumbTrail(found);
        const crumbs = [{ name: 'Home', url: '/' }, ...trail];
        if (crumbs.length > 1) {
          injectJsonLd('jsonld-breadcrumb', {
            '@type': 'BreadcrumbList',
            itemListElement: crumbs.map((crumb, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              name: crumb.name,
              ...(crumb.url && i < crumbs.length - 1 ? { item: `${window.location.origin}${crumb.url}` } : {}),
            })),
          });
        }
      } else {
        setNotFound(true);
      }
    }
  }, [productsLoading, productsData, categoriesData]);

  const backUrl = product?.categoryFolder ? `/${product.categoryFolder}` : '/cancer-medicines';

  /**
   * The app header's share button. Uses the OS share sheet where there is one —
   * in an installed app that is the whole point, since the useful destinations
   * are Messenger and Viber rather than anything the page could link to — and
   * falls back to the clipboard elsewhere.
   */
  const shareProduct = async () => {
    const url = window.location.href;
    const title = product ? getProductDisplayName(product) : 'Getmeds';
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      showAlert(tr('Link copied to your clipboard.', 'Nakopya na ang link sa iyong clipboard.'), tr('Share', 'Ibahagi'));
    } catch {
      // Dismissing the share sheet rejects the promise. That is a choice, not
      // a failure, so there is nothing to tell anyone about.
    }
  };

  /**
   * "Similar products", app only.
   *
   * Ranked rather than filtered: same condition first, then anything else in
   * the same category folder. A person looking at one taxane usually wants the
   * other taxanes before they want a different cancer's medicine, and sorting
   * by that is the entire difference between a useful row and a random one.
   */
  const similar = useMemo(() => {
    if (!product || !productsData) return [] as ProductWithCategory[];
    const condition = (product.subCategory || '').trim().toLowerCase();
    const folder = (product.categoryFolder || '').trim();
    const scored: Array<{ p: ProductWithCategory; rank: number }> = [];

    for (const p of productsData) {
      if (p._id === product._id) continue;
      if (p.availability === false) continue;
      const sameCondition = condition && (p.subCategory || '').trim().toLowerCase() === condition;
      const sameFolder = folder && (p.categoryFolder || '').trim() === folder;
      if (!sameCondition && !sameFolder) continue;
      scored.push({ p, rank: sameCondition ? 0 : 1 });
    }

    return scored.sort((a, b) => a.rank - b.rank).slice(0, 6).map((s) => s.p);
  }, [product, productsData]);


  const getProductImage = (p: ProductWithCategory, size?: number) => {
    if (p.image && p.image.asset) {
      try {
        if (size) return urlFor(p.image).width(size).height(size).url();
        return urlFor(p.image).url();
      } catch (err) {
        console.error('Error generating image URL:', err);
      }
    }

    return '/assets/no-image.png';
  };



  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const { valid, errors } = validateFiles(Array.from(e.target.files));
      if (errors.length > 0) showAlert(errors, tr('Invalid File', 'Hindi Valid na File'));
      setUploadedFiles(valid);
    }
  };

  const handlePatientIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const { valid, errors } = validateFiles([e.target.files[0]]);
      if (errors.length > 0) showAlert(errors, tr('Invalid File', 'Hindi Valid na File'));
      if (valid.length > 0) setPatientIdFile(valid[0]);
      e.target.value = '';
    }
  };

  const resetForm = () => {
    setFormData({ name: '', phone: '', email: '', message: '', age: '', address: '', contactName: '', contactRelationship: '', terms: false, privacyConsent: false });
    setUploadedFiles([]);
    setPatientIdFile(null);
    setContactSameAsPatient(false);
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (userType === 'patient') {
      // Block submission for patients without a prescription
      if (uploadedFiles.length === 0) {
        setPrescriptionRequiredModalOpen(true);
        requestAnimationFrame(() => requestAnimationFrame(() => setPrescriptionModalVisible(true)));
        return;
      }
      if (!patientIdFile) {
        setIdRequiredModalOpen(true);
        requestAnimationFrame(() => requestAnimationFrame(() => setIdModalVisible(true)));
        return;
      }
      if (!formData.name || !formData.email || !formData.phone || !formData.age || !formData.address) {
        showAlert(tr('Please fill in all required fields.', 'Pakisagutan ang lahat ng required na field.'));
        return;
      }
      if (!contactSameAsPatient && !formData.contactName) {
        showAlert(tr("Please provide the contact person's full name.", 'Pakilagay ang buong pangalan ng contact person.'));
        return;
      }
      if (!formData.terms) {
        showAlert(tr('Please confirm that all provided information is authentic.', 'Pakikumpirma na totoo ang lahat ng impormasyong ibinigay.'));
        return;
      }
      if (!formData.privacyConsent) {
        showAlert(tr('Please consent to the Privacy Policy to proceed.', 'Pumayag muna sa Privacy Policy para makapagpatuloy.'));
        return;
      }
    }

    const phoneDigits = formData.phone.replace(/\D/g, '');
    if (formData.phone && (phoneDigits.length < 7 || phoneDigits.length > 15)) {
      showAlert(tr('Please enter a valid phone number.', 'Pakilagay ang tamang phone number.'));
      return;
    }

    setSubmitState('sending');
    const filesData: { name: string; type: string; base64: string; category?: 'id' | 'prescription' }[] = [];
    for (const file of uploadedFiles) {
      try {
        const base64 = await fileToBase64(file);
        filesData.push(userType === 'patient'
          ? { name: file.name, type: file.type, base64, category: 'prescription' }
          : { name: file.name, type: file.type, base64 });
      } catch (err) {
        console.error('Error processing file:', file.name, err);
      }
    }
    if (userType === 'patient' && patientIdFile) {
      try {
        const base64 = await fileToBase64(patientIdFile);
        filesData.push({ name: patientIdFile.name, type: patientIdFile.type, base64, category: 'id' });
      } catch (err) {
        console.error('Error processing file:', patientIdFile.name, err);
      }
    }

    try {
      const contactInfo = contactSameAsPatient
        ? 'Same as patient'
        : `${formData.contactName}${formData.contactRelationship ? ` (${formData.contactRelationship})` : ''}`;

      const payload = userType === 'patient'
        ? {
            // Patient/Caregiver submissions use the same fields as the Order Medicines form,
            // so they're routed to that same Google Sheet instead of the Product Inquiry one.
            inquiryType: 'Order Medicine',
            fullName: formData.name,
            email: formData.email,
            phone: formData.phone,
            message: `Product Inquiry Request. Age: ${formData.age}, Address: ${formData.address}, Contact Person: ${contactInfo}`,
            additionalData: {
              productName: product?.brandName || product?.name || '',
              age: formData.age,
              address: formData.address,
              contactSameAsPatient,
              contactName: formData.contactName,
              contactRelationship: formData.contactRelationship,
              privacyPolicyConsent: formData.privacyConsent
            },
            turnstileToken: turnstile.token,
            files: filesData
          }
        : {
            inquiryType: 'Product Inquiry',
            fullName: formData.name,
            email: formData.email,
            phone: formData.phone,
            message: formData.message,
            additionalData: {
              productName: product?.brandName || product?.name || '',
              age: formData.age,
              customerType: USER_TYPE_LABELS[userType] || userType
            },
            turnstileToken: turnstile.token,
            files: filesData
          };

      // returnPath is left to default to the current URL: this form lives on a
      // per-product page, so "come back and finish it" must mean this product.
      const submission = await submitInquiry(payload, { endpoint: getApiUrl() });
      // Tokens are single-use, so the solved widget is replaced whatever the outcome.
      turnstile.reset();
      if (submission.status === 'failed') throw new Error(submission.error);

      setSubmitState('sent');
      resetForm();
      if (inquiryOpen) closeInquiry();
      submission.status === 'sent' && setSuccessModalOpen(true);
      setTimeout(() => setSubmitState('idle'), 300);
    } catch (error) {
      console.error('Submission error:', error);
      setSubmitState('error');
      setTimeout(() => setSubmitState('idle'), 2000);
    }
  };

  /**
   * This product as the app's account features keep it (saved medicines,
   * stock alerts, refill reminders): the same fields the sticky bar hands
   * AddToCart, so a saved medicine and a list row look alike.
   */
  const accountProduct = app && product
    ? {
        name: getProductDisplayName(product),
        url: location.pathname,
        image: product.image?.asset ? getProductImage(product, 140) : undefined,
        strength: product.strength,
        form: product.form,
      }
    : null;

  // (Next.js port) The layout's navbar is sticky across the whole page here, where the
  // original's scrolled away inside its own container — measured so the sticky breadcrumb
  // bar parks just below it instead of disappearing underneath it.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const nav = document.getElementById('global-nav-wrapper');
    const apply = () => {
      if (!rootRef.current) return;
      const sticky = nav && getComputedStyle(nav).position === 'sticky';
      rootRef.current.style.setProperty('--pd-nav-h', `${nav && sticky ? nav.offsetHeight : 0}px`);
    };
    apply();
    if (!nav || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(apply);
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={rootRef} style={{ fontFamily: "'Poppins', sans-serif" }} className="product-detail-root bg-white text-gray-800 antialiased flex flex-col">
      <div className="flex-1">
        {/* App header. Replaces the breadcrumb bar inside the installed app,
            where a four-level trail is more chrome than a phone screen can
            spare and the back arrow says the same thing in one glyph. */}
        {app && (
          <div className="sticky top-0 z-30 flex items-center justify-between bg-white px-4 py-3">
            {/* Back to wherever the visitor came from (Home, search, a
                category...); the category only when they arrived straight
                here. It used to be a link to the category, which sent people
                who came from Home somewhere they had never been. */}
            <button
              type="button"
              onClick={() => goBack(backUrl)}
              aria-label={tr('Back', 'Bumalik')}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F6FB] text-gray-700"
            >
              <i className="fa-solid fa-arrow-left text-[14px]" />
            </button>
            <div className="flex items-center gap-2">
              {accountProduct && <SaveProductButton product={accountProduct} />}
              <button
                type="button"
                onClick={shareProduct}
                aria-label={tr('Share this product', 'Ibahagi ang produktong ito')}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F6FB] text-gray-700"
              >
                <i className="fa-solid fa-share-nodes text-[14px]" />
              </button>
            </div>
          </div>
        )}

        {/* Help bar (browser only). It used to carry the breadcrumb trail too,
            which this app no longer shows. */}
        <div className={`bg-white px-6 py-3 items-center justify-end border-b border-gray-100 sticky top-0 z-10 product-detail-breadcrumb ${app ? 'hidden' : 'hidden sm:flex'}`}>
          <button
            className="hidden sm:flex items-center text-gray-500 hover:text-primary transition text-sm space-x-1.5"
            onClick={() => {
              if (typeof (window as any).openGetmedsChat === 'function') {
                (window as any).openGetmedsChat();
              } else if ((window as any).Tawk_API && typeof (window as any).Tawk_API.maximize === 'function') {
                (window as any).Tawk_API.maximize();
              }
            }}
          >
            <i className="fa-regular fa-circle-question" />
            <span>{tr('Do you need help?', 'Kailangan mo ba ng tulong?')}</span>
          </button>
        </div>

        {/* Loading skeleton */}
        {productsLoading && (
          <div className="max-w-6xl mx-auto p-6 lg:p-8 animate-pulse">
            <div className="flex flex-col lg:flex-row gap-0 border border-gray-100 rounded-2xl overflow-hidden mt-4">
              <div className="lg:w-1/2 p-8 space-y-4 border-b lg:border-b-0 lg:border-r border-gray-100">
                <div className="h-4 bg-gray-100 rounded-full w-1/3" />
                <div className="h-6 bg-gray-100 rounded-full w-2/3" />
                <div className="h-4 bg-gray-100 rounded-full w-full" />
                <div className="aspect-square bg-gray-100 rounded-2xl w-full max-w-xs mx-auto" />
                <div className="h-48 bg-gray-100 rounded-2xl" />
              </div>
              <div className="lg:w-1/2 p-8 space-y-4">
                <div className="h-6 bg-gray-100 rounded-full w-1/2" />
                {[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-gray-100 rounded-xl" />)}
                <div className="h-20 bg-gray-100 rounded-xl" />
                <div className="h-12 bg-gray-100 rounded-xl" />
              </div>
            </div>
          </div>
        )}

        {/* Not found state */}
        {!productsLoading && notFound && (
          <div className="flex flex-col items-center justify-center py-32 text-center px-4">
            <i className="fa-regular fa-circle-xmark text-5xl text-gray-300 mb-4" />
            <h2 className="text-xl font-bold text-gray-800 mb-2">{tr('Product Not Found', 'Hindi Nahanap ang Produkto')}</h2>
            <p className="text-sm text-gray-500 mb-6">
              {tr("The product you're looking for doesn't exist or may have been removed.", 'Wala ang produktong hinahanap mo o maaaring tinanggal na ito.')}
            </p>
            <a
              href="/cancer-medicines"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white text-sm font-semibold shadow-md transition-all"
              style={{ background: 'linear-gradient(to right, #61A644, #0D99FF)' }}
            >
              <i className="fa-solid fa-arrow-left text-xs" />
              {tr('Browse All Products', 'Tingnan ang Lahat ng Produkto')}
            </a>
          </div>
        )}

        {/* Product detail content */}
        {!productsLoading && product && (
          <div className="max-w-6xl mx-auto lg:px-4 lg:py-6">
            <div className="flex flex-col lg:flex-row lg:border lg:border-gray-100 lg:rounded-2xl lg:shadow-sm overflow-hidden bg-white">

              {/* Left Column: Product Info */}
              <div className="lg:w-1/2 p-6 lg:p-8 border-b lg:border-b-0 lg:border-r border-gray-100 flex flex-col">
                {app ? (
                  /* ── The app hero ──
                     One column, picture first, because on a phone the picture
                     is the fastest way to confirm "yes, this is the box I was
                     given" — which is the question most people actually arrive
                     with. The desktop arrangement below puts text first, which
                     is right there and wrong here. */
                  <div className="-mx-6 mb-5 px-4">
                    {(() => {
                      const resolvedImageUrl = getProductImage(product);
                      const hasImage = resolvedImageUrl && !resolvedImageUrl.endsWith('no-image.png');
                      return (
                        <div
                          onClick={hasImage ? () => setZoomedImageOpen(true) : undefined}
                          className={`mb-4 flex aspect-[4/3] w-full flex-col items-center justify-center overflow-hidden rounded-[22px] bg-[#F6F8FC] p-6 ${hasImage ? 'cursor-zoom-in' : ''}`}
                        >
                          {hasImage ? (
                            <img
                              src={resolvedImageUrl}
                              alt={product.name}
                              className="h-full w-full object-contain mix-blend-multiply"
                              onError={(e) => { const img = e.currentTarget; img.onerror = null; img.src = '/assets/no-image.png'; }}
                            />
                          ) : (
                            <>
                              <i className="fa-regular fa-image mb-3 text-4xl text-gray-300" />
                              <span className="text-xs font-medium uppercase tracking-wider text-gray-400">{tr('No Image', 'Walang Larawan')}</span>
                            </>
                          )}
                        </div>
                      );
                    })()}

                    <h1 className="text-[21px] font-bold leading-tight text-gray-900">
                      <ProductName name={getProductDisplayName(product)} />
                    </h1>
                    <RatingLine data={reviews.data} />

                    {/* Where a storefront would link to the seller's shop. The
                        nearest true thing here is the section this product was
                        filed under, which is also where "back" goes. */}
                    <a
                      href={backUrl}
                      className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold capitalize"
                      style={{ color: '#0D99FF' }}
                    >
                      {(product.categoryFolder || 'product range').replace(/-/g, ' ')}
                      <i className="fa-solid fa-chevron-right text-[9px]" />
                    </a>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {product.availability !== false && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700">
                          <i className="fa-solid fa-check text-[9px]" /> {tr('In stock', 'In stock')}
                        </span>
                      )}
                      {product.prescription?.toUpperCase() === 'RX' && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-600">
                          <i className="fa-solid fa-file-prescription text-[9px]" /> {tr('Prescription required', 'Kailangan ng reseta')}
                        </span>
                      )}
                      {product.form && (
                        <span className="rounded-full bg-[#F1F6FC] px-2.5 py-1 text-[11px] font-semibold capitalize text-gray-600">
                          {product.form}
                        </span>
                      )}
                    </div>

                    {/* Where a shop offers sizes: this medicine's other strengths. */}
                    <StrengthPicker current={product} />

                    {/* Account actions: a stock alert when it is out, and a
                        refill reminder. Signed-out taps explain sign-in. */}
                    {accountProduct && (
                      <ProductAccountPanel product={accountProduct} outOfStock={product.availability === false} />
                    )}

                    {/* The slot a storefront gives to price. Saying plainly
                        that there is a quote coming is more useful than an
                        empty space, and it sets the expectation the inquiry
                        form below then meets. */}
                    <div className="mt-4 rounded-[16px] bg-[#F6F8FC] p-4">
                      <p className="text-[12px] font-semibold text-gray-400">{tr('Price', 'Presyo')}</p>
                      <p className="mt-0.5 text-[15px] font-bold text-gray-900">{tr('Quoted on request', 'May quote kapag nag-request')}</p>
                      <p className="mt-1 text-[11.5px] leading-relaxed text-gray-500">
                        {tr(
                          'Add this to your list, or send an inquiry below, and our team will come back to you with availability and a formal quote.',
                          'Idagdag ito sa iyong list, o magpadala ng inquiry sa ibaba, at babalikan ka ng aming team tungkol sa availability at formal na quote.',
                        )}
                      </p>
                    </div>
                  </div>
                ) : (
                <div className="flex flex-col-reverse md:flex-row gap-8 mb-4">
                  <div className="w-full md:w-1/2 flex flex-col justify-center">
                    <div className="flex flex-wrap items-start gap-x-3 gap-y-1 mb-3 text-sm text-gray-600">
                      <span className="flex items-center font-medium whitespace-nowrap" style={{ color: '#61A644' }}>
                        <i className="fa-solid fa-check mr-1.5" /> {tr('In stock', 'In stock')}
                      </span>
                      <span className="text-gray-300 whitespace-nowrap">|</span>
                      <span className="capitalize font-medium leading-snug" style={{ color: '#0D99FF' }}>
                        {getCategorizationDisplay(product)}
                      </span>
                      {product.prescription?.toUpperCase() === 'RX' && (
                        <>
                          <span className="text-gray-300 whitespace-nowrap">|</span>
                          <span className="font-medium whitespace-nowrap text-red-600">
                            {tr('Rx — Prescription Required', 'Rx — Kailangan ng Reseta')}
                          </span>
                        </>
                      )}
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 mb-4 leading-tight">
                      <ProductName name={getProductDisplayName(product)} />
                    </h1>
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                      {product.strength && (
                        <div>
                          <span className="block text-[11px] text-gray-400 font-semibold">{tr('Strength', 'Lakas')}</span>
                          <span className="text-gray-800 font-medium text-[13px]">{formatFieldWithLineBreaks(product.strength)}</span>
                        </div>
                      )}
                      {product.form && (
                        <div>
                          <span className="block text-[11px] text-gray-400 font-semibold">{tr('Form', 'Anyo')}</span>
                          <span className="text-gray-800 font-medium text-[13px]">{formatFieldWithLineBreaks(product.form)}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-5 max-w-[240px]">
                      <AddToCart
                        variant="full"
                        item={{
                          id: String(product._id || location.pathname),
                          name: getProductDisplayName(product),
                          strength: product.strength,
                          form: product.form,
                          // The page's own path: this product is reachable at the
                          // URL the visitor is already on.
                          url: location.pathname,
                          needsRx: needsPrescription((product as any).Prescription),
                        }}
                      />
                    </div>
                  </div>
                  <div className="w-full md:w-1/2 flex items-center justify-center">
                    {(() => {
                      const resolvedImageUrl = getProductImage(product);
                      const hasImage = resolvedImageUrl && !resolvedImageUrl.endsWith('no-image.png');
                      return (
                        <div
                          onClick={hasImage ? () => setZoomedImageOpen(true) : undefined}
                          className={`w-full max-w-[320px] aspect-square flex flex-col items-center justify-center bg-gray-50 rounded-[15px] border border-gray-100 p-4 overflow-hidden relative group/zoom hover:shadow-md transition-all duration-300 ${hasImage ? 'cursor-zoom-in' : ''}`}
                        >
                          {hasImage ? (
                            <>
                              <img
                                src={resolvedImageUrl}
                                className="w-full h-full object-contain mix-blend-multiply group-hover/zoom:scale-105 transition-transform duration-500"
                                alt={product.name}
                                onError={(e) => { const img = e.currentTarget; img.onerror = null; img.src = '/assets/no-image.png'; }}
                              />
                              <div className="absolute inset-0 bg-black/5 opacity-0 group-hover/zoom:opacity-100 flex items-center justify-center transition-opacity duration-300">
                                <div className="bg-white/95 backdrop-blur-sm text-gray-800 rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow-sm text-xs font-semibold">
                                  <i className="fa-solid fa-magnifying-glass-plus text-primary" />
                                  {tr('Click to Zoom', 'I-click para I-zoom')}
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <i className="fa-regular fa-image text-4xl mb-3 text-gray-300" />
                              <span className="text-xs font-medium uppercase tracking-wider text-gray-400">{tr('No Image', 'Walang Larawan')}</span>
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                )}

                {/* Description */}
                <div className="bg-white rounded-[15px] border border-gray-100 p-5">
                  <div className="border-b border-gray-100 mb-5 flex items-center gap-5">
                    <button
                      type="button"
                      onClick={() => setDescriptionTab('description')}
                      className="inline-block pb-3 text-[13px] font-semibold transition-colors"
                      style={descriptionTab === 'description'
                        ? { color: '#0D99FF', borderBottom: '2px solid #0D99FF' }
                        : { color: '#9CA3AF', borderBottom: '2px solid transparent' }}
                    >
                      {tr('Description', 'Paglalarawan')}
                    </button>
                    {product.prescription?.toUpperCase() === 'RX' && (
                      <button
                        type="button"
                        onClick={() => setDescriptionTab('prescription')}
                        className="inline-block pb-3 text-[13px] font-semibold transition-colors"
                        style={descriptionTab === 'prescription'
                          ? { color: '#DC2626', borderBottom: '2px solid #DC2626' }
                          : { color: '#9CA3AF', borderBottom: '2px solid transparent' }}
                      >
                        {tr('Prescription Requirement', 'Kailangan sa Reseta')}
                      </button>
                    )}
                  </div>
                  {descriptionTab === 'description' ? (
                    <div data-nosnippet className="text-[14px] text-gray-600 leading-relaxed max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      <div className="space-y-4">
                        {product.description && (
                          <div className="text-[14px] text-gray-600 leading-relaxed">
                            {renderRichContent(product.description)}
                          </div>
                        )}
                        {(product.indications || (product as any).indication) && (
                          <div>
                            <span className="block text-[13px] font-semibold mb-1 text-gray-400">{tr('Indications', 'Mga Indikasyon')}</span>
                            <div className="text-[14px] text-gray-600 leading-relaxed">
                              {renderRichContent(product.indications || (product as any).indication)}
                            </div>
                          </div>
                        )}
                        {(product.dosageAdministration || (product as any).dosageAndAdministration) && (
                          <div>
                            <span className="block text-[13px] font-semibold mb-1 text-gray-400">{tr('Dosage & Administration', 'Dosage at Paggamit')}</span>
                            <div className="text-[14px] text-gray-600 leading-relaxed">
                              {renderRichContent(product.dosageAdministration || (product as any).dosageAndAdministration)}
                            </div>
                          </div>
                        )}
                        {!product.description && !product.indications && !(product as any).indication && !product.dosageAdministration && !(product as any).dosageAndAdministration && (
                          <p>{tr('Detailed therapeutic description is not available.', 'Wala pang detalyadong paglalarawan ng gamot na ito.')}</p>
                        )}
                        <div className="mt-4 border-t border-gray-100 pt-4 grid grid-cols-2 gap-4">
                          {product.packaging && (
                            <div>
                              <span className="block text-[11px] text-gray-400 uppercase font-semibold">{tr('Packaging', 'Packaging')}</span>
                              <span className="text-gray-800 font-medium text-[13px]">{product.packaging}</span>
                            </div>
                          )}
                          {product.innovator && (
                            <div>
                              <span className="block text-[11px] text-gray-400 uppercase font-semibold">{tr('Innovator', 'Innovator')}</span>
                              <span className="text-gray-800 font-medium text-[13px]">{product.innovator}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[14px] text-gray-600 leading-relaxed">
                      {tr(
                        'This medicine is prescription-only (Rx). A valid prescription from a licensed healthcare professional is required for purchase and dispensing, as regulated by FDA Philippines under RA 9711.',
                        'Ang gamot na ito ay mabibili lamang nang may reseta (Rx). Kailangan ng valid na reseta mula sa lisensyadong healthcare professional para mabili at maibigay ito, ayon sa regulasyon ng FDA Philippines sa ilalim ng RA 9711.',
                      )}
                    </div>
                  )}
                </div>

                {/* Also used for — "Also Linked From" (auto), the other condition
                    hubs this same product page is also linked from */}
                {(() => {
                  const allSubcats = getProductSubcategories(product);
                  const primarySubcat = getCategorizationDisplay(product);
                  const otherSubcats = allSubcats.filter(s => s !== primarySubcat);
                  if (otherSubcats.length === 0) return null;
                  return (
                    <div className="mt-4 px-5 pb-5">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">{tr('Also used for', 'Ginagamit din para sa')}</p>
                      <div className="flex flex-wrap gap-2">
                        {otherSubcats.map((sub, idx) => {
                          // Resolve the condition slug: prefer the precomputed slug from the sheet,
                          // fall back to slugifying the condition name (same algorithm cancer-medicines.tsx uses)
                          const conditionSlug =
                            product.conditionSlugsByName?.[sub]?.conditionSlug ||
                            sub.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                          const href = `/${product.categoryFolder || 'cancer-medicines'}/${conditionSlug}`;
                          return (
                            <a
                              key={idx}
                              href={href}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border border-blue-100 bg-blue-50 text-primary hover:bg-primary hover:text-white hover:border-primary transition-all duration-200"
                            >
                              <i className="fa-solid fa-arrow-right-to-bracket text-[9px]" />
                              {sub}
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Right Column: Inquiry Form */}
              {/* scroll-mt clears the app's sticky header, which would
                  otherwise cover the heading this scrolls to. */}
              {(() => {
                const form = (
              <div
                id="gm-inquiry"
                {...(app ? { role: 'dialog', 'aria-modal': true, 'aria-label': tr('Send inquiry', 'Magpadala ng inquiry'), 'data-history-backed': '' } : {})}
                className={
                  app
                    ? inquiryOpen
                      ? 'fixed inset-x-0 bottom-0 z-[10060] max-h-[92vh] overflow-y-auto rounded-t-[28px] bg-white px-6 pt-3 shadow-[0_-10px_40px_rgba(15,23,42,.18)]'
                      : 'hidden'
                    : 'lg:w-1/2 bg-white p-6 lg:p-8 pb-10 scroll-mt-[68px]'
                }
                style={app && inquiryOpen ? { paddingBottom: 'calc(28px + var(--gm-safe-bottom))' } : undefined}
              >
                {app && (
                  <div className="sticky -top-3 z-10 -mx-6 mb-2 flex items-center justify-center bg-white px-6 pb-2 pt-3">
                    <div className="h-1 w-10 rounded-full bg-gray-200" />
                    <button
                      type="button"
                      onClick={closeInquiry}
                      aria-label={tr('Close', 'Isara')}
                      className="absolute right-4 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500"
                    >
                      <i className="fa-solid fa-xmark text-[13px]" />
                    </button>
                  </div>
                )}
                <div className="mb-6">
                  <h4 className="text-lg font-bold text-gray-900">{tr('Send Inquiry', 'Magpadala ng Inquiry')}</h4>
                  <p className="text-xs text-gray-500 mt-1">{tr('Submit your details to get a formal quote for this product.', 'Ilagay ang iyong detalye para makakuha ng formal na quote para sa produktong ito.')}</p>
                  {userTypeConfirmed && userType && USER_TYPE_LABELS[userType] && (
                    <div className="relative inline-block mt-2" ref={userTypeMenuRef}>
                      <button
                        type="button"
                        onClick={() => setUserTypeMenuOpen(o => !o)}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-primary border border-blue-100 hover:bg-blue-100 transition"
                      >
                        <i className="fa-solid fa-user-tag text-[9px]" />
                        {tr(USER_TYPE_LABELS[userType], USER_TYPE_LABELS_TL[userType] ?? USER_TYPE_LABELS[userType])}
                        <i className={`fa-solid fa-chevron-down text-[8px] transition-transform ${userTypeMenuOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {userTypeMenuOpen && (
                        <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-xl shadow-xl border border-gray-100 z-[60] overflow-hidden">
                          {Object.entries(USER_TYPE_LABELS).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => { setUserType(value); setUserTypeMenuOpen(false); }}
                              className={`w-full text-left px-3 py-2 text-[12px] font-medium transition ${userType === value ? 'bg-blue-50 text-primary font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}
                            >
                              {tr(label, USER_TYPE_LABELS_TL[value] ?? label)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {!userTypeConfirmed ? (
                  <div>
                    <p className="text-[13px] font-medium text-gray-500 mb-3">{tr('Inquiry Type:', 'Uri ng Inquiry:')}</p>
                    <div className="space-y-2 mb-6">
                      {Object.entries(USER_TYPE_LABELS).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setUserType(value)}
                          className={`w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border text-left text-[13px] font-semibold transition ${userType === value ? 'border-primary bg-blue-50 text-primary' : 'border-gray-200 text-gray-700 hover:border-gray-300'}`}
                        >
                          <i className="fa-solid fa-user-tag text-[11px]" />
                          {tr(label, USER_TYPE_LABELS_TL[value] ?? label)}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled={!userType}
                      onClick={() => setUserTypeConfirmed(true)}
                      className="w-full text-white font-bold py-3 rounded-xl transition-all duration-300 text-[13px] disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: 'linear-gradient(to right, #61A644, #0D99FF)' }}
                    >
                      {tr('Continue', 'Magpatuloy')}
                    </button>
                  </div>
                ) : userType === 'patient' ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[13px] font-medium text-gray-500 mb-2">{tr('Target Product', 'Produkto')}</label>
                    <input
                      type="text"
                      readOnly
                      value={getProductDisplayName(product)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-[13px] font-semibold outline-none cursor-default"
                      style={{ color: '#0D99FF' }}
                    />
                  </div>

                  {/* Patient full name + Upload valid ID — mirrors order-medicines.tsx Customer Information */}
                  <div>
                    <label className="block text-[13px] font-medium text-gray-500 mb-2">{tr('Patient Full Name', 'Buong Pangalan ng Pasyente')}</label>
                    <input
                      type="text"
                      required
                      placeholder={tr('Full name as shown on the prescription', 'Buong pangalan ayon sa reseta')}
                      value={formData.name}
                      onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-700 outline-none focus:border-primary transition"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[13px] font-medium text-gray-500">{tr('Upload valid ID of the patient', 'I-upload ang valid ID ng pasyente')}</label>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      {tr(
                        'A valid government-issued ID of the patient helps us process your order faster and ensures the prescription is dispensed to the right person.',
                        'Ang valid na government ID ng pasyente ay tumutulong sa amin na mapabilis ang iyong order at masigurong maibibigay ang gamot sa tamang tao.',
                      )}
                    </p>
                    <div className="flex items-center gap-3 flex-wrap pt-1">
                      {!patientIdFile ? (
                        <label className="cursor-pointer inline-flex items-center gap-2 hover:opacity-90 text-white text-[12px] font-semibold px-4 py-2.5 rounded-xl transition"
                          style={{ background: 'linear-gradient(to right,#61A644,#1D9FDA)' }}>
                          <input type="file" accept={ALLOWED_FILE_TYPES_ACCEPT} className="hidden" onChange={handlePatientIdChange} />
                          <i className="fa-solid fa-upload text-[11px]"></i>
                          {tr('Upload File', 'Mag-upload ng File')}
                        </label>
                      ) : (
                        <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl pl-1.5 pr-3 py-1.5">
                          {patientIdFile.type.startsWith('image/') ? (
                            <button type="button" onClick={() => setViewingFileUrl(URL.createObjectURL(patientIdFile))}
                              className="w-8 h-8 rounded-[7px] overflow-hidden border border-gray-100 flex-shrink-0">
                              <img src={URL.createObjectURL(patientIdFile)} alt={patientIdFile.name} className="w-full h-full object-cover" />
                            </button>
                          ) : (
                            <i className="fa-solid fa-file-pdf text-red-400"></i>
                          )}
                          <span className="text-[12px] text-gray-600 truncate max-w-[160px]">{patientIdFile.name}</span>
                          <button type="button" onClick={() => setPatientIdFile(null)}
                            className="text-gray-400 hover:text-red-500 transition">
                            <i className="fa-solid fa-xmark text-[11px]"></i>
                          </button>
                        </div>
                      )}
                      <span className="text-[11px] text-gray-400">JPG, PNG, PDF</span>
                    </div>
                  </div>

                  {/* Contact Person */}
                  <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/40 space-y-3">
                    <h3 className="text-[13px] font-semibold text-gray-800">{tr('Contact Person', 'Contact Person')}</h3>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input type="checkbox"
                        checked={contactSameAsPatient}
                        onChange={e => setContactSameAsPatient(e.target.checked)}
                        className="w-4 h-4 mt-0.5 rounded-md border-gray-200 text-success focus:ring-success cursor-pointer" />
                      <span>
                        <span className="block text-[12px] font-semibold text-gray-700">{tr('Same as patient details', 'Kapareho ng detalye ng pasyente')}</span>
                        <span className="block text-[11px] text-gray-400 mt-0.5">{tr('Check this if the patient is the one placing the inquiry.', 'I-check ito kung ang pasyente mismo ang nagpapadala ng inquiry.')}</span>
                      </span>
                    </label>

                    {!contactSameAsPatient && (
                      <div className="grid grid-cols-1 gap-3 pt-1">
                        <div className="space-y-1.5">
                          <label className="block text-[12px] font-medium text-gray-500">{tr("Contact Person's Full Name", 'Buong Pangalan ng Contact Person')}</label>
                          <input type="text" placeholder={tr('Person we should contact', 'Taong dapat naming kontakin')}
                            required={!contactSameAsPatient}
                            value={formData.contactName}
                            onChange={e => setFormData(f => ({ ...f, contactName: e.target.value }))}
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-700 outline-none focus:border-primary transition" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-[12px] font-medium text-gray-500">{tr('Relationship to Patient', 'Kaugnayan sa Pasyente')}</label>
                          <select
                            value={formData.contactRelationship}
                            onChange={e => setFormData(f => ({ ...f, contactRelationship: e.target.value }))}
                            className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-700 outline-none focus:border-primary transition">
                            <option value="">{tr('Select relationship (optional)', 'Pumili ng kaugnayan (opsyonal)')}</option>
                            <option value="Family member">{tr('Family member', 'Kapamilya')}</option>
                            <option value="Caregiver">{tr('Caregiver', 'Caregiver')}</option>
                            <option value="Guardian">{tr('Guardian', 'Guardian')}</option>
                            <option value="Healthcare professional">{tr('Healthcare professional', 'Healthcare professional')}</option>
                            <option value="Other">{tr('Other', 'Iba pa')}</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-gray-500 mb-2">{tr('Email Address', 'Email Address')}</label>
                    <input
                      type="email"
                      required
                      placeholder="john@example.com"
                      value={formData.email}
                      onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-700 outline-none focus:border-primary transition"
                    />
                  </div>
                  <div className="flex gap-3 items-end">
                    <div className="flex-1 min-w-0">
                      <label className="block text-[13px] font-medium text-gray-500 mb-2">{tr('Phone Number', 'Phone Number')}</label>
                      <input
                        type="tel"
                        required
                        placeholder="+63 900 000 0000"
                        value={formData.phone}
                        onChange={e => setFormData(f => ({ ...f, phone: e.target.value.replace(/[^\d+\s\-()]/g, '') }))}
                        inputMode="numeric"
                        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-700 outline-none focus:border-primary transition"
                      />
                    </div>
                    <div className="w-[90px] shrink-0" ref={ageDropdownRef}>
                      <label className="block text-[13px] font-medium text-gray-500 mb-2">{tr('Age', 'Edad')}</label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setAgeDropdownOpen(o => !o)}
                          className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-700 outline-none focus:border-primary transition cursor-pointer"
                        >
                          <span className={formData.age ? 'text-gray-700' : 'text-gray-400'}>{formData.age || tr('Age', 'Edad')}</span>
                          <i className="fa-solid fa-chevron-down text-[10px] text-gray-400" />
                        </button>
                        {ageDropdownOpen && (
                          <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-xl shadow-xl border border-gray-100 z-[60] overflow-hidden">
                            <div className="max-h-48 overflow-y-auto">
                              {Array.from({ length: 63 }, (_, i) => i + 18).map(age => (
                                <button
                                  key={age}
                                  type="button"
                                  onClick={() => { setFormData(f => ({ ...f, age: String(age) })); setAgeDropdownOpen(false); }}
                                  className={`w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50 transition ${formData.age === String(age) ? 'bg-blue-50 text-primary font-semibold' : 'text-gray-700'}`}
                                >
                                  {age}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-gray-500 mb-2">{tr('Delivery Address', 'Delivery Address')}</label>
                    <input type="text" placeholder={tr('Complete address for courier delivery', 'Kumpletong address para sa delivery')}
                      required
                      value={formData.address}
                      onChange={e => setFormData(f => ({ ...f, address: e.target.value }))}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-700 outline-none focus:border-primary transition" />
                  </div>

                  <div>
                    <label className="block text-[13px] font-medium text-gray-500 mb-2">{tr('Upload Prescription (Required)', 'I-upload ang Reseta (Required)')}</label>
                    <input
                      type="file"
                      multiple
                      accept={ALLOWED_FILE_TYPES_ACCEPT}
                      onChange={handleFileChange}
                      className="w-full text-[13px] text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-[12px] file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 transition cursor-pointer border border-gray-200 rounded-xl p-1.5 bg-white outline-none"
                    />
                    {uploadedFiles.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {uploadedFiles.map((file, fi) => (
                          <div key={fi} className="flex items-center text-[11px] text-gray-500 bg-gray-50 px-2 py-1.5 rounded-md border border-gray-100">
                            <i className="fa-solid fa-file-lines mr-2" style={{ color: 'rgba(13,153,255,0.7)' }} />
                            <span className="truncate">{file.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-start gap-2 text-[11px] text-gray-400 pt-1">
                    <i className="fa-solid fa-circle-info mt-0.5 flex-shrink-0"></i>
                    <span>{tr('Our pharmacists will contact you on the mobile number provided.', 'Kokontakin ka ng aming mga pharmacist sa ibinigay mong mobile number.')}</span>
                  </div>

                  <hr className="border-gray-100" />

                  <div className="space-y-2.5">
                    <h3 className="text-[13px] font-semibold text-gray-800">{tr('Declarations and Consent', 'Mga Deklarasyon at Pahintulot')}</h3>
                    <div className="flex items-start gap-2.5">
                      <input type="checkbox" id="pd-terms"
                        checked={formData.terms}
                        onChange={e => setFormData(f => ({ ...f, terms: e.target.checked }))}
                        className="w-4 h-4 mt-0.5 rounded-md border-gray-200 text-success focus:ring-success cursor-pointer" />
                      <label htmlFor="pd-terms" className="text-[11px] text-gray-500 cursor-pointer">
                        {tr(
                          'I confirm that the information provided is accurate and that the prescription submitted is valid.',
                          'Kinukumpirma ko na tama ang impormasyong ibinigay at valid ang resetang isinumite.',
                        )}
                      </label>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <input type="checkbox" id="pd-privacyConsent"
                        checked={formData.privacyConsent}
                        onChange={e => setFormData(f => ({ ...f, privacyConsent: e.target.checked }))}
                        className="w-4 h-4 mt-0.5 rounded-md border-gray-200 text-success focus:ring-success cursor-pointer" />
                      <label htmlFor="pd-privacyConsent" className="text-[11px] text-gray-500 cursor-pointer">
                        {tr(
                          'I have read and understood the Privacy Policy and consent to the collection, use, and processing of my personal and sensitive personal information for the purpose of verifying and processing this inquiry.',
                          'Nabasa at naintindihan ko ang Privacy Policy at pumapayag ako sa pagkolekta, paggamit, at pagproseso ng aking personal at sensitibong personal na impormasyon para ma-verify at maproseso ang inquiry na ito.',
                        )}
                      </label>
                    </div>
                  </div>

                  <Turnstile turnstile={turnstile} />

                  <button
                    type="submit"
                    disabled={submitState === 'sending' || submitState === 'sent' || (turnstile.enabled && !turnstile.token)}
                    className="w-full text-white font-bold py-3 rounded-xl transition-all duration-500 transform active:scale-[0.98] mt-6 mb-4 text-[13px]"
                    style={submitState === 'sent'
                      ? { background: '#61A644' }
                      : { background: 'linear-gradient(to right, #61A644, #0D99FF)' }}
                  >
                    {submitState === 'sending'
                      ? tr('Sending...', 'Ipinapadala...')
                      : submitState === 'sent'
                        ? tr('✓ Inquiry Sent Successfully!', '✓ Naipadala na ang Inquiry!')
                        : submitState === 'error'
                          ? tr('Failed to submit. Try again.', 'Hindi naipadala. Subukan ulit.')
                          : tr('Submit Inquiry Request', 'Ipadala ang Inquiry')}
                  </button>

                  {/* Medical Disclaimer */}
                  <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-2.5 mb-4">
                    <i className="fa-solid fa-triangle-exclamation text-amber-500 mt-0.5 flex-shrink-0 text-sm"></i>
                    <p className="text-[10.5px] text-amber-800 leading-relaxed">
                      <span className="font-bold">{tr('Medical Disclaimer: ', 'Paalala Medikal: ')}</span>
                      {tr(
                        'Getmeds dispenses prescription medicines only upon receipt of a valid prescription from a licensed physician. This service does not replace professional medical advice, diagnosis, or treatment.',
                        'Nagbibigay lamang ang Getmeds ng mga gamot na nangangailangan ng reseta kapag may valid na reseta mula sa lisensyadong doktor. Hindi pumapalit ang serbisyong ito sa propesyonal na payo, diagnosis, o gamutan ng doktor.',
                      )}
                    </p>
                  </div>
                  <div className="h-4" />
                </form>
                ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[13px] font-medium text-gray-500 mb-2">{tr('Target Product', 'Produkto')}</label>
                    <input
                      type="text"
                      readOnly
                      value={getProductDisplayName(product)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 text-[13px] font-semibold outline-none cursor-default"
                      style={{ color: '#0D99FF' }}
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-gray-500 mb-2">{tr('Full Name', 'Buong Pangalan')}</label>
                    <input
                      type="text"
                      required
                      placeholder="John Doe"
                      value={formData.name}
                      onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-700 outline-none focus:border-primary transition"
                    />
                  </div>
                  <div className="flex gap-3 items-end">
                    <div className="flex-1 min-w-0">
                      <label className="block text-[13px] font-medium text-gray-500 mb-2">{tr('Phone Number', 'Phone Number')}</label>
                      <input
                        type="tel"
                        required
                        placeholder="+63 900 000 0000"
                        value={formData.phone}
                        onChange={e => setFormData(f => ({ ...f, phone: e.target.value.replace(/[^\d+\s\-()]/g, '') }))}
                        inputMode="numeric"
                        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-700 outline-none focus:border-primary transition"
                      />
                    </div>
                    <div className="w-[90px] shrink-0" ref={ageDropdownRef}>
                      <label className="block text-[13px] font-medium text-gray-500 mb-2">{tr('Age', 'Edad')}</label>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setAgeDropdownOpen(o => !o)}
                          className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-700 outline-none focus:border-primary transition cursor-pointer"
                        >
                          <span className={formData.age ? 'text-gray-700' : 'text-gray-400'}>{formData.age || tr('Age', 'Edad')}</span>
                          <i className="fa-solid fa-chevron-down text-[10px] text-gray-400" />
                        </button>
                        {ageDropdownOpen && (
                          <div className="absolute top-full left-0 mt-1 w-full bg-white rounded-xl shadow-xl border border-gray-100 z-[60] overflow-hidden">
                            <div className="max-h-48 overflow-y-auto">
                              {Array.from({ length: 63 }, (_, i) => i + 18).map(age => (
                                <button
                                  key={age}
                                  type="button"
                                  onClick={() => { setFormData(f => ({ ...f, age: String(age) })); setAgeDropdownOpen(false); }}
                                  className={`w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50 transition ${formData.age === String(age) ? 'bg-blue-50 text-primary font-semibold' : 'text-gray-700'}`}
                                >
                                  {age}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-gray-500 mb-2">{tr('Email Address', 'Email Address')}</label>
                    <input
                      type="email"
                      required
                      placeholder="john@example.com"
                      value={formData.email}
                      onChange={e => setFormData(f => ({ ...f, email: e.target.value }))}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-700 outline-none focus:border-primary transition"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] font-medium text-gray-500 mb-2">{tr('Message', 'Mensahe')}</label>
                    <textarea
                      rows={3}
                      placeholder={tr('Tell us more about your requirements...', 'Sabihin sa amin ang iyong kailangan...')}
                      value={formData.message}
                      onChange={e => setFormData(f => ({ ...f, message: e.target.value }))}
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] text-gray-700 outline-none focus:border-primary transition resize-none"
                    />
                  </div>
                  <Turnstile turnstile={turnstile} />

                  <button
                    type="submit"
                    disabled={submitState === 'sending' || submitState === 'sent' || (turnstile.enabled && !turnstile.token)}
                    className="w-full text-white font-bold py-3 rounded-xl transition-all duration-500 transform active:scale-[0.98] mt-6 mb-8 text-[13px]"
                    style={submitState === 'sent'
                      ? { background: '#61A644' }
                      : { background: 'linear-gradient(to right, #61A644, #0D99FF)' }}
                  >
                    {submitState === 'sending'
                      ? tr('Sending...', 'Ipinapadala...')
                      : submitState === 'sent'
                        ? tr('✓ Inquiry Sent Successfully!', '✓ Naipadala na ang Inquiry!')
                        : submitState === 'error'
                          ? tr('Failed to submit. Try again.', 'Hindi naipadala. Subukan ulit.')
                          : tr('Submit Inquiry Request', 'Ipadala ang Inquiry')}
                  </button>
                  <div className="h-8" />
                </form>
                )}
              </div>
                );
                if (!app) return form;
                // In the app the form floats over the whole screen, tab bar
                // included, so it is rendered straight into <body>: inside the
                // page it sat in the page's own layer, under the tab bar.
                return createPortal(
                  <>
                    {inquiryOpen && (
                      <button
                        type="button"
                        aria-label={tr('Close inquiry', 'Isara ang inquiry')}
                        onClick={closeInquiry}
                        className="fixed inset-0 z-[10055] bg-[rgba(15,23,42,.45)]"
                      />
                    )}
                    {form}
                  </>,
                  document.body
                );
              })()}
            </div>

            {/* Similar products — app only. On the website this row would be
                competing with the category listing that is one click away in
                the breadcrumb; in the app there is no breadcrumb, so this is
                the only sideways move on the screen. */}
            {app && reviewSlug && (
              <ReviewsSection
                slug={reviewSlug}
                productName={[getProductDisplayName(product), product.strength].filter(Boolean).join(' ')}
                data={reviews.data}
                reload={reviews.reload}
              />
            )}

            {app && similar.length > 0 && (
              /* White like the rest of the screen; a hairline above marks the
                 break between "this product" and "other products", and the
                 cards carry a border rather than a shadow. */
              <section className="border-t border-[#EEF1F5] bg-white px-4 pb-8 pt-6">
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-[16px] font-medium tracking-tight text-gray-900">{tr('Similar products', 'Mga katulad na produkto')}</h2>
                  <a href={backUrl} className="text-[12px] font-semibold" style={{ color: '#0D99FF' }}>{tr('See all', 'Tingnan lahat')}</a>
                </div>
                <div className="space-y-2.5">
                  {similar.map((s) => {
                    const img = getProductImage(s, 140);
                    const hasImg = img && !img.endsWith('no-image.png');
                    return (
                      <a
                        key={s._id}
                        href={productHref(s)}
                        className="flex items-center gap-3 rounded-[16px] border border-[#EEF1F5] bg-white p-2.5"
                      >
                        <div className="flex h-[56px] w-[56px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F6F8FC] p-1.5">
                          {hasImg ? (
                            <img
                              src={img}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-contain mix-blend-multiply"
                              onError={(e) => { const i = e.currentTarget; i.onerror = null; i.src = '/assets/no-image.png'; }}
                            />
                          ) : (
                            <i className="fa-solid fa-pills text-[16px] text-gray-300" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="line-clamp-1 text-[13.5px] font-semibold text-gray-900">
                            {getProductDisplayName(s)}
                          </h3>
                          <p className="mt-0.5 line-clamp-1 text-[11.5px] text-gray-400">
                            {[s.strength, s.form].filter(Boolean).join(' · ') || s.subCategory || tr('Details on request', 'Detalye kapag nag-request')}
                          </p>
                        </div>
                        {s.prescription?.toUpperCase() === 'RX' && (
                          <span className="shrink-0 rounded-full bg-[#E8F5FC] px-2 py-[2px] text-[9.5px] font-semibold text-[#1D9FDA]">
                            Rx
                          </span>
                        )}
                        <i className="fa-solid fa-chevron-right shrink-0 text-[11px] text-gray-300" />
                      </a>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Clears the sticky bar below. pwaTabbar.js already pads <body> for the
          tab bar itself, but it knows nothing about this second bar stacked on
          top of it, and without this the end of the inquiry form sits under it. */}
      {app && product && <div aria-hidden="true" className="h-[76px] shrink-0" />}

      {/* The app's sticky action bar.
          Pinned above the tab bar rather than left in the flow, because the
          inquiry form is a long way down a long page and the one thing someone
          decides on this screen — "yes, this one" — should never require
          scrolling to act on. The offset is measured from the tab bar's own
          published footprint, not a copy of its height. */}
      {app && product && (
        <>
        <div
          className="fixed inset-x-0 z-[9995] flex items-center gap-2.5 border-t border-gray-100 bg-white px-4 py-3"
          /* Measured from the tab bar's own footprint rather than a copy of
             its height — pwaTabbar.js publishes --gm-tabbar-space precisely so
             this cannot fall out of step when the bar changes shape. The
             fallback is what that variable currently resolves to on a phone
             with no home indicator. */
          style={{ bottom: 'calc(var(--gm-tabbar-space, 74px) + 8px)' }}
        >
          <div className="flex-1">
            <AddToCart
              variant="full"
              item={{
                id: String(product._id || location.pathname),
                name: getProductDisplayName(product),
                strength: product.strength,
                form: product.form,
                url: location.pathname,
                needsRx: needsPrescription((product as any).Prescription),
                image: product.image?.asset ? getProductImage(product, 140) : undefined,
              }}
            />
          </div>
          <button
            type="button"
            onClick={openInquiry}
            className="flex-1 rounded-full py-3 text-[13px] font-semibold text-white"
            style={{ background: 'linear-gradient(135deg,#1D9FDA,#61A644)' }}
          >
            {tr('Send inquiry', 'Magpadala ng inquiry')}
          </button>
        </div>
        </>
      )}

      {/* Success Modal */}
      {successModalOpen && (
        <div className="fixed inset-0 z-[10070] flex items-center justify-center p-4" style={{ background: 'rgba(26,32,44,0.7)' }}>
          <div className="bg-white rounded-[20px] shadow-2xl p-10 max-w-sm w-full text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'linear-gradient(135deg,#61A644,#1D9FDA)' }}
            >
              <i className="fa-solid fa-check text-white text-2xl animate-bounce" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">{tr('Inquiry Sent!', 'Naipadala na ang Inquiry!')}</h3>
            <p className="text-sm text-gray-500 mb-6">
              {tr(
                'Thank you for your inquiry. Our team will get back to you shortly with a formal quote.',
                'Salamat sa iyong inquiry. Babalikan ka agad ng aming team na may formal na quote.',
              )}
            </p>
            <div className="border-t border-gray-100 pt-4 text-center">
              <button
                onClick={() => setSuccessModalOpen(false)}
                className="text-[13px] font-semibold hover:underline"
                style={{ background: 'linear-gradient(to right,#61A644,#1D9FDA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
              >
                {tr('Close', 'Isara')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prescription Required Modal — styled after "Not on Record" in employee-verification portal */}
      {prescriptionRequiredModalOpen && (
        <>
          <div
            className={`fixed inset-0 z-[10080] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 transition-opacity duration-200 ${prescriptionModalVisible ? 'opacity-100' : 'opacity-0'}`}
            onClick={() => { setPrescriptionModalVisible(false); setTimeout(() => setPrescriptionRequiredModalOpen(false), 200); }}
          >
            <div
              className={`bg-white w-full max-w-[400px] rounded-2xl shadow-2xl relative overflow-hidden rx-modal-slide transform transition-all duration-200 ${prescriptionModalVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
              onClick={e => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                type="button"
                onClick={() => { setPrescriptionModalVisible(false); setTimeout(() => setPrescriptionRequiredModalOpen(false), 200); }}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition z-10"
              >
                <i className="fa-solid fa-xmark text-base"></i>
              </button>

              {/* Body */}
              <div className="px-8 pt-8 pb-5 text-center">
                <div className="flex justify-center mb-4">
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,#EF4444,#F59E0B)' }}
                  >
                    <i className="fa-solid fa-file-medical text-white text-xl"></i>
                  </div>
                </div>
                <h2 className="text-[19px] font-semibold text-gray-900 mb-2 leading-snug">{tr('Prescription Required', 'Kailangan ng Reseta')}</h2>
                <p className="text-[13px] text-red-600 font-medium mb-3 leading-relaxed">
                  {tr('A valid prescription is required before your inquiry can be submitted.', 'Kailangan ng valid na reseta bago maipadala ang iyong inquiry.')}
                </p>
                <p className="text-[13px] text-gray-500 leading-relaxed">
                  {tr(
                    'As a Patient / Caregiver, please attach your doctor-issued prescription (JPG, PNG, or PDF) to ensure your medicine request complies with Philippine FDA regulations and can be processed safely by our team.',
                    'Bilang Pasyente / Caregiver, ilakip ang resetang galing sa iyong doktor (JPG, PNG, o PDF) para sumunod ang iyong request sa regulasyon ng Philippine FDA at maproseso ito nang ligtas ng aming team.',
                  )}
                </p>
              </div>

              {/* Footer */}
              <div className="border-t border-gray-100 px-8 py-3 text-center">
                <button
                  type="button"
                  onClick={() => { setPrescriptionModalVisible(false); setTimeout(() => setPrescriptionRequiredModalOpen(false), 200); }}
                  className="text-[13px] font-semibold hover:underline"
                  style={{ background: 'linear-gradient(to right,#61A644,#1D9FDA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
                >
                  {tr('I Understand, Upload Now', 'Naiintindihan Ko, Mag-upload Na')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ID Required Modal — Patient/Caregiver flow, mirrors order-medicines.tsx's ID-required prompt */}
      {idRequiredModalOpen && (
        <>
          <div
            className={`fixed inset-0 z-[10080] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 transition-opacity duration-200 ${idModalVisible ? 'opacity-100' : 'opacity-0'}`}
            onClick={() => { setIdModalVisible(false); setTimeout(() => setIdRequiredModalOpen(false), 200); }}
          >
            <div
              className={`bg-white w-full max-w-[400px] rounded-2xl shadow-2xl relative overflow-hidden id-modal-slide transform transition-all duration-200 ${idModalVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
              onClick={e => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => { setIdModalVisible(false); setTimeout(() => setIdRequiredModalOpen(false), 200); }}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition z-10"
              >
                <i className="fa-solid fa-xmark text-base"></i>
              </button>

              <div className="px-8 pt-8 pb-5 text-center">
                <div className="flex justify-center mb-4">
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,#EF4444,#F59E0B)' }}
                  >
                    <i className="fa-solid fa-id-card text-white text-xl"></i>
                  </div>
                </div>
                <h2 className="text-[19px] font-semibold text-gray-900 mb-2 leading-snug">{tr('Valid ID Required', 'Kailangan ng Valid ID')}</h2>
                <p className="text-[13px] text-red-600 font-medium mb-3 leading-relaxed">
                  {tr('A valid ID of the patient is required before your inquiry can be submitted.', 'Kailangan ng valid ID ng pasyente bago maipadala ang iyong inquiry.')}
                </p>
                <p className="text-[13px] text-gray-500 leading-relaxed">
                  {tr(
                    'Please upload a valid government-issued ID (JPG, PNG, or PDF) so we can confirm the prescription is being dispensed to the right person.',
                    'Mag-upload ng valid na government ID (JPG, PNG, o PDF) para makumpirma naming maibibigay ang gamot sa tamang tao.',
                  )}
                </p>
              </div>

              <div className="border-t border-gray-100 px-8 py-3 text-center">
                <button
                  type="button"
                  onClick={() => { setIdModalVisible(false); setTimeout(() => setIdRequiredModalOpen(false), 200); }}
                  className="text-[13px] font-semibold hover:underline"
                  style={{ background: 'linear-gradient(to right,#61A644,#1D9FDA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
                >
                  {tr('I Understand, Upload Now', 'Naiintindihan Ko, Mag-upload Na')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Uploaded ID Preview Modal — Patient/Caregiver flow */}
      {viewingFileUrl && (
        <div
          className="fixed inset-0 z-[10080] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md transition-all duration-300"
          onClick={() => setViewingFileUrl(null)}
        >
          <button
            className="absolute top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors cursor-pointer"
            onClick={() => setViewingFileUrl(null)}
          >
            <i className="fa-solid fa-xmark text-xl" />
          </button>
          <div
            className="max-w-[90vw] max-h-[90vh] overflow-hidden rounded-2xl bg-white p-4 shadow-2xl relative"
            onClick={e => e.stopPropagation()}
          >
            <img
              src={viewingFileUrl}
              className="max-w-full max-h-[80vh] object-contain"
              alt={tr('Uploaded ID', 'Na-upload na ID')}
            />
          </div>
        </div>
      )}

      {/* Zoomed Image Modal */}
      {zoomedImageOpen && product && (
        <div
          className="fixed inset-0 z-[10070] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md transition-all duration-300"
          onClick={() => setZoomedImageOpen(false)}
        >
          <button
            className="absolute top-6 right-6 w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors cursor-pointer"
            onClick={() => setZoomedImageOpen(false)}
          >
            <i className="fa-solid fa-xmark text-xl" />
          </button>
          <div
            className="max-w-[90vw] max-h-[90vh] overflow-hidden rounded-2xl bg-white p-4 shadow-2xl relative"
            onClick={e => e.stopPropagation()}
          >
            <img
              src={getProductImage(product)}
              className="max-w-full max-h-[80vh] object-contain transition-transform duration-300 hover:scale-150 cursor-zoom-in"
              alt={product.name}
              onError={(e) => { const img = e.currentTarget; img.onerror = null; img.src = '/assets/no-image.png'; }}
            />
          </div>
        </div>
      )}

      <AlertModal
        open={!!alertModal}
        onClose={() => setAlertModal(null)}
        title={alertModal?.title}
        message={alertModal?.message ?? ''}
      />
    </div>
  );
}
