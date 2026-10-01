// Site-wide Sanity reads the original components.js made on every page load
// (fetchAndApplyLogo, fetchAndApplyFooterSettings, the policiesDisclaimers row).
// Each query is fetched once per page session and shared by every caller.

import { client } from '@/lib/sanity';

export type ContactGroup = {
  showInFooter?: boolean;
  showInTopBar?: boolean;
  addresses?: string[] | string;
  phones?: string[] | string;
  emails?: string[] | string;
};

export type SiteSettings = {
  logo?: { src?: { asset?: { _ref?: string } }; alt?: string };
  contactGroups?: ContactGroup[];
  contactInfo?: { address?: string[] | string; phone?: string[] | string; email?: string[] | string };
  copyright?: string;
  topBar?: { socials?: unknown[] };
  [key: string]: unknown;
};

export type PolicyDoc = { title?: string; slug?: string; displayMode?: string; contentHtml?: string };

const LOGO_QUERY = '*[_type == "siteSettings" && _id == "global-site-settings"][0]{ "logoUrl": logo.src.asset->url }';
const SETTINGS_QUERY = '*[_type == "siteSettings" && _id == "global-site-settings"][0]{ ..., topBar{ ..., socials[]-> }, contactGroups }';
const POLICY_QUERY = `*[_type == "policiesDisclaimers"]{ title, "slug": slug.current, displayMode, contentHtml }`;

let logoPromise: Promise<string | null> | null = null;
let settingsPromise: Promise<SiteSettings | null> | null = null;
let policiesPromise: Promise<PolicyDoc[] | null> | null = null;

export function fetchSiteLogoUrl(): Promise<string | null> {
  if (!logoPromise) {
    logoPromise = client
      .fetch<{ logoUrl?: string } | null>(LOGO_QUERY)
      .then((r) => r?.logoUrl || null)
      .catch((err) => {
        console.warn('[Getmeds] Failed to fetch dynamic logo:', err);
        return null;
      });
  }
  return logoPromise;
}

export function fetchSiteSettings(): Promise<SiteSettings | null> {
  if (!settingsPromise) {
    settingsPromise = client
      .fetch<SiteSettings | null>(SETTINGS_QUERY)
      .then((r) => r || null)
      .catch((err) => {
        console.warn('[Getmeds] Failed to fetch dynamic footer settings:', err);
        return null;
      });
  }
  return settingsPromise;
}

export function fetchPolicies(): Promise<PolicyDoc[] | null> {
  if (!policiesPromise) {
    policiesPromise = client.fetch<PolicyDoc[] | null>(POLICY_QUERY).catch((err) => {
      console.warn('[Getmeds] Sanity query failed:', err);
      // components.js's fetchSanityData resolved null on error (never rejected).
      return null;
    });
  }
  return policiesPromise;
}
