"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { isNativeApp } from "@/lib/mobile-install";
import { resolveListingImage, LISTING_PLACEHOLDER_IMAGE } from "@/lib/listing-image";
import type { Listing } from "@/lib/types";

type ListingImageProps = {
  listing: Pick<Listing, "id" | "title" | "category" | "images" | "description"> & {
    image?: string;
  };
  alt: string;
  fill?: boolean;
  sizes?: string;
  className?: string;
  width?: number;
  height?: number;
};

export function ListingImage({
  listing,
  alt,
  fill,
  sizes,
  className,
  width,
  height,
}: ListingImageProps) {
  const primary = resolveListingImage(listing);
  const [src, setSrc] = useState(primary);

  useEffect(() => {
    setSrc(resolveListingImage(listing));
  }, [listing.id, listing.images, listing.image, listing.title, listing.category]);

  const handleError = () => {
    if (typeof console !== "undefined") {
      console.warn("[ListingImage] broken cover, using placeholder", {
        listingId: listing.id,
        src,
      });
    }
    if (src !== LISTING_PLACEHOLDER_IMAGE) setSrc(LISTING_PLACEHOLDER_IMAGE);
  };

  if (isNativeApp()) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={className}
        onError={handleError}
        style={fill ? { width: "100%", height: "100%", objectFit: "cover" } : undefined}
        width={width}
        height={height}
      />
    );
  }

  return (
    <Image
      src={src || LISTING_PLACEHOLDER_IMAGE}
      alt={alt}
      fill={fill}
      sizes={sizes}
      width={width}
      height={height}
      className={className}
      onError={handleError}
    />
  );
}
