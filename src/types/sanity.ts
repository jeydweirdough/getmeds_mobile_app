/**
 * Getmeds Sanity TypeScript Types
 * Auto-generated from schema definitions
 */

// ─────────────────────────────────────────────
// Sanity Primitives
// ─────────────────────────────────────────────

export interface SanityReference<T = unknown> {
  _type: 'reference'
  _ref: string
  _weak?: boolean
}

export interface SanityAsset {
  _id: string
  _type: string
  url: string
  path: string
  assetId: string
  extension: string
  mimeType: string
  size: number
  metadata?: {
    dimensions?: { width: number; height: number; aspectRatio: number }
    lqip?: string
    palette?: Record<string, unknown>
  }
}

export interface SanitySlug {
  _type: 'slug'
  current: string
}

export interface SanityImage {
  _type: 'image'
  asset: SanityReference<SanityAsset>
  hotspot?: {
    x: number
    y: number
    height: number
    width: number
  }
  crop?: {
    top: number
    bottom: number
    left: number
    right: number
  }
}

// ─────────────────────────────────────────────
// Objects
// ─────────────────────────────────────────────

export interface MetaFields {
  _type: 'metaFields'
  title?: string
  description?: string
}

export interface ImageWithAlt {
  _type: 'imageWithAlt'
  src?: SanityImage
  alt?: string
}

export interface LinkItem {
  _type: 'linkItem'
  label?: string
  href?: string
  openInNewTab?: boolean
}

export interface Stat {
  _type: 'stat'
  value?: string
  label?: string
}

export interface FeatureCard {
  _type: 'featureCard'
  icon?: string
  title?: string
  description?: string
}

export interface SocialLink {
  _type: 'socialLink'
  platform?: 'facebook' | 'instagram' | 'linkedin' | 'youtube' | 'tiktok' | 'x'
  icon?: string
  href?: string
}

export interface AppDownloadLink {
  _type: 'appDownloadLink'
  platform?: 'ios' | 'android'
  label?: string
  href?: string
  icon?: string
}

export interface SimpleHero {
  _type: 'simpleHero'
  image?: SanityImage
  imageUrl?: string
  imageAlt?: string
  heading?: string
  headingLine1?: string
  headingAccent?: string
  description?: string
}

export interface SplitHero {
  _type: 'splitHero'
  image?: SanityImage
  imageAlt?: string
  headingLine1?: string
  headingAccent?: string
  description?: string
}

export interface HeroSlide {
  _key: string
  image?: SanityImage
  heading?: string
  description?: string
  enabled?: boolean
}

export interface HomeHero {
  _type: 'homeHero'
  backgroundImage?: SanityImage
  heading?: string
  headingLine1?: string
  headingAccent?: string
  description?: string
  subheading?: string
  slides?: HeroSlide[]
}

// ─────────────────────────────────────────────
// Core Documents
// ─────────────────────────────────────────────

export interface Category {
  _id: string
  _type: 'category'
  categoryId?: string
  category: string
  slug: SanitySlug
  subtitle?: string
  description?: string
  icon?: string
  image?: SanityImage
  subcategory?: string[]
  // Every Category Folder the sheet files this category under, in first-seen order.
  // Usually one, but a category can legitimately span several (Endocrinology sits under
  // both hormonal-therapy and diabetes-medicines), and each folder is its own URL.
  // `slug` holds folders[0] for callers that only need a single representative route.
  folders?: string[]
  importFilename?: string
  importFileId?: string
  name?: string
  title?: string
}

export interface ChatTurn {
  _key: string
  user?: string
  ai?: string
  timestamp?: string
}

export interface ChatSession {
  _id: string
  _type: 'chatSession'
  sessionId: string
  userName?: string
  lastSubject?: string
  sessionSummary?: string
  messages?: ChatTurn[]
  lastActivity?: string
}

export interface RelatedLink {
  _key: string
  title?: string
  url?: string
}

