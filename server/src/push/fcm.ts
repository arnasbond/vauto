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

export async function notifyListingMatchFcm(listing: ApiListing): Promise<void> {
  if (!(await ensureFirebase()) || !messaging) return;

  const matches = await getUsersMatchingListing(listing);
  if (!matches.length) return;

  const userIds = [...new Set(matches.map((m) => m.userId))];
  const tokens = await getFcmTokensForUsers(userIds);
  if (!tokens.length) return;

  const slug = listing.slug ?? listing.id;
  const body = `${listing.title} — ${listing.location}`;

  await Promise.allSettled(
    tokens.map((row) =>
      messaging!.send({
        token: row.token,
        notification: {
          title: "VAUTO: naujas skelbimas!",
          body,
        },
        data: {
          url: `/listing/${slug}/`,
          listingId: listing.id,
          voiceText: `Radau naują skelbimą: ${listing.title} ${listing.location}.`,
        },
        android: { priority: "high" },
      })
    )
  );
}
