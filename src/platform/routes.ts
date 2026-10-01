import { STATIC_CATEGORY_FOLDERS } from '@/lib/categoryFolders';
import { audienceBySlug } from '@/lib/orderAudiences';

/**
 * Every address the app has a screen for. Anything else is a website page (About us, the blog,
 * policies, careers...) and opens from getmeds.ph in an in-app browser tab.
 *
 * The app is one page: every link is a full load of index.html (Capacitor serves it for any path
 * without a file extension), and this table decides which screen that address shows. The screens
 * navigate with plain links and window.location, exactly as they did on the website.
 */
export type Route =
  | { screen: 'home' }
  | { screen: 'search' }
  | { screen: 'cart' }
  | { screen: 'account' }
  | { screen: 'chat' }
  | { screen: 'order'; audience?: string }
  | { screen: 'catalog' }
  | { screen: 'catalog-or-product'; prefix: string; slug: string }
  | { screen: 'redirect'; to: string }
  | { screen: 'website'; path: string };

// "/product-range" lists every product; "/conditions/<slug>" is the condition namespace.
const GENERIC_LISTING_PREFIXES = ['product-range', 'conditions'];
const LISTING_PREFIXES = new Set([...GENERIC_LISTING_PREFIXES, ...STATIC_CATEGORY_FOLDERS]);

/**
 * Condition slugs that render the listing rather than a product page. Same list as
 * STATIC_CONDITION_SLUGS in getmeds-frontend-v2/src/lib/catalogServer.ts; a condition added in
 * Sanity since is still recognised from the live categories (see CatalogOrProduct).
 */
export const STATIC_CONDITION_SLUGS = [
  'breast-cancer', 'ovarian-cancer', 'non-small-cell-lung-cancer', 'prostate-cancer', 'colorectal-cancer',
  'pancreatic-cancer', 'gastric-cancer-gastric-adenocarcinoma', 'head-and-neck-cancer',
  'malignant-pleural-mesothelioma', 'malignant-pleural-effusion', 'renal-cell-carcinoma', 'bladder-cancer',
  'cervical-cancer', 'hepatocellular-carcinoma', 'small-cell-lung-cancer', 'thyroid-cancer', 'testicular-cancer',
  'soft-tissue-sarcoma', 'acute-myeloid-leukemia', 'chronic-myeloid-leukemia', 'acute-lymphocytic-leukemia',
  'chronic-lymphocytic-leukemia', 'hodgkin-non-hodgkins-lymphoma', 'mantle-cell-lymphoma',
  'chronic-myelocytic-leukemia', 'meningeal-leukemia', 'acute-lymphoblastic-leukemia',
  'acute-promyelocytic-leukemia', 'sickle-cell-anemia', 'folate-deficiency-anemia', 'iron-deficiency-anemia',
  'respiratory-infections', 'urinary-tract-infections', 'skin-and-soft-tissue-infections',
  'bone-and-joint-infections', 'gynecological-infections', 'intra-abdominal-infections', 'bloodstream-infections',
  'ocular-or-topical-infections', 'endometriosis', 'fibrocystic-breast-disease', 'benign-prostatic-hyperplasia',
  'type-2-diabetes-mellitus', 'multiple-myeloma', 'glucocorticoid-induced-osteoporosis', 'arrhythmia-management',
  'hypertension-angina', 'radiology', 'inflammatory-and-rheumatic-disorders', 'chronic-pain-management',
  'chronic-kidney-disease', 'seasonal-allergies-allergic-rhinitis', 'glioblastoma-multiforme',
];

const safeDecode = (v: string) => {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
};

/** "/Cart.html/" -> "/cart"; the old site's .html addresses still turn up in saved links. */
export function normalisePath(pathname: string): string {
  return pathname.replace(/\.html$/i, '').replace(/\/+$/, '').toLowerCase() || '/';
}

export function resolveRoute(pathname: string): Route {
  const path = normalisePath(pathname);
  const seg = path.split('/').filter(Boolean).map(safeDecode);

  switch (path) {
    case '/':
    case '/index':
    case '/app-home':
      return { screen: 'home' };
    case '/search':
      return { screen: 'search' };
    case '/cart':
      return { screen: 'cart' };
    case '/profile':
    case '/account':
      return { screen: 'account' };
    case '/edit-profile':
      return { screen: 'redirect', to: '/profile#details' };
    case '/chat':
      return { screen: 'chat' };
    case '/order-medicines':
      return { screen: 'order' };
  }

  if (seg.length === 2 && seg[0] === 'order-medicines' && audienceBySlug(seg[1])) {
    return { screen: 'order', audience: seg[1] };
  }
  if (seg.length === 1 && LISTING_PREFIXES.has(seg[0]) && seg[0] !== 'conditions') {
    return { screen: 'catalog' };
  }
  if (seg.length === 2 && LISTING_PREFIXES.has(seg[0])) {
    if (seg[0] === 'conditions' || STATIC_CONDITION_SLUGS.includes(seg[1])) return { screen: 'catalog' };
    return { screen: 'catalog-or-product', prefix: seg[0], slug: seg[1] };
  }
  return { screen: 'website', path: pathname };
}

export const isAppPath = (pathname: string) => {
  const r = resolveRoute(pathname);
  return r.screen !== 'website';
};
