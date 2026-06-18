import type { Metadata } from "next";
import { INITIAL_LISTINGS } from "@/data/mockListings";
import { generateListingMetadata } from "@/lib/seo";
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
    const listing = INITIAL_LISTINGS.find(
      (l) => l.slug === slug || l.id === slug
    );
    if (!listing) {
      return { title: "Skelbimas | Vauto" };
    }
    const meta = generateListingMetadata(listing);
    return {
      title: meta.title,
      description: meta.description,
      openGraph: {
        title: meta.og.title,
        description: meta.og.description,
        images: [{ url: meta.og.image }],
        url: meta.og.url,
        type: "website",
        siteName: meta.og.siteName,
      },
      twitter: {
        card: "summary_large_image",
        title: meta.og.title,
        description: meta.og.description,
        images: [meta.og.image],
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
  return <ListingSlugClient slug={slug} />;
}
