"use client";

import Image from "next/image";
import { useState } from "react";
import { isNativeApp } from "@/lib/mobile-install";
import { resolveListingImage } from "@/lib/listing-image";
import type { Listing } from "@/lib/types";

type ListingImageProps = {
  listing: Pick<Listing, "id" | "title" | "category" | "images" | "description">;
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

  const handleError = () => {
    const fallback = resolveListingImage({ ...listing, images: [] });
    if (src !== fallback) setSrc(fallback);
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
      src={src}
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
