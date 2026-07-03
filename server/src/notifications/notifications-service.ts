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

/** P2P žinutė — DB varpelis + Web Push + FCM (veikia net kai push atmestas). */
export async function notifyIncomingChatMessage(
  recipientId: string,
  opts: {
    chatId: string;
    listingTitle: string;
    senderLabel: string;
    preview: string;
    isBuyerMessage?: boolean;
  }
): Promise<void> {
  const url = `/pokalbiai/?id=${encodeURIComponent(opts.chatId)}`;
  const excerpt =
    opts.preview.length > 80 ? `${opts.preview.slice(0, 77)}…` : opts.preview;
  const title = opts.isBuyerMessage
    ? "VAUTO: naujos derybos"
    : opts.senderLabel;
  const body = `${opts.listingTitle}: „${excerpt}"`;

  await insertUserNotification({
    userId: recipientId,
    kind: "chat_message",
    title,
    body,
    url,
  });

  const { deliverRealtimeToUsers } = await import("../services/push-service.js");
  await deliverRealtimeToUsers([recipientId], {
    title,
    body,
    url,
    type: "chat_message",
    chatId: opts.chatId,
  });
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
