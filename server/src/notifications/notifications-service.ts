import {
  buildWishlistMatchMessage,
  listingMatchesRequirement,
  type ListingMatchInput,
  type UserRequirementRow,
} from "../offer-engine.js";
import {
  getActiveUserRequirements,
  insertUserNotification,
  markRequirementNotified,
} from "../repository.js";
import { sendWebPushToUsers } from "../push/web-push.js";
import { notifyUsersFcm } from "../push/fcm.js";
import type { ApiListing } from "../types.js";

export interface InternalNotification {
  id: string;
  userId: string;
  kind: string;
  title: string;
  body: string;
  url?: string;
  createdAt: string;
}

function toMatchInput(listing: ApiListing): ListingMatchInput {
  return {
    id: listing.id,
    title: listing.title,
    price: listing.price,
    category: listing.category,
    location: listing.location,
    tags: listing.tags ?? [],
    description: listing.description,
    attributes: listing.attributes as Record<string, unknown> | undefined,
  };
}

export async function notifyWishlistRequirementMatch(
  listing: ApiListing,
  req: UserRequirementRow
): Promise<void> {
  const input = toMatchInput(listing);
  const slug = listing.slug ?? listing.id;
  const url = `/listing/${slug}/`;
  const { title, body } = buildWishlistMatchMessage(req, input);

  await insertUserNotification({
    userId: req.userId,
    kind: "wishlist_match",
    title,
    body,
    url,
  });

  await Promise.allSettled([
    sendWebPushToUsers([req.userId], {
      title,
      body,
      url,
      tag: `wishlist-${req.id}-${listing.id}`,
      voiceText: body,
    }),
    notifyUsersFcm([req.userId], { title, body, url }),
  ]);

  await markRequirementNotified(req.id, listing.id);
}

/**
 * Background wishlist match cycle — stebi naujus skelbimus vs user_requirements.
 */
export async function runWishlistMatchNotifications(
  listing: ApiListing
): Promise<number> {
  const input = toMatchInput(listing);
  const requirements = await getActiveUserRequirements();
  let sent = 0;

  for (const req of requirements) {
    if (req.userId === listing.sellerId) continue;
    if (!listingMatchesRequirement(input, req)) continue;
    await notifyWishlistRequirementMatch(listing, req);
    sent += 1;
  }

  return sent;
}

/** Fire-and-forget hook from listing POST (analogiškas background-market-analysis). */
export function scheduleWishlistMatchNotifications(listing: ApiListing): void {
  setImmediate(() => {
    void runWishlistMatchNotifications(listing).catch((err) => {
      console.error("wishlist match notification failed:", err);
    });
  });
}
