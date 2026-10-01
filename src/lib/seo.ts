import ogImages from './og-images.json';

const SITE_NAME = 'Getmeds';
// og:site_name is the brand label social platforms print above the card, and it is the
// one the Organization JSON-LD carries as alternateName. SITE_NAME stays the short form
// because withSiteName() appends it to page titles.
const OG_SITE_NAME = 'Getmeds Philippines';
const BASE_URL = 'https://getmeds.ph';
// Share-card images, from the same table the prerender scripts read (scripts/lib/og-images.cjs),
// so hydration never swaps the card a scraper saw for a different one.
const DEFAULT_IMAGE = `${BASE_URL}/assets/${ogImages.default.file}`;
const IMAGE_BY_FOLDER = new Map<string, string>(
  Object.values(ogImages.categories).flatMap(({ file, folders }) =>
    folders.map((folder): [string, string] => [folder, `${BASE_URL}/assets/${file}?v=${ogImages.categoryVersion}`])
  )
);
export const CONDITIONS_OG_IMAGE = `${BASE_URL}/assets/${ogImages.conditions.file}`;

/** The category share card for a folder such as "blood-disorder-medicines"; the site default otherwise. */
export function ogImageForFolder(folder?: string | null): string {
  return (folder && IMAGE_BY_FOLDER.get(folder.trim())) || DEFAULT_IMAGE;
}
/**
 * @id of the Organization node stamped into every static shell by
 * scripts/inject-organization-jsonld.cjs. Page-level blocks reference it instead of
 * repeating the company details, so it must stay byte-identical to the value there.
 */
export const ORGANIZATION_ID = `${BASE_URL}/#organization`;

export interface PageMetaOptions {
  title: string;
  description: string;
  path?: string;
  image?: string;
  type?: 'website' | 'article' | 'product';
}

