import { client } from './sanity'

const SANITY_QUERIES: Record<string, string> = {
  "siteSettings.global": `
    *[_type == "siteSettings" && _id == "global-site-settings"][0] {
      ...,
      mainNavigation->
    }
  `,
  "navigation.main": `
    *[_type == "navigation" && _id == "main-navigation"][0]
  `,
  // Cache-busting token for the WordPress blog, written by the Studio's
  // "Sync Blog" tool. Deliberately its own query rather than a read off
  // siteSettings.global: the blog pages don't need the rest of that document,
  // and this one resolves to a single string.
  "siteSettings.blogVersion": `
    *[_type == "siteSettings" && _id == "global-site-settings"][0].blogVersion
  `,
  "product.excelJson": `
    *[_type == "product" && (remarks == "present" || remarks == "active") && defined(title)] | order(_updatedAt desc)[0] {
      json_data,
      productImages
    }
  `,
  "product.categoryImages": `
    *[_type == "product" && (remarks == "present" || remarks == "active") && defined(title)] | order(_updatedAt desc)[0] {
      categoryImages
    }
  `,
  "product.individualDocs": `
    *[_type == "product" && !defined(title) && (!defined(remarks) || remarks == "present" || remarks == "active")] {
      _id,
      slug,
      image,
      category-> { _id, category, slug },
      subCategory,
      availability,
      genericName,
      brandName,
      name,
      remarks,
      description,
      packaging,
      innovator,
      strength,
      form,
      indications,
      dosageAdministration,
      storageCondition,
      accreditations
    }
  `,
  "category.all": `
    *[_type == "category"] | order(category asc) {
      _id,
      category,
      slug,
      subtitle,
      description,
      icon,
      image,
      subcategory,
      categoryId,
    }
  `,
  "category.bySlug": `
    *[_type == "category" && slug.current == $slug][0]
  `,
  "faq.all": `
    *[_type == "faq"] | order(coalesce(orderRank, "zzzz") asc, _createdAt asc)
  `,
  // The homepage FAQ section. `showOnHomepage != false` rather than `== true`
  // so a document written before the field existed still shows, matching the
  // schema's initialValue and avoiding an empty section during the migration.
  "faq.homepage": `
    *[_type == "faq" && showOnHomepage != false]
      | order(coalesce(orderRank, "zzzz") asc, _createdAt asc) {
        _id, question, answer, orderRank, showOnHomepage
      }
  `,
  // pt::text() flattens the Portable Text answer for matching; the coalesce
  // keeps this working against documents whose answer is still a plain string.
  "faq.search": `
    *[_type == "faq" && (
      question match $query ||
      coalesce(pt::text(answer), answer) match $query ||
      $query in keywords
    )]
  `,
  "service.all": `
    *[_type == "service"] | order(_createdAt asc)
  `,
  "teams.all": `
    *[_type == "teams"] | order(orderRank asc) {
      _id,
      name,
      designation,
      image
    }
  `,
  "testimonial.all": `
    *[_type == "testimonial"] | order(rating desc)
  `,
  "countryPresence.all": `
    *[_type == "countryPresence"] | order(name asc)
  `,
  "csrProgram.all": `
    *[_type == "csrProgram"] | order(_createdAt asc)
  `,
  "homePage.main": `
    *[_type == "homePage" && _id == "home-page"][0] {
      ...,
      hero {
        ...,
        slides[0..4] {
          _key,
          heading,
          description,
          enabled,
          image { ..., asset-> }
        }
      }
    }
  `,
  "aboutPage.main": `
    *[_type == "aboutPage" && _id == "about-page"][0] {
      ...,
      team {
        ...,
        members[]->
      }
    }
  `,
  "careersPage.main": `
    *[_type == "careersPage" && _id == "careers-page"][0]
  `,
  "contactPage.main": `
    *[_type == "contactPage" && _id == "contact-page"][0]
  `,
  "csrPage.main": `
    *[_type == "csrPage" && _id == "csr-page"][0] {
      ...,
      programs[]->
    }
  `,
  "globalPresencePage.main": `
    *[_type == "globalPresencePage" && _id == "global-presence-page"][0] {
      ...,
      countries[]->
    }
  `,
  "meditationsPage.main": `
    *[_type == "meditationsPage" && _id == "meditations-page"][0]
  `,
  "orderMedicinesPage.main": `
    *[_type == "orderMedicinesPage" && _id == "order-medicines-page"][0]
  `,
  "papPage.main": `
    *[_type == "papPage" && _id == "pap-page"][0]
  `,
  "productsPage.main": `
    *[_type == "productsPage" && _id == "products-page"][0]
  `,
  "servicesPage.main": `
    *[_type == "servicesPage" && _id == "services-page"][0] {
      ...,
      services[]->
    }
  `,
  "ungcPage.main": `
    *[_type == "ungcPage" && _id == "ungc-page"][0]
  `,
  "pageAsset.all": `
    *[_type == "pageAsset"] | order(name asc) {
      _id,
      _type,
      name,
      images[] {
        image,
        lowResImage,
        altText,
        enableLink,
        link
      },
      videos[] {
        video { ..., asset-> },
        thumbnail { asset-> },
        altText,
        enableLink,
        link
      }
    }
  `,
  "pageAsset.heroSlides": `
    *[_type == "pageAsset" && name == "Home Hero Background"][0] {
      _id,
      name,
      images[] {
        image { ..., asset-> },
        lowResImage { ..., asset-> },
        altText,
        enableLink,
        link
      }
    }
  `,
  "pageAsset.byPaths": `
    *[_type == "pageAsset" && assetPath in $paths] { assetPath, image, page, name }
  `,
  "page.heroBundle": `
    {
      "about":         *[_type == "aboutPage"         && _id == "about-page"][0]          { hero },
      "services":      *[_type == "servicesPage"      && _id == "services-page"][0]       { hero },
      "globalPresence":*[_type == "globalPresencePage"&& _id == "global-presence-page"][0]{ hero },
      "csr":           *[_type == "csrPage"           && _id == "csr-page"][0]            { hero },
      "careers":       *[_type == "careersPage"       && _id == "careers-page"][0]        { hero },
      "ungc":          *[_type == "ungcPage"          && _id == "ungc-page"][0]           { hero }
    }
  `,
  "googleSpreadsheet.bySlug": `
    *[_type == "googleSpreadsheet" && id.current == $slug][0] {
      _id,
      spreadsheetId,
      link
    }
  `,
  "career.all": `
    *[_type == "career"] | order(title asc) {
      _id,
      title,
      "desc": description,
      "responsibilities": keyResponsibilities,
      "requirements": qualificationRequirements,
      image
    }
  `,
  "policiesDisclaimers.main": `
    *[_type == "policiesDisclaimers" && _id == "policies-and-disclaimers"][0]
  `,
  "policiesDisclaimers.bySlug": `
    *[_type == "policiesDisclaimers" && slug.current == $slug][0]
  `,
  "policiesDisclaimers.all": `
    *[_type == "policiesDisclaimers"] | order(title asc)
  `,
  // Behind a scanned business-card QR code. Fields are listed rather than
  // splatted with `...`: this document holds staff phone numbers, and a
  // projection that names every field is the thing that stops a column added
  // later in Studio from reaching a public page nobody rechecked.
  "businessCard.bySlug": `
    *[_type == "businessCard" && slug.current == $slug][0] {
      _id,
      fullName,
      "slug": slug.current,
      jobTitle,
      company,
      cardImage,
      cardImageBack,
      mobile,
      whatsapp,
      viber,
      officePhone,
      email,
      active
    }
  `
}

export async function sanityQuery<T>(
  name: string,
  params?: Record<string, any>,
  options?: { fresh?: boolean }
): Promise<T> {
  const query = SANITY_QUERIES[name]
  if (!query) {
    throw new Error(`Sanity query name "${name}" is not registered on the client.`)
  }
  // The default client reads from Sanity's CDN (useCdn: true, see sanity.ts), which is
  // eventually-consistent — edits in Studio (reordering, adding/removing a team member)
  // can take a while to show up. Pass { fresh: true } to read straight from the live API
  // instead, for content that needs to reflect Studio edits immediately.
  const activeClient = options?.fresh ? client.withConfig({ useCdn: false }) : client
  return activeClient.fetch<T>(query, params || {})
}
