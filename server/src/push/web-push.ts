import webpush from "web-push";
import {
  getPushSubscriptionsForUsers,
  getUsersMatchingListing,
} from "../repository.js";
import type { ApiListing } from "../types.js";
import { notifyListingMatchFcm, notifyUsersFcm } from "./fcm.js";

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

export interface WebPushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
  voiceText?: string;
}

export async function sendWebPushToUsers(
  userIds: string[],
  payload: WebPushPayload
): Promise<void> {
  if (!ensureVapid() || !userIds.length) return;

  const subs = await getPushSubscriptionsForUsers(userIds);
  if (!subs.length) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag,
    voiceText: payload.voiceText ?? payload.body,
  });

  await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        body
      )
    )
  );
}

export async function notifyListingMatch(listing: ApiListing): Promise<void> {
  await Promise.allSettled([
    notifyListingMatchWeb(listing),
    notifyListingMatchFcm(listing),
  ]);
}

async function notifyListingMatchWeb(listing: ApiListing): Promise<void> {
  const matches = await getUsersMatchingListing(listing);
  if (!matches.length) return;

  const userIds = [...new Set(matches.map((m) => m.userId))];
  const slug = listing.slug ?? listing.id;
  await sendWebPushToUsers(userIds, {
    title: "VAUTO: naujas skelbimas!",
    body: `${listing.title} — ${listing.location}`,
    url: `/listing/${slug}/`,
    voiceText: `Radau naują skelbimą: ${listing.title} ${listing.location}.`,
  });
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}