export interface FAQ {
  _id: string
  _type: 'faq'
  question: string
  // Portable Text since the FAQ answers began rendering on the website as well
  // as feeding the chatbot. Documents migrated before that change may still
  // hold a plain string, so readers must handle both.
  answer: SanityPortableTextBlock[] | string
  showOnHomepage?: boolean
  orderRank?: string
  keywords?: string[]
  relatedLinks?: RelatedLink[]
}

export interface Product {
  _id: string
  _type: 'product'
  genericName?: string
  brandName?: string
  name: string
  slug: SanitySlug
  availability?: boolean
  image?: SanityImage
  category?: SanityReference<Category>
  excelCategory?: string
  subCategory?: string
  description?: string
  strength?: string
  form?: string
  packaging?: string
  storageCondition?: string
  dosageAdministration?: string
  directionForReconstitution?: string
  mechanismOfAction?: string
  indications?: string
  supportingFacts?: string
  competitiveAdvantage?: string
  accreditations?: string
  uniqueSellingPoints?: string
  innovator?: string
  importFilename?: string
  importFileId?: string
  country?: string
  distributor?: string
  dosageAndAdministrationMarketingVersion2030WordsMax?: string
  importer?: string
  supplier?: string
  // ── "Products Range" workbook fields (current algorithm) ──────────────
  // Product Group: a finer grouping than brand (e.g. "PacliGet — Paclitaxel")
  productGroup?: string
  // URL category trail — the top-level section folder, e.g. "cancer-medicines"
  categoryFolder?: string
  // URL condition trail — the condition hub slug within categoryFolder, e.g. "breast-cancer"
  conditionSlug?: string
  conditionHubUrl?: string
  // Official product page URL when visited directly (categoryFolder + product slug)
  productPageUrl?: string
  // Precomputed "Home > Category > Condition > Product" breadcrumb trail
  breadcrumb?: string
  // Other condition names (comma-separated in the sheet) this same product page
  // is also linked from, so it can surface under more than one condition hub
  // without duplicating the product page itself.
  alsoLinkedFrom?: string
  // All condition names this product belongs under (subCategory + alsoLinkedFrom, deduped)
  conditions?: string[]
  // Per-condition hub slug/url lookup, keyed by condition name — covers conditions
  // whose own sheet row got deduped away when collapsing by Product URL Slug.
  conditionSlugsByName?: Record<string, { conditionSlug?: string; conditionHubUrl?: string } | undefined>
  metaTitle?: string
  metaDescription?: string
  status?: string
  notes?: string
  prescription?: string
  // ── Structured-data columns ────────────────────────────────────────────
  // Feeds "manufacturer" in the Drug JSON-LD. Never defaulted to Getmeds, which is the
  // importer/distributor — the property is omitted entirely when the cell is blank.
  manufacturer?: string
  // Per-condition metadata, repeated on every row filed under the condition (conditions
  // have no document type of their own). Feeds the MedicalWebPage JSON-LD on condition
  // hub pages: Filipino term, medical specialty, and the pharmacist review sign-off.
  conditionFilipinoName?: string
  conditionSpecialty?: string
  conditionLastReviewed?: string
  conditionReviewedBy?: string
}

// ─────────────────────────────────────────────
// Documents
// ─────────────────────────────────────────────

export interface CountryPresence {
  _id: string
  _type: 'countryPresence'
  name: string
  flag?: string
  role?: string
  description?: string
  region?: string
  office?: string
  phone?: string
  website?: string
}

export interface CsrProgramImage {
  src?: string
  image?: SanityImage
  alt?: string
}

export interface CsrProgram {
  _id: string
  _type: 'csrProgram'
  id: string
  slug?: SanitySlug
  sectionLabel?: string
  heading: string
  flyerImage?: CsrProgramImage
  descriptionParagraphs?: string[]
  programImage?: CsrProgramImage
}

export interface MainNavLink {
  _key: string
  label: string
  href?: string
  hasDropdown?: boolean
}

