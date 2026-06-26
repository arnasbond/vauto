import type { Listing } from "@/lib/types";
import { isJobOffer } from "@/lib/jobs";
import { listingPrettyPath, SITE_URL } from "@/lib/seo";

function listingUrl(listing: Listing): string {
  return `${SITE_URL}${listingPrettyPath(listing)}`;
}

function baseProductSchema(listing: Listing) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.title,
    description: listing.description ?? listing.title,
    image: listing.images?.[0],
    offers: {
      "@type": "Offer",
      price: listing.price,
      priceCurrency: "EUR",
      availability: listing.status === "sold" ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
      url: listingUrl(listing),
    },
  };
}

function realEstateSchema(listing: Listing) {
  const city = listing.location.split(",")[0]?.trim() || "Lietuva";
  return {
    "@context": "https://schema.org",
    "@type": "Place",
    name: listing.title,
    description: listing.description ?? `${listing.title} — ${city}`,
    address: {
      "@type": "PostalAddress",
      addressLocality: city,
      addressCountry: "LT",
    },
    geo:
      listing.latitude != null && listing.longitude != null
        ? {
            "@type": "GeoCoordinates",
            latitude: listing.latitude,
            longitude: listing.longitude,
          }
        : undefined,
    additionalProperty: [
      listing.attributes?.area
        ? { "@type": "PropertyValue", name: "plotas", value: String(listing.attributes.area) }
        : null,
      listing.attributes?.rooms
        ? { "@type": "PropertyValue", name: "kambariai", value: String(listing.attributes.rooms) }
        : null,
    ].filter(Boolean),
  };
}

function jobPostingSchema(listing: Listing) {
  const city = listing.location.split(",")[0]?.trim() || "Lietuva";
  const employmentType =
    typeof listing.attributes?.employmentType === "string"
      ? listing.attributes.employmentType
      : "FULL_TIME";
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: listing.title,
    description: listing.description ?? listing.title,
    datePosted: listing.createdAt,
    validThrough: listing.expiresAt,
    employmentType,
    hiringOrganization: {
      "@type": "Organization",
      name:
        typeof listing.attributes?.employerName === "string"
          ? listing.attributes.employerName
          : "VAUTO darbdavys",
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: city,
        addressCountry: "LT",
      },
    },
    baseSalary: listing.price
      ? {
          "@type": "MonetaryAmount",
          currency: "EUR",
          value: { "@type": "QuantitativeValue", value: listing.price, unitText: "MONTH" },
        }
      : undefined,
    url: listingUrl(listing),
  };
}

/** Schema.org JSON-LD pagal skelbimo kategoriją */
export function buildListingJsonLd(listing: Listing): Record<string, unknown> {
  if (listing.category === "real_estate") return realEstateSchema(listing);
  if (listing.category === "jobs" && isJobOffer(listing)) return jobPostingSchema(listing);
  return baseProductSchema(listing);
}

export function listingJsonLdScriptContent(listing: Listing): string {
  return JSON.stringify(buildListingJsonLd(listing));
}
