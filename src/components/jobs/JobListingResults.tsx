"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { useVauto } from "@/context/VautoContext";
import { formatJobDisplayTitle, formatJobMetaLine } from "@/lib/job-catalog";
import { listingPath } from "@/lib/seo";
import type { ScoredListing } from "@/lib/types";

function JobRow({ listing }: { listing: ScoredListing }) {
  const { savedIds, toggleSave } = useVauto();
  const isSaved = savedIds.has(listing.id);
  const href = listingPath(listing);

  return (
    <article className="flex items-start gap-3 border-b border-[#e8ecf3] py-4 last:border-0">
      <div className="min-w-0 flex-1">
        <Link href={href} className="block">
          <h3 className="text-base font-semibold leading-snug text-[#e53935] hover:underline">
            {formatJobDisplayTitle(listing)}
          </h3>
          <p className="mt-1 text-sm text-[#64748b]">{formatJobMetaLine(listing)}</p>
        </Link>
      </div>
      <button
        type="button"
        onClick={() => toggleSave(listing.id)}
        className="shrink-0 rounded-full p-2 hover:bg-[#f1f5f9]"
        aria-label={isSaved ? "Pašalinti iš mėgstamų" : "Išsaugoti"}
      >
        <Heart
          className={`h-5 w-5 ${isSaved ? "fill-[#e53935] text-[#e53935]" : "text-[#94a3b8]"}`}
        />
      </button>
    </article>
  );
}

interface JobListingResultsProps {
  listings: ScoredListing[];
  title?: string;
}

export function JobListingResults({ listings, title }: JobListingResultsProps) {
  const jobListings = listings.filter((l) => l.category === "jobs");

  if (jobListings.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[#d9e2f1] bg-white p-6 text-center text-sm text-[#64748b]">
        Darbo skelbimų nerasta. Pabandykite kitą raktinį žodį ar miestą.
      </p>
    );
  }

  return (
    <div className="rounded-xl border border-[#d9e2f1] bg-white px-4 shadow-sm">
      {title && (
        <h3 className="border-b border-[#e8ecf3] py-3 text-sm font-semibold text-[#172033]">
          {title}
        </h3>
      )}
      {jobListings.map((listing) => (
        <JobRow key={listing.id} listing={listing} />
      ))}
    </div>
  );
}