export interface MegaMenuColumn {
  _key: string
  heading?: string
  items?: Array<LinkItem & { _key: string }>
}

export interface CompanyMenuLink {
  _key: string
  label?: string
  href?: string
  isLogoLink?: boolean
  logoSrc?: string
  logoImage?: SanityImage
  logoAlt?: string
}

export interface CompanyMenuSection {
  _key: string
  heading?: string
  links?: CompanyMenuLink[]
}

export interface CompanyMenuSlide {
  _key: string
  image?: string
  imageFile?: SanityImage
  title?: string
  description?: string
}

export interface NavigationLogo {
  src?: string
  image?: SanityImage
  alt?: string
  href?: string
}

export interface Navigation {
  _id: string
  _type: 'navigation'
  title?: string
  logo?: NavigationLogo
  mainLinks?: MainNavLink[]
  productMegaMenu?: {
    columns?: MegaMenuColumn[]
  }
  companyMegaMenu?: {
    sections?: CompanyMenuSection[]
    slides?: CompanyMenuSlide[]
  }
  mobileMenu?: {
    productSubLinks?: Array<LinkItem & { _key: string }>
    companyLabel?: string
  }
}

export interface Service {
  _id: string
  _type: 'service'
  title: string
  slug?: SanitySlug
  id?: string
  icon?: string
  badge?: string
  description?: string
  tags?: string[]
  image?: SanityImage
  isFeatured?: boolean
}

export interface TeamMember {
  _id: string
  _type: 'teams'
  name: string
  designation: string
  image?: SanityImage
}

export interface Testimonial {
  _id: string
  _type: 'testimonial'
  name: string
  role?: string
  quote: string
  image?: SanityImage
  rating?: number
  source?: string
}

export interface ContactGroup {
  _key: string
  purpose: string
  addresses?: string[]
  phones?: string[]
  emails?: string[]
  showInFooter?: boolean
  showInTopBar?: boolean
}

export interface SiteSettings {
  _id: string
  _type: 'siteSettings'
  title?: string
  logo?: ImageWithAlt
  topBar?: {
    label?: string
    phone?: string
    phoneHref?: string
    socialLinks?: Array<SocialLink & { _key: string }>
    socials?: Array<SocialLink & { _key: string }>
  }
  socials?: Array<SocialLink & { _key: string }>
  contactGroups?: ContactGroup[]
  /** @deprecated use contactGroups instead */
  contactInfo?: {
    address?: string | string[]
    phone?: string | string[]
    email?: string | string[]
  }
  mainNavigation?: SanityReference<Navigation>
  copyright?: string
  legalLinks?: Array<LinkItem & { _key: string }>
  appDownloadLinks?: Array<AppDownloadLink & { _key: string }>
}

export interface PoliciesDisclaimers {
  _id: string
  _type: 'policiesDisclaimers'
  title?: string
  slug?: { current: string } | string
  effectiveDate?: string
  lastUpdated?: string
  displayMode?: 'dedicatedPage' | 'modal'
  contentHtml?: string
  privacyPolicy?: string
  termsOfService?: string
  medicalDisclaimer?: string
  prescriptionPolicy?: string
  shippingDeliveryPolicy?: string
  returnRefundPolicy?: string
}

// ─────────────────────────────────────────────
// Pages
// ─────────────────────────────────────────────

export interface HomePage {
  _id: string
  _type: 'homePage'
  title?: string
  meta?: MetaFields
  hero?: HomeHero
  stats?: Array<Stat & { _key: string }>
  features?: Array<FeatureCard & { _key: string }>
  productTabs?: Array<{ _key: string; id?: string; label?: string }>
  appSection?: {
    heading?: string
    description?: string
    image?: SanityImage
    appStoreLabel?: string
    googlePlayLabel?: string
  }
}

export interface CoreValue {
  _key: string
  label?: string
  icon?: string
}