function updateMeta(name: string, content: string, isProperty = false) {
  const selector = isProperty ? `meta[property="${name}"]` : `meta[name="${name}"]`;
  let el = document.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(isProperty ? 'property' : 'name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function updateCanonical(path: string) {
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', `${BASE_URL}${path}`);
}

export function injectJsonLd(id: string, data: Record<string, unknown>) {
  let el = document.getElementById(id) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement('script');
    el.id = id;
    el.setAttribute('type', 'application/ld+json');
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify({ '@context': 'https://schema.org', ...data });
}

export function removeJsonLd(id: string) {
  document.getElementById(id)?.remove();
}

/**
 * Appends " - Getmeds" only when the title doesn't already say it. Product titles come
 * from the sheet's Meta Title column and already end "| Getmeds Philippines", and several
 * blog posts open with the brand ("Getmeds Completes UN Global Compact…"), so appending
 * unconditionally printed the brand twice — e.g. "… | Getmeds Philippines - Getmeds".
 *
 * The hyphen is the site-wide separator, and scripts/lib/site-title.cjs is the build-time
 * twin of this function. The two cannot be one module — that one is CommonJS run by node
 * during the build, this is bundled into the browser — so a change to the separator has to
 * be made in both, or a page's title will change the moment it hydrates. That divergence is
 * exactly what Audit 3 found, and scripts/check-duplicate-titles.cjs is what would catch it.
 */
export function withSiteName(title: string): string {
  const t = (title || '').trim();
  if (!t) return SITE_NAME;
  return new RegExp(SITE_NAME, 'i').test(t) ? t : `${t} - ${SITE_NAME}`;
}

/**
 * Words that leave the reader mid-thought if they are the last thing on the line. Ending a
 * description on any of these reads as a page that broke rather than a sentence that ran on.
 */
const DANGLING_WORDS = new Set([
  'a', 'an', 'the',
  'and', 'or', 'but', 'nor', 'so', 'yet', 'plus',
  'of', 'in', 'to', 'from', 'by', 'on', 'at', 'as', 'for', 'with', 'without',
  'into', 'onto', 'over', 'under', 'per', 'via', 'about', 'after', 'before',
  'between', 'during', 'through', 'within', 'across', 'against', 'among',
  'around', 'beyond', 'near', 'since', 'until', 'upon',
  'that', 'which', 'who', 'whom', 'whose', 'this', 'these', 'those',
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'has', 'have', 'had', 'will', 'would', 'can', 'could', 'may', 'might',
  'shall', 'should', 'must', 'do', 'does', 'did',
  'its', 'their', 'our', 'your', 'his', 'her', 'my',
  'if', 'when', 'while', 'than', 'then', 'because', 'although', 'though',
  'unless', 'whether', 'both', 'either', 'neither', 'not', 'no',
]);

/**
 * Cuts a meta description to `max` characters without ending it somewhere that reads as
 * broken: trailing function words are dropped and an ellipsis marks the cut, while text
 * already ending on sentence punctuation is left alone.
 *
 * The build-time twin is truncateAtWord in scripts/lib/site-title.cjs and the two must stay
 * behaviourally identical — a product page runs this over the same source text the
 * prerender already wrote into the served HTML, so any difference would rewrite the
 * description the moment the page hydrates. scripts/check-descriptions.cjs is what catches
 * a bad ending; nothing can catch a silent disagreement between these two but a person.
 */
export function truncateAtWord(text: string, max: number): string {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;

  // One character is held back so the ellipsis fits inside `max`.
  const cut = t.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  let out = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;

  const floor = Math.floor(max * 0.4);
  for (;;) {
    const trimmed = out.replace(/[\s,;:\-–—]+$/, '');
    const lastWord = trimmed.match(/\s([A-Za-z][A-Za-z']*)$/);
    if (lastWord && trimmed.length > floor && DANGLING_WORDS.has(lastWord[1].toLowerCase())) {
      out = trimmed.slice(0, trimmed.length - lastWord[0].length);
      continue;
    }
    out = trimmed;
    break;
  }

  if (!out) return '';
  return /[.!?]$/.test(out) ? out : out + '…';
}

/**
 * The named entities that actually occur in this content, plus numeric forms. &amp; is
 * decoded last so "&amp;lt;" ends up as "&lt;" rather than "<".
 */
function decodeEntities(str: string): string {
  return String(str || '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rdquo;/g, '”')
    .replace(/&ldquo;/g, '“')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Turns a block of stored HTML into plain text fit for a meta description: tags out,
 * entities decoded, then truncated on a word a reader can stop on.
 *
 * The build-time twin is excerptFromHtml in scripts/lib/site-title.cjs. The policy pages run
 * this over the same stored content the prerender already wrote into the served HTML, so the
 * two must agree or the description is rewritten on hydration.
 */
export function excerptFromHtml(html: string, max: number): string {
  const text = decodeEntities(String(html || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  return truncateAtWord(text, max);
}

export function setPageMeta({ title, description, path, image, type = 'website' }: PageMetaOptions) {
  const fullTitle = withSiteName(title);
  document.title = fullTitle;

  updateMeta('description', description);
  updateMeta('og:type', type, true);
  updateMeta('og:site_name', OG_SITE_NAME, true);
  updateMeta('og:title', fullTitle, true);
  updateMeta('og:description', description, true);
  updateMeta('og:image', image || DEFAULT_IMAGE, true);

  if (path) {
    updateMeta('og:url', `${BASE_URL}${path}`, true);
    updateCanonical(path);
  }

  updateMeta('twitter:card', 'summary_large_image');
  updateMeta('twitter:title', fullTitle);
  updateMeta('twitter:description', description);
  updateMeta('twitter:image', image || DEFAULT_IMAGE);
}

// ---- Condition structured-data helpers ---------------------------------------------
// Duplicated, deliberately, in scripts/prerender-slugs.cjs: that is a standalone CJS build
// script and cannot import from here. The two copies must produce identical output, since
// the runtime block overwrites the prerendered one on hydration.

/**
 * schema.org's MedicalSpecialty is a closed enumeration, so the sheet's free-text specialty
 * is mapped onto a real enum value. Anything unrecognised returns null and the property is
 * left off that page — a wrong enum value is worse than a missing one.
 */
const MEDICAL_SPECIALTIES: Record<string, string> = {
  oncology: 'Oncologic', oncologic: 'Oncologic',
  hematology: 'Hematologic', haematology: 'Hematologic', hematologic: 'Hematologic',
  cardiology: 'Cardiovascular', cardiovascular: 'Cardiovascular',
  endocrinology: 'Endocrine', endocrine: 'Endocrine',
  nephrology: 'Renal', renal: 'Renal',
  neurology: 'Neurologic', neurologic: 'Neurologic',
  rheumatology: 'Rheumatologic', rheumatologic: 'Rheumatologic',
  'infectious disease': 'Infectious', 'infectious diseases': 'Infectious', infectious: 'Infectious',
  musculoskeletal: 'Musculoskeletal',
  gastroenterology: 'Gastroenterologic', gastroenterologic: 'Gastroenterologic',
  pulmonology: 'Pulmonary', pulmonary: 'Pulmonary', respiratory: 'Pulmonary',
  urology: 'Urologic', urologic: 'Urologic',
  gynecology: 'Gynecologic', gynecologic: 'Gynecologic',
  dermatology: 'Dermatologic', dermatologic: 'Dermatologic',
  radiology: 'Radiography', radiography: 'Radiography',
  anesthesia: 'Anesthesia', anaesthesia: 'Anesthesia',
  pathology: 'Pathology',
  pediatrics: 'Pediatric', pediatric: 'Pediatric',
  psychiatry: 'Psychiatric', psychiatric: 'Psychiatric',
  surgery: 'Surgical', surgical: 'Surgical',
  toxicology: 'Toxicologic',
  genetics: 'Genetic', genetic: 'Genetic',
};

export function specialtyUrl(value?: string): string | null {
  const enumValue = MEDICAL_SPECIALTIES[String(value || '').trim().toLowerCase()];
  return enumValue ? `https://schema.org/${enumValue}` : null;
}

/** Used only when a condition has a review date but no explicit reviewer of its own. */
export const DEFAULT_CONDITION_REVIEWER = 'Ivy Marcel F. Varias, RPh';

/**
 * `lastReviewed` is a public claim that a named pharmacist read the page on that date, so
 * only a real, well-formed calendar date counts. The pair is all-or-nothing: with no date
 * there is no claim to make, and the rest of the MedicalWebPage block stands on its own.
 */
export function conditionReviewFields(lastReviewed?: string, reviewedBy?: string) {
  const date = String(lastReviewed || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (!date) return {};
  return {
    lastReviewed: date[1],
    reviewedBy: {
      '@type': 'Person',
      name: String(reviewedBy || '').trim() || DEFAULT_CONDITION_REVIEWER,
      jobTitle: 'Registered Pharmacist',
      affiliation: { '@id': ORGANIZATION_ID },
    },
  };
}

export function buildNextMetadata(pageKey: string, customTitle?: string, customDescription?: string) {
  const titles: Record<string, string> = {
    careers: 'Careers at Getmeds Philippines | Join Our Team',
    'employee-verification': 'Employee Verification | Getmeds Philippines',
    'global-presence': 'Global Presence & Reach | Getmeds Philippines',
    meditations: 'Meditations & Wellness | Getmeds Philippines',
    ungc: 'UN Global Compact Commitment | Getmeds Philippines',
  };
  const descriptions: Record<string, string> = {
    careers: 'Explore career opportunities at Getmeds. Join our team in making specialty medicines accessible and affordable across the Philippines.',
    'employee-verification': 'Verify employment details for Getmeds team members.',
    'global-presence': 'Learn about Getmeds global presence and network supporting medicine access.',
    meditations: 'Wellness resources and guidance for patients and healthcare professionals.',
    ungc: 'Getmeds commitment to the United Nations Global Compact initiative and sustainable practices.',
  };

  const title = customTitle || titles[pageKey] || `${pageKey} | Getmeds`;
  const description = customDescription || descriptions[pageKey] || 'Getmeds - Specialty Medicine Access in the Philippines.';
  const fullTitle = withSiteName(title);

  return {
    title: fullTitle,
    description,
    openGraph: {
      title: fullTitle,
      description,
      siteName: OG_SITE_NAME,
      images: [{ url: DEFAULT_IMAGE }],
    },
    twitter: {
      card: 'summary_large_image' as const,
      title: fullTitle,
      description,
      images: [DEFAULT_IMAGE],
    },
  };
}

