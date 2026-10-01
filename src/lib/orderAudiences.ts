// The four audiences the Order Medicines section serves, and the one place their
// URL, internal type value, labels and page metadata are defined.
//
// Before this, the audience was carried in localStorage ('getmeds-order-usertype'):
// every entry point wrote the key and navigated to the single /order-medicines URL,
// which then rendered one of four very different pages behind one title, one
// description and one canonical. Four audiences now get four real URLs, and the
// URL — not storage — decides which page renders.
//
// `type` is the internal value the rest of the app already uses ('pharmacy', not
// 'distributors'): forms, inquiry routing and the admin spreadsheets are keyed on
// it, so only the public slug and labels follow the new copy. It is the same value
// as `TypeDef.value` in lib/audienceTypes.ts, which owns the other half of this —
// which fields each audience's form collects and which spreadsheet it lands in.
// This file owns only the URL and the public wording; the two must agree on the
// four values and on `label`.
//
// Kept in step with:
//   - src/pages/order-medicines.tsx   (renders the hub and each audience page)
//   - public/components/navbar.html   (the "Order Medicines" link, which points at the hub)
//   - src/pages/home.tsx              (the home page's Order Medicines chooser)
//   - scripts/prerender-order-medicines.cjs (bakes `meta` into static HTML)
//   - vite.config.js / vercel.json    (routing for /order-medicines/:slug)

export type OrderAudienceSlug = 'patients' | 'doctors' | 'distributors' | 'hospitals';
export type OrderAudienceType = 'patient' | 'doctor' | 'pharmacy' | 'hospital';

export interface OrderAudience {
  /** URL segment under /order-medicines. */
  slug: OrderAudienceSlug;
  /** Internal value used by the forms, inquiry routing and stored records. */
  type: OrderAudienceType;
  /** Short label — navbar dropdown, mobile accordion, form badge. */
  label: string;
  /** Hub card heading. */
  cardTitle: string;
  /** Hub card body. */
  cardBody: string;
  /** Hub card call to action. */
  cardCta: string;
  icon: string;
  /** Photo band at the top of the hub card. See public/assets/order-medicines/CREDITS.md. */
  image: string;
  /** Describes the photo for a screen reader; never repeats the card heading. */
  imageAlt: string;
  /** Baked into the static HTML for this URL by the prerender step. */
  meta: { title: string; description: string };
}

export const ORDER_AUDIENCES: OrderAudience[] = [
  {
    slug: 'patients',
    type: 'patient',
    label: 'Patient / Caregiver',
    cardTitle: 'Patients & Families',
    cardBody: 'Upload a prescription and we deliver to your door.',
    cardCta: 'Order with a prescription',
    icon: 'fa-house-medical',
    image: '/assets/order-medicines/ordermedicinepatient.jpg',
    imageAlt: 'A mother and her young daughter holding each other on a hospital bed',
    meta: {
      title: 'Order Prescription Medicine Online for Patients',
      description:
        'Upload your prescription and have your medicines delivered nationwide in the Philippines. Senior and PWD discounts honoured.',
    },
  },
  {
    slug: 'doctors',
    type: 'doctor',
    label: 'Doctor / Healthcare Professional',
    cardTitle: 'Doctors & Healthcare Professionals',
    cardBody: 'Product orders, pricing and Compassionate Special Permits.',
    cardCta: 'Send an inquiry',
    icon: 'fa-user-doctor',
    image: '/assets/order-medicines/ordermedicinedoctor.jpg',
    imageAlt: 'A line of doctors and nurses in white coats and scrubs, clipboards in hand',
    meta: {
      title: 'Medicine Orders for Doctors and Healthcare Professionals',
      description:
        'Product orders, pricing, documentation and Compassionate Special Permit coordination for doctors across the Philippines.',
    },
  },
  {
    slug: 'distributors',
    type: 'pharmacy',
    label: 'Pharmacy Owner / Retail Pharmacy',
    cardTitle: 'Distributors & Pharmacies',
    cardBody: 'Wholesale supply, credit terms and a distributor account.',
    cardCta: 'Become a distributor partner',
    icon: 'fa-shop',
    image: '/assets/order-medicines/ordermedicinedistributor.jpg',
    imageAlt: 'Two Getmeds staff checking a medicine box against a stock list in a pharmacy office',
    meta: {
      title: 'Pharmaceutical Distributor and Wholesale Pharmacy Supply',
      description:
        'Wholesale supply, credit terms and a distributor account for pharmacies and drugstores across the Philippines.',
    },
  },
  {
    slug: 'hospitals',
    type: 'hospital',
    label: 'Hospital / Institution',
    cardTitle: 'Hospitals & Institutions',
    cardBody: 'Quotations, emergency purchases and hospital procurement.',
    cardCta: 'Request a quotation',
    icon: 'fa-hospital',
    image: '/assets/order-medicines/ordermedicinehospitals.jpg',
    imageAlt: 'The entrance canopy of a modern multi-storey hospital',
    meta: {
      title: 'Hospital Medicine Procurement and Quotations',
      description:
        'Quotations, emergency purchases and institutional supply for hospitals and healthcare institutions in the Philippines.',
    },
  },
];

/** The hub itself — /order-medicines. Metadata comes straight from the approved copy. */
export const ORDER_HUB_META = {
  title: 'Order Prescription Medicine Online in the Philippines',
  description:
    'Prescription medicine delivery nationwide. Order medicines online in the Philippines.',
};

export const ORDER_MEDICINES_BASE = '/order-medicines';

export function audiencePath(audience: OrderAudience): string {
  return `${ORDER_MEDICINES_BASE}/${audience.slug}`;
}

export function audienceByType(type: string): OrderAudience | undefined {
  return ORDER_AUDIENCES.find((a) => a.type === type);
}

export function audienceBySlug(slug: string): OrderAudience | undefined {
  return ORDER_AUDIENCES.find((a) => a.slug === slug);
}

/** Path for an internal type value, falling back to the hub for an unknown one. */
export function pathForType(type: string): string {
  const audience = audienceByType(type);
  return audience ? audiencePath(audience) : ORDER_MEDICINES_BASE;
}

/**
 * The audience a pathname addresses, or undefined for the hub (and for anything
 * else — the router only ever serves this page under /order-medicines). Tolerates
 * a trailing slash and the .html form, both of which reach the page in dev.
 */
export function audienceFromPath(pathname: string): OrderAudience | undefined {
  const segments = pathname.replace(/\.html$/, '').split('/').filter(Boolean);
  if (segments[0] !== 'order-medicines') return undefined;
  return segments.length > 1 ? audienceBySlug(segments[1]) : undefined;
}
