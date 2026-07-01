import { insertUserNotification } from "../repository.js";
import type { ApiListing } from "../types.js";
import { notifyUsersFcm } from "./fcm.js";
import { sendWebPushToUsers } from "./web-push.js";

function listingUrl(listing: ApiListing): string {
  const slug = listing.slug ?? listing.id;
  return `/listing/${slug}/`;
}

async function deliverSellerModerationNotice(
  listing: ApiListing,
  input: { kind: string; title: string; body: string; tag: string }
): Promise<void> {
  const url = listingUrl(listing);
  await insertUserNotification({
    userId: listing.sellerId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    url,
  });
  await Promise.allSettled([
    sendWebPushToUsers([listing.sellerId], {
      title: input.title,
      body: input.body,
      url,
      tag: input.tag,
      voiceText: input.body,
    }),
    notifyUsersFcm([listing.sellerId], { title: input.title, body: input.body, url }),
  ]);
}

/** Admin approved listing — now visible in public feed. */
export async function notifySellerListingApproved(listing: ApiListing): Promise<void> {
  await deliverSellerModerationNotice(listing, {
    kind: "listing_approved",
    title: "Skelbimas patvirtintas!",
    body: `„${listing.title}" dabar matomas visiems pirkėjams.`,
    tag: `listing-approved-${listing.id}`,
  });
}

/** Admin or AI rejected listing. */
export async function notifySellerListingRejected(
  listing: ApiListing,
  reason?: string
): Promise<void> {
  const body = reason?.trim()
    ? `„${listing.title}" atmestas: ${reason}`
    : `„${listing.title}" neatitiko platformos taisyklių ir buvo užblokuotas.`;
  await deliverSellerModerationNotice(listing, {
    kind: "listing_rejected",
    title: "Skelbimas atmestas",
    body,
    tag: `listing-rejected-${listing.id}`,
  });
}

/** Listing queued for human review after publish. */
export async function notifySellerListingPendingReview(listing: ApiListing): Promise<void> {
  await deliverSellerModerationNotice(listing, {
    kind: "listing_pending_review",
    title: "Skelbimas laukia peržiūros",
    body: `„${listing.title}" peržiūrės moderatorius — pranešime, kai bus patvirtintas.`,
    tag: `listing-pending-${listing.id}`,
  });
}
