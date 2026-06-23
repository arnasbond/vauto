import {
  getFcmTokensForUsers,
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

export async function notifyUsersFcm(
  userIds: string[],
  payload: { title: string; body: string; url: string }
): Promise<void> {
  if (!(await ensureFirebase()) || !messaging || !userIds.length) return;

  const tokens = await getFcmTokensForUsers(userIds);
  if (!tokens.length) return;

  await Promise.allSettled(
    tokens.map((row) =>
      messaging!.send({
        token: row.token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          url: payload.url,
          voiceText: payload.body,
        },
        android: { priority: "high" },
      })
    )
  );
}

export async function notifyListingMatchFcm(listing: ApiListing): Promise<void> {
  const matches = await getUsersMatchingListing(listing);
  if (!matches.length) return;

  const userIds = [...new Set(matches.map((m) => m.userId))];
  const slug = listing.slug ?? listing.id;
  const body = `${listing.title} — ${listing.location}`;

  await notifyUsersFcm(userIds, {
    title: "VAUTO: naujas skelbimas!",
    body,
    url: `/listing/${slug}/`,
  });
}
