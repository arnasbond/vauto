"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";
import { getListingGalleryImages } from "@/lib/listing-image";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/cn";

type ListingImageGalleryProps = {
  listing: Pick<
    Listing,
    "id" | "title" | "category" | "images" | "description" | "imageAlt" | "imageTitle" | "attributes"
  >;
  className?: string;
  /** Optional overlay in the hero corner (e.g. save heart). */
  topRightSlot?: ReactNode;
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

export function ListingImageGallery({
  listing,
  className,
  topRightSlot,
}: ListingImageGalleryProps) {
  const images = getListingGalleryImages(listing);
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);

  useEffect(() => {
    setActiveIndex(0);
    setZoomOpen(false);
  }, [listing.id]);

  useEffect(() => {
    if (!zoomOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoomOpen(false);
      if (e.key === "ArrowLeft") {
        setActiveIndex((i) => (i - 1 + images.length) % images.length);
      }
      if (e.key === "ArrowRight") {
        setActiveIndex((i) => (i + 1) % images.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomOpen, images.length]);

  const go = useCallback(
    (dir: -1 | 1) => {
      if (images.length <= 1) return;
      setActiveIndex((i) => (i + dir + images.length) % images.length);
    },
    [images.length]
  );

  const activeSrc = images[activeIndex] ?? images[0];
  if (!activeSrc) return null;

  return (
    <div className={cn("w-full", className)}>
      <div className="relative overflow-hidden rounded-2xl bg-slate-900/5">
        <button
          type="button"
          onClick={() => setZoomOpen(true)}
          className="relative block h-[min(50vh,420px)] max-h-[50vh] w-full cursor-zoom-in"
          aria-label="Padidinti nuotrauką"
        >
          <Image
            src={activeSrc}
            alt={resolveImageAlt(listing, activeIndex)}
            title={activeIndex === 0 ? listing.imageTitle ?? listing.title : undefined}
            fill
            sizes="(max-width: 768px) 100vw, 640px"
            className="object-contain"
            priority
          />
          <span className="pointer-events-none absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
            <ZoomIn className="h-3.5 w-3.5" aria-hidden />
            Priartinti
          </span>
        </button>

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              className="absolute left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/60"
              aria-label="Ankstesnė nuotrauka"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              className="absolute right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/60"
              aria-label="Kita nuotrauka"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <span className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
              {activeIndex + 1}/{images.length}
            </span>
          </>
        )}

        {topRightSlot ? (
          <div className="absolute right-3 top-3 z-20">{topRightSlot}</div>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div
          className="mt-2 flex gap-2 overflow-x-auto pb-1 scrollbar-hide"
          role="list"
          aria-label="Nuotraukų miniatiūros"
        >
          {images.map((src, index) => (
            <button
              key={`${listing.id}-thumb-${index}`}
              type="button"
              role="listitem"
              onClick={() => setActiveIndex(index)}
              aria-label={`Nuotrauka ${index + 1}`}
              aria-current={index === activeIndex}
              className={cn(
                "relative h-16 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition",
                index === activeIndex
                  ? "border-[var(--vauto-primary,#1e40af)] ring-2 ring-[var(--vauto-primary,#1e40af)]/25"
                  : "border-transparent opacity-80 hover:opacity-100"
              )}
            >
              <Image
                src={src}
                alt=""
                fill
                sizes="80px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}

      {zoomOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-4"
              role="dialog"
              aria-modal="true"
              aria-label="Nuotraukos peržiūra"
              onClick={() => setZoomOpen(false)}
            >
              <button
                type="button"
                onClick={() => setZoomOpen(false)}
                className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                aria-label="Uždaryti"
              >
                <X className="h-6 w-6" />
              </button>
              {images.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      go(-1);
                    }}
                    className="absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                    aria-label="Ankstesnė nuotrauka"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      go(1);
                    }}
                    className="absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                    aria-label="Kita nuotrauka"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              ) : null}
              <div
                className="relative h-[min(85dvh,900px)] w-full max-w-5xl"
                onClick={(e) => e.stopPropagation()}
              >
                <Image
                  src={images[activeIndex] ?? activeSrc}
                  alt={resolveImageAlt(listing, activeIndex)}
                  fill
                  sizes="100vw"
                  className="object-contain"
                  priority
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
