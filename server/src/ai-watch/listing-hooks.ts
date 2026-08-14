/**
 * Map ApiListing → WatchListingEvent.
 * Durable scheduling is via ai_watch_outbox (see outbox.ts) — no fire-and-forget evaluate.
 * Stage 10L: prefer same-TX enqueue with listing write (kickWorker: false until COMMIT).
 */

import type { ApiListing } from "../types.js";
import type { DbClient } from "../db.js";
import type { WatchEventType, WatchListingEvent } from "./types.js";
import {
  enqueueAiWatchOutbox,
  kickAiWatchOutboxWorker,
} from "./outbox.js";

function attrStr(
  attrs: ApiListing["attributes"],
  key: string
): string | null {
  const v = attrs?.[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

function attrNum(
  attrs: ApiListing["attributes"],
  key: string
): number | null {
  const v = attrs?.[key];
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

export function listingToWatchEvent(
  listing: ApiListing,
  eventType: WatchEventType,
  opts?: { previousPrice?: number | null }
): WatchListingEvent {
  const attrs = listing.attributes;
  return {
    eventType,
    listingId: listing.id,
    category: listing.category,
    title: listing.title,
    price: Number(listing.price),
    previousPrice: opts?.previousPrice ?? null,
    brand: attrStr(attrs, "brand") ?? attrStr(attrs, "make"),
    model: attrStr(attrs, "model"),
    year: attrNum(attrs, "year"),
    mileage: attrNum(attrs, "mileage") ?? attrNum(attrs, "odometer"),
    location: listing.location,
    distanceKm: listing.distanceKm,
    condition: attrStr(attrs, "condition"),
    fuel: attrStr(attrs, "fuel"),
    transmission: attrStr(attrs, "transmission"),
    status: listing.status ?? "active",
    visibility: listing.banned || listing.requiresReview ? "hidden" : "public",
    banned: Boolean(listing.banned),
    requiresReview: Boolean(listing.requiresReview),
    ownerUserId: listing.sellerId,
    occurredAt: new Date().toISOString(),
    currentSnapshot: {
      price: Number(listing.price),
      title: listing.title,
      status: listing.status ?? "active",
      visibility: listing.banned || listing.requiresReview ? "hidden" : "public",
      year: attrNum(attrs, "year"),
      mileage: attrNum(attrs, "mileage"),
      brand: attrStr(attrs, "brand"),
      model: attrStr(attrs, "model"),
    },
  };
}

/**
 * Durable enqueue after listing write. Awaits outbox INSERT (crash-safe).
 * Processor runs asynchronously after the durable write.
 */
export function scheduleAiWatchForListing(
  listing: ApiListing,
  eventType: WatchEventType,
  opts?: { previousPrice?: number | null }
): void {
  const event = listingToWatchEvent(listing, eventType, opts);
  void enqueueAiWatchOutbox(event).catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ai-watch] outbox enqueue failed:", msg.slice(0, 400));
  });
}

export type ScheduleAiWatchDurableOpts = {
  previousPrice?: number | null;
  /** Same PoolClient as listing INSERT/UPDATE — atomic TX. */
  client?: DbClient;
  /** When false, caller must kick worker after COMMIT. Default true. */
  kickWorker?: boolean;
};

/** Prefer this in request handlers when you can await durability. */
export async function scheduleAiWatchForListingDurable(
  listing: ApiListing,
  eventType: WatchEventType,
  opts?: ScheduleAiWatchDurableOpts
): Promise<string> {
  return enqueueAiWatchOutbox(listingToWatchEvent(listing, eventType, opts), {
    client: opts?.client,
    kickWorker: opts?.kickWorker,
  });
}

export { kickAiWatchOutboxWorker };
