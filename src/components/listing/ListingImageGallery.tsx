"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { getListingGalleryImages } from "@/lib/listing-image";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/cn";

type ListingImageGalleryProps = {
  listing: Pick<
    Listing,
    "id" | "title" | "category" | "images" | "description" | "imageAlt" | "imageTitle" | "attributes"
  >;
  className?: string;
};

function resolveImageAlt(
  listing: ListingImageGalleryProps["listing"],
  index: number
): string {
  if (index === 0) {
    if (listing.imageAlt?.trim()) return listing.imageAlt.trim();
    const attrAlt = listing.attributes?.imageAlt;
    if (typeof attrAlt === "string" && attrAlt.trim()) return attrAlt.trim();
  }
  return `${listing.title} — nuotrauka ${index + 1}`;
}

export function ListingImageGallery({ listing, className }: ListingImageGalleryProps) {
  const images = getListingGalleryImages(listing);
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const syncIndexFromScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || images.length <= 1) return;
    const width = el.clientWidth || 1;
    const index = Math.round(el.scrollLeft / width);
    setActiveIndex(Math.min(Math.max(index, 0), images.length - 1));
  }, [images.length]);

  useEffect(() => {
    setActiveIndex(0);
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [listing.id]);

  const scrollTo = (index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
    setActiveIndex(index);
  };

  return (
    <div className={cn("relative w-full", className)}>
      <div
        ref={scrollRef}
        onScroll={syncIndexFromScroll}
        className="flex w-full snap-x snap-mandatory overflow-x-auto scroll-smooth scrollbar-hide"
        style={{ WebkitOverflowScrolling: "touch" }}
        aria-label={`Nuotraukų galerija — ${listing.title}`}
        role="region"
      >
        {images.map((src, index) => (
          <div
            key={`${listing.id}-${index}`}
            className="relative aspect-[4/3] w-full shrink-0 snap-center snap-always"
          >
            <Image
              src={src}
              alt={resolveImageAlt(listing, index)}
              title={index === 0 ? listing.imageTitle ?? listing.title : undefined}
              fill
              sizes="100vw"
              className="object-cover"
              priority={index === 0}
            />
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <>
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
            {images.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => scrollTo(index)}
                aria-label={`Nuotrauka ${index + 1}`}
                aria-current={index === activeIndex}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  index === activeIndex
                    ? "w-5 bg-white"
                    : "w-1.5 bg-white/55"
                )}
              />
            ))}
          </div>
          <span className="absolute right-3 top-3 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            {activeIndex + 1}/{images.length}
          </span>
        </>
      )}
    </div>
  );
}
