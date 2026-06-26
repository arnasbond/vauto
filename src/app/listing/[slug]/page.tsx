import type { Metadata } from "next";
import { INITIAL_LISTINGS } from "@/data/mockListings";
import { findListingBySlug, generateListingMetadata } from "@/lib/seo";
import { ListingJsonLd } from "@/components/seo/ListingJsonLd";
import ListingSlugClient from "./ListingSlugClient";

export function generateStaticParams() {
  return INITIAL_LISTINGS.map((l) => ({
    slug: l.slug ?? l.id,
  }));
}

export function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return params.then(({ slug }) => {
    const listing = findListingBySlug(INITIAL_LISTINGS, slug);
    if (!listing) {
      return { title: "Skelbimas | VAUTO" };
    }
    const meta = generateListingMetadata(listing);
    return {
      title: meta.title,
      description: meta.description,
      openGraph: {
        title: meta.og.title,
        description: meta.og.description,
        images: meta.og.image ? [{ url: meta.og.image }] : undefined,
        url: meta.og.url,
        type: "website",
        siteName: meta.og.siteName,
      },
      twitter: {
        card: "summary_large_image",
        title: meta.og.title,
        description: meta.og.description,
        images: meta.og.image ? [meta.og.image] : undefined,
      },
    };
  });
}

export default async function ListingSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const listing = findListingBySlug(INITIAL_LISTINGS, slug);
  return (
    <>
      {listing && <ListingJsonLd listing={listing} />}
      <ListingSlugClient slug={slug} />
    </>
  );
}
