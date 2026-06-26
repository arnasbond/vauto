import type { Listing, ListingStatus } from "@/lib/types";
import { isListingActive } from "@/lib/listing-expiry";

export type DashboardListingState =
  | "active"
  | "pending"
  | "paused"
  | "sold"
  | "expired";

export function isListingPublicInFeed(listing: Listing): boolean {
  if (listing.banned) return false;
  if (listing.status === "sold" || listing.status === "paused" || listing.status === "pending") {
    return false;
  }
  return isListingActive(listing);
}

export function dashboardListingState(listing: Listing): DashboardListingState {
  if (listing.status === "sold") return "sold";
  if (listing.status === "pending") return "pending";
  if (listing.status === "paused") return "paused";
  if (!isListingActive(listing)) return "expired";
  return "active";
}

export function dashboardStateLabel(state: DashboardListingState): string {
  switch (state) {
    case "active":
      return "Aktyvus";
    case "pending":
      return "Laukia patvirtinimo";
    case "paused":
      return "Išjungtas";
    case "sold":
      return "Parduota";
    case "expired":
      return "Pasibaigęs";
  }
}

export function dashboardStateClass(state: DashboardListingState): string {
  switch (state) {
    case "active":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
    case "pending":
      return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200";
    case "paused":
      return "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200";
    case "sold":
      return "bg-slate-500/20 text-slate-600 dark:text-slate-400";
    case "expired":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
  }
}

export function togglePauseStatus(current?: ListingStatus): ListingStatus {
  return current === "paused" ? "active" : "paused";
}