export interface WhyChooseUsItem {
  _key: string
  icon?: string
  title?: string
  description?: string
}

export interface Partner {
  _key: string
  name?: string
  logo?: SanityImage
}

export interface AboutPage {
  _id: string
  _type: 'aboutPage'
  title?: string
  meta?: MetaFields
  hero?: SimpleHero
  introImages?: Array<ImageWithAlt & { _key: string }>
  about?: {
    heading?: string
    paragraphs?: string[]
    dedicatedToLabel?: string
    dedicatedItems?: string[]
  }
  highlights?: {
    heading?: string
    certifications?: string[]
  }
  mission?: { sectionLabel?: string; heading?: string; text?: string }
  vision?: { sectionLabel?: string; heading?: string; text?: string }
  coreValues?: {
    sectionLabel?: string
    heading?: string
    values?: CoreValue[]
    centerLogoSrc?: SanityImage
    handImage?: SanityImage
    handImageAlt?: string
  }
  whyChooseUs?: {
    sectionLabel?: string
    heading?: string
    description?: string
    items?: WhyChooseUsItem[]
  }
  team?: {
    sectionLabel?: string
    heading?: string
    description?: string
    members?: Array<SanityReference<TeamMember> & { _key: string }>
  }
  partners?: {
    sectionLabel?: string
    heading?: string
    partners?: Partner[]
  }
  cta?: {
    heading?: string
    description?: string
    primaryAction?: string
    primaryHref?: string
    secondaryAction?: string
    secondaryHref?: string
  }
}

export interface BenefitsPillar {
  _key: string
  icon?: string
  title?: string
  description?: string
}

export interface CareerAdvantageItem {
  _key: string
  icon?: string
  title?: string
  description?: string
}

export interface JobListing {
  _key: string
  type?: string
  title?: string
  description?: string
}

export interface ApplicationFormField {
  _key: string
  name?: string
  type?: string
  placeholder?: string
}

export interface CareersPage {
  _id: string
  _type: 'careersPage'
  title?: string
  meta?: MetaFields
  hero?: {
    image?: string
    imageAlt?: string
    headingLine1?: string
    headingAccent?: string
    description?: string
  }
  benefits?: {
    sectionLabel?: string
    heading?: string
    descriptionParagraphs?: string[]
    pillars?: BenefitsPillar[]
  }
  founderQuote?: {
    quote?: string
    author?: string
    authorTitle?: string
    authorImage?: string
    authorImageAlt?: string
  }
  ctaBanner?: {
    heading?: string
    description?: string
    actionLabel?: string
  }
  careerAdvantages?: {
    sectionLabel?: string
    heading?: string
    description?: string
    items?: CareerAdvantageItem[]
  }
  jobListings?: {
    sectionHeading?: string
    sectionDescription?: string
    jobs?: JobListing[]
  }
  applicationForm?: {
    heading?: string
    fields?: ApplicationFormField[]
    submitLabel?: string
  }
}

export interface ContactInfoItem {
  _key: string
  label?: string
  values?: string[]
  socials?: Array<SocialLink & { _key: string }>
}

export interface ContactFormFieldOption {
  _key: string
  value?: string
  label?: string
}

export interface ContactFormField {
  _key: string
  name?: string
  label?: string
  type?: string
  placeholder?: string
  required?: boolean
  options?: ContactFormFieldOption[]
}

export interface ContactPage {
  _id: string
  _type: 'contactPage'
  title?: string
  meta?: MetaFields
  hero?: SplitHero
  info?: {
    tagline?: string
    heading?: string
    description?: string
    items?: ContactInfoItem[]
  }
  form?: {
    heading?: string
    fields?: ContactFormField[]
    submitLabel?: string
    privacyNotice?: string
  }
}

export interface PatientJourneyLink {
  _key: string
  platform?: string
  icon?: string
  href?: string
  label?: string
}

