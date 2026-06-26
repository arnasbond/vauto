import { buildListingJsonLd } from "@/lib/listing-json-ld";
import type { Listing } from "@/lib/types";

export function ListingJsonLd({ listing }: { listing: Listing }) {
  const data = buildListingJsonLd(listing);
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
