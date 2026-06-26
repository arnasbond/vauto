"use client";

import { useEffect, useState } from "react";
import { FileText, User } from "lucide-react";
import type { Listing } from "@/lib/types";
import {
  getApplicationsForListing,
  seedDemoApplicationsIfEmpty,
  type JobApplication,
} from "@/lib/job-applications";
import { isJobOffer } from "@/lib/jobs";

interface JobApplicationsInboxProps {
  listing: Listing;
  employerId: string;
}

function ApplicationRow({ app }: { app: JobApplication }) {
  return (
    <div className="rounded-xl border border-[var(--vauto-border)] bg-[var(--vauto-surface)] p-3">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--vauto-teal)]/10">
          <User className="h-4 w-4 text-[var(--vauto-teal)]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm text-[var(--vauto-text)]">{app.applicantName}</p>
          <p className="text-xs text-[var(--vauto-text-muted)]">{app.email}</p>
          {app.message && (
            <p className="mt-1 text-xs text-[var(--vauto-text-muted)]">{app.message}</p>
          )}
          <a
            href={app.cvFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--vauto-teal)] hover:underline"
          >
            <FileText className="h-3.5 w-3.5" />
            CV failas (PDF / Word)
          </a>
        </div>
        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
          {app.status === "new" ? "Nauja" : app.status}
        </span>
      </div>
    </div>
  );
}

export function JobApplicationsInbox({ listing, employerId }: JobApplicationsInboxProps) {
  const [apps, setApps] = useState<JobApplication[]>([]);

  useEffect(() => {
    seedDemoApplicationsIfEmpty(employerId, [listing]);
    setApps(getApplicationsForListing(listing.id));
  }, [listing, employerId]);

  if (!isJobOffer(listing)) return null;

  return (
    <div className="mt-3 border-t border-[var(--vauto-border)] pt-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--vauto-text-muted)]">
        Gauti CV ir kandidatai ({apps.length})
      </p>
      {apps.length === 0 ? (
        <p className="text-xs text-[var(--vauto-text-muted)]">
          Dar negauta paraiškų. Kandidatai gali siųsti CV per skelbimo puslapį.
        </p>
      ) : (
        <div className="space-y-2">
          {apps.map((app) => (
            <ApplicationRow key={app.id} app={app} />
          ))}
        </div>
      )}
    </div>
  );
}

export function sortListingsForDashboard(listings: Listing[]): Listing[] {
  const tierWeight = (l: Listing) => {
    if (l.visibilityTier === "top") return 0;
    if (l.visibilityTier === "plus") return 1;
    return 2;
  };
  return [...listings].sort((a, b) => tierWeight(a) - tierWeight(b));
}