export interface CsrPage {
  _id: string
  _type: 'csrPage'
  title?: string
  meta?: MetaFields
  hero?: SplitHero
  programs?: Array<SanityReference<CsrProgram> & { _key: string }>
  patientJourneys?: {
    heading?: string
    video?: { src?: string; title?: string }
    links?: PatientJourneyLink[]
  }
}

export interface TimelineMilestone {
  _key: string
  title?: string
  description?: string
}

export interface TimelineEvent {
  _key: string
  year?: string
  title?: string
  description?: string
  milestones?: TimelineMilestone[]
}

export interface GlobalPresencePage {
  _id: string
  _type: 'globalPresencePage'
  title?: string
  meta?: MetaFields
  hero?: SplitHero
  countries?: Array<SanityReference<CountryPresence> & { _key: string }>
  globalBanner?: {
    headingLine1?: string
    headingLine2?: string
    headingAccent?: string
    description?: string
    globeImage?: string
    actionLabel?: string
  }
  timeline?: {
    sectionHeading?: string
    description?: string
    events?: TimelineEvent[]
  }
  globalFootprint?: {
    heading?: string
    description?: string
  }
}

export interface AppStore {
  _key: string
  label?: string
  href?: string
  image?: string
}

export interface MockupImageObj {
  src?: string
  alt?: string
}

export interface MeditationsFeatureItem {
  _key: string
  icon?: string
  title?: string
  description?: string
}

export interface AmbientTrack {
  _key: string
  id?: number
  title?: string
}

export interface MeditationsPage {
  _id: string
  _type: 'meditationsPage'
  title?: string
  meta?: MetaFields
  hero?: {
    heading?: string
    description?: string
    mockupImages?: Array<ImageWithAlt & { _key: string }>
  }
  appStores?: AppStore[]
  mindfulness?: {
    heading?: string
    description?: string
    mockupImage?: MockupImageObj
    mockupCaption?: string
  }
  benefits?: {
    heading?: string
    description?: string
    mockupImage?: MockupImageObj
    mockupCaption?: string
  }
  features?: {
    heading?: string
    description?: string
    moreFeaturesLabel?: string
    items?: MeditationsFeatureItem[]
  }
  download?: {
    heading?: string
    description?: string
    mockupImage?: MockupImageObj
  }
  ambientTracks?: AmbientTrack[]
}

export interface HowItWorksStep {
  _key: string
  number?: number
  icon?: string
  title?: string
  description?: string
}

export interface OrderMedicinesPage {
  _id: string
  _type: 'orderMedicinesPage'
  title?: string
  meta?: MetaFields
  hero?: {
    sectionLabel?: string
    heading?: string
    headingAccent?: string
    description?: string
  }
  howItWorks?: {
    heading?: string
    description?: string
    steps?: HowItWorksStep[]
  }
  uploadSection?: {
    heading?: string
    subheading?: string
    uploadNewLabel?: string
    uploadNewHint?: string
  }
  prescriptionGuidance?: {
    heading?: string
    items?: string[]
  }
}

export interface PapDocument {
  _key: string
  icon?: string
  label?: string
}

export interface PapStep {
  _key: string
  number?: number
  title?: string
  icon?: string
  instruction?: string
  documents?: PapDocument[]
  note?: string
}

export interface AgencyTab {
  _key: string
  id?: string
  label?: string
}

export interface PapPage {
  _id: string
  _type: 'papPage'
  title?: string
  meta?: MetaFields
  hero?: {
    image?: string
    imageAlt?: string
    programTitle?: string
    programSubtitle?: string
    accreditationBadge?: string
  }
  intro?: {
    heading?: string
    subheading?: string
    paragraphs?: string[]
  }
  steps?: PapStep[]
  agencies?: {
    tabs?: AgencyTab[]
    dswd?: { heading?: string; requirements?: string[] }
    pcso?: { heading?: string; requirements?: string[] }
  }
}

export interface ProductsPage {
  _id: string
  _type: 'productsPage'
  title?: string
  searchSuggestions?: string[]
}

