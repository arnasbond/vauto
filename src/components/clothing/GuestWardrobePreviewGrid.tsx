"use client";

import Image from "next/image";
import type { WardrobeProfileImportItem } from "@/lib/wardrobe-profile-importer";

const PLACEHOLDER =
  "https://images.unsplash.com/photo-1515886657613-9f3515b0c790?w=400&h=520&fit=crop";

interface GuestWardrobePreviewGridProps {
  items: WardrobeProfileImportItem[];
  title?: string;
}

export function GuestWardrobePreviewGrid({
  items,
  title = "Tavo būsimos spintos peržiūra",
}: GuestWardrobePreviewGridProps) {
  if (items.length === 0) return null;

  return (
    <div className="mb-6 overflow-hidden rounded-3xl border border-fuchsia-200/80 bg-white p-4 shadow-sm">
      <p className="mb-3 text-sm font-semibold text-fuchsia-900">{title}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="overflow-hidden rounded-2xl border border-fuchsia-100 bg-gradient-to-b from-white to-fuchsia-50/40"
          >
            <div className="relative aspect-[3/4] bg-fuchsia-50">
              <Image
                src={item.imageUrl || PLACEHOLDER}
                alt={item.title}
                fill
                sizes="(max-width: 512px) 50vw, 33vw"
                className="object-cover"
                unoptimized
                onError={(e) => {
                  const img = e.currentTarget;
                  if (img.src !== PLACEHOLDER) img.src = PLACEHOLDER;
                }}
              />
              <span className="absolute left-2 top-2 rounded-full bg-fuchsia-600/90 px-2 py-0.5 text-[10px] font-medium text-white">
                Demo
              </span>
            </div>
            <div className="px-2.5 py-2">
              <p className="line-clamp-2 text-xs font-light text-slate-700">{item.title}</p>
              <p className="mt-0.5 text-sm font-semibold text-fuchsia-800">{item.price} €</p>
              {(item.size || item.brand) && (
                <p className="text-[10px] uppercase tracking-wide text-slate-400">
                  {[item.size, item.brand].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </article>
        ))}
      </div>
      <p className="mt-3 text-center text-[11px] text-fuchsia-700">
        {items.length} prekės paruoštos — užsiregistravus galėsi jas iškart publikuoti
      </p>
    </div>
  );
}
