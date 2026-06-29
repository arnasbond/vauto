import {
  getUserPushTokensForUsers,
  getUsersMatchingListing,
} from "../repository.js";
import type { ApiListing } from "../types.js";

let messaging: import("firebase-admin/messaging").Messaging | null = null;

async function ensureFirebase(): Promise<boolean> {
  if (messaging) return true;

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) return false;

  try {
    const admin = await import("firebase-admin");
    const cred = admin.credential.cert(JSON.parse(json) as object);
    const app = admin.apps.length
      ? admin.app()
      : admin.initializeApp({ credential: cred });
    messaging = admin.messaging(app);
    return true;
  } catch {
    return false;
  }
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  type?: string;
  chatId?: string;
}

function chatThreadPath(chatId: string): string {
  return `/pokalbiai/?id=${encodeURIComponent(chatId)}`;
}

export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<void> {
  if (!(await ensureFirebase()) || !messaging || !userIds.length) return;

  const tokens = await getUserPushTokensForUsers(userIds);
  if (!tokens.length) return;

  const data: Record<string, string> = {
    url: payload.url,
    voiceText: payload.body,
  };
  if (payload.type) data.type = payload.type;
  if (payload.chatId) data.chatId = payload.chatId;

  await Promise.allSettled(
    tokens.map((row) =>
      messaging!.send({
        token: row.token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data,
        android: { priority: "high" },
      })
    )
  );
}

/** A. Naujos derybos — pirkėjo žinutė pardavėjui. */
export async function notifyNegotiationStarted(
  sellerId: string,
  opts: { chatId: string; listingTitle: string; preview?: string }
): Promise<void> {
  const preview = opts.preview?.trim();
  const body = preview
    ? `${opts.listingTitle}: „${preview.slice(0, 80)}${preview.length > 80 ? "…" : ""}"`
    : opts.listingTitle;

  await sendPushToUsers([sellerId], {
    title: "VAUTO: naujos derybos",
    body,
    url: chatThreadPath(opts.chatId),
    type: "negotiation_started",
    chatId: opts.chatId,
  });
}

/** B. Sandoris paruoštas — escrow pasiūlymas. */
export async function notifyNegotiationDealClosed(
  userIds: string[],
  opts: { chatId: string; listingTitle: string }
): Promise<void> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;

  await sendPushToUsers(ids, {
    title: "VAUTO: sandoris paruoštas",
    body: `${opts.listingTitle} — galite užbaigti pirkimą per escrow.`,
    url: chatThreadPath(opts.chatId),
    type: "negotiation_deal",
    chatId: opts.chatId,
  });
}

/** C. Fono portalų sinchronizacija rado naujų prekių. */
export async function notifyPortalSyncNewItems(
  userId: string,
  opts: { portalLabel: string; newCount: number; totalCount: number }
): Promise<void> {
  const countLabel =
    opts.newCount === 1
      ? "1 nauja prekė"
      : `${opts.newCount} naujos prekės`;

  await sendPushToUsers([userId], {
    title: "VAUTO: asortimentas atnaujintas",
    body: `${opts.portalLabel}: ${countLabel} (iš viso ${opts.totalCount}).`,
    url: "/profile/?tab=asortimentas",
    type: "portal_sync",
  });
}

export async function notifyUsersFcm(
  userIds: string[],
  payload: { title: string; body: string; url: string }
): Promise<void> {
  await sendPushToUsers(userIds, payload);
}

export async function notifyListingMatchFcm(listing: ApiListing): Promise<void> {
  const matches = await getUsersMatchingListing(listing);
  if (!matches.length) return;

  const userIds = [...new Set(matches.map((m) => m.userId))];
  const slug = listing.slug ?? listing.id;
  const body = `${listing.title} — ${listing.location}`;

  await sendPushToUsers(userIds, {
    title: "VAUTO: naujas skelbimas!",
    body,
    url: `/listing/${slug}/`,
    type: "listing_match",
  });
}
