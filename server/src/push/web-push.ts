import webpush from "web-push";
import {
  getPushSubscriptionsForUsers,
  getUsersMatchingListing,
} from "../repository.js";
import type { ApiListing } from "../types.js";
import { notifyListingMatchFcm } from "./fcm.js";

let configured = false;

function ensureVapid(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@vauto.com";
  if (!publicKey || !privateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  }
  return true;
}

export async function notifyListingMatch(listing: ApiListing): Promise<void> {
  await Promise.allSettled([
    notifyListingMatchWeb(listing),
    notifyListingMatchFcm(listing),
  ]);
}

async function notifyListingMatchWeb(listing: ApiListing): Promise<void> {
  if (!ensureVapid()) return;

  const matches = await getUsersMatchingListing(listing);
  if (!matches.length) return;

  const userIds = [...new Set(matches.map((m) => m.userId))];
  const subs = await getPushSubscriptionsForUsers(userIds);
  if (!subs.length) return;

  const slug = listing.slug ?? listing.id;
  const payload = JSON.stringify({
    title: "VAUTO: naujas skelbimas!",
    body: `${listing.title} — ${listing.location}`,
    url: `/listing/${slug}/`,
    listingId: listing.id,
    voiceText: `Radau naują skelbimą: ${listing.title} ${listing.location}.`,
  });

  await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      )
    )
  );
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}