export interface WhyTrustItem {
  _key: string
  icon?: string
  title?: string
  description?: string
}

export interface ServicesPage {
  _id: string
  _type: 'servicesPage'
  title?: string
  meta?: MetaFields
  hero?: SplitHero
  stats?: Array<Stat & { _key: string }>
  sectionLabel?: string
  sectionHeading?: string
  sectionDescription?: string
  services?: Array<SanityReference<Service> & { _key: string }>
  whyTrust?: {
    sectionLabel?: string
    heading?: string
    description?: string
    items?: WhyTrustItem[]
  }
  cta?: {
    heading?: string
    description?: string
    primaryAction?: string
    primaryHref?: string
    secondaryAction?: string
    secondaryHref?: string
  }
}

export interface UngcLogoObj {
  src?: string
  alt?: string
}

export interface UngcEvent {
  _key: string
  date?: string
  title?: string
  image?: string
}

export interface UngcPage {
  _id: string
  _type: 'ungcPage'
  title?: string
  meta?: MetaFields
  hero?: {
    image?: string
    imageAlt?: string
    logo?: UngcLogoObj
    heading?: string
    headingLine1?: string
    headingLine2?: string
    description?: string
  }
  whatIsUngc?: {
    heading?: string
    description?: string
    supportLabel?: string
    logo?: UngcLogoObj
  }
  events?: UngcEvent[]
}

export interface PageAsset {
  _id: string
  _type: 'pageAsset'
  name: string
  images?: Array<{
    image?: SanityImage
    lowResImage?: SanityImage
    altText?: string
    enableLink?: boolean
    link?: string
  }>
  videos?: Array<{
    video?: { asset?: { url?: string; originalFilename?: string; mimeType?: string } }
    thumbnail?: SanityImage
    altText?: string
    enableLink?: boolean
    link?: string
  }>
  // Legacy fields (kept for backwards compatibility during migration)
  page?: string
  location?: string
  image?: SanityImage
  altText?: string
  assetPath?: string
}


export interface SanityPortableTextSpan {
  _type: 'span'
  _key: string
  text: string
  marks?: string[]
}

export interface SanityPortableTextMarkDef {
  _key: string
  _type: string
  href?: string
}

export interface SanityPortableTextBlock {
  _type: 'block'
  _key: string
  style?: 'normal' | 'h2' | 'h3' | 'large' | 'small' | 'center' | 'right' | 'blockquote'
  listItem?: 'bullet' | 'number'
  level?: number
  markDefs?: SanityPortableTextMarkDef[]
  children?: SanityPortableTextSpan[]
}

export interface SanityPortableTextImage {
  _type: 'image'
  _key: string
  asset?: SanityReference<SanityAsset>
  hotspot?: { x: number; y: number }
  crop?: { top: number; bottom: number; left: number; right: number }
}

export type SanityPortableTextNode = SanityPortableTextBlock | SanityPortableTextImage

export interface News {
  _id: string
  _type: 'news'
  tag: string
  title: string
  slug?: string
  date: string
  description: string
  readTime?: string
  intro?: string
  image?: SanityImage | string
  centerImage?: SanityImage | string
  sidebarImage?: SanityImage | string
  content?: SanityPortableTextNode[]
  contentHtml?: string
  source_link?: string
}

// ─────────────────────────────────────────────
// Union of all document types
// ─────────────────────────────────────────────

export type SanityDocument =
  | Category
  | ChatSession
  | FAQ
  | Product
  | CountryPresence
  | CsrProgram
  | Navigation
  | Service
  | TeamMember
  | Testimonial
  | SiteSettings
  | HomePage
  | AboutPage
  | CareersPage
  | ContactPage
  | CsrPage
  | GlobalPresencePage
  | MeditationsPage
  | OrderMedicinesPage
  | PapPage
  | ProductsPage
  | ServicesPage
  | UngcPage
  | PageAsset
  | News