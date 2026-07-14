import { analyzePhotoIntentResolution } from "@/lib/photo-intent-analyze";
import {
  isPhotoIntentListingChip,
  isPhotoIntentSearchChip,
  PHOTO_INTENT_ROUTING_REPLY,
  type PendingPhotoIntent,
} from "@/lib/photo-intent-resolution";
import {
  peekPendingPhotoIntent,
  setPendingPhotoIntent,
} from "@/lib/photo-intent-session";

export async function ensurePendingPhotoIntent(opts: {
  photos: string[];
  userCity?: string;
  userName?: string;
  wardrobeOnly?: boolean;
  extraContext?: string;
}): Promise<PendingPhotoIntent | null> {
  const photos = opts.photos.filter(Boolean).slice(0, 6);
  if (!photos.length) return null;

  const existing = peekPendingPhotoIntent();
  if (existing?.photos?.[0] === photos[0]) return existing;

  try {
    const analysis = await analyzePhotoIntentResolution({
      photos,
      extraContext: opts.extraContext,
      userCity: opts.userCity,
      userName: opts.userName,
      wardrobeOnly: opts.wardrobeOnly,
    });
    if (!analysis?.ok) return null;

    const session: PendingPhotoIntent = {
      photos,
      extraContext: opts.extraContext,
      analysis,
      wardrobeOnly: opts.wardrobeOnly,
    };
    setPendingPhotoIntent(session);
    return session;
  } catch {
    return null;
  }
}

export function isPhotoIntentRoutingReply(
  reply: string,
  quickReplies?: string[]
): boolean {
  if (reply.includes(PHOTO_INTENT_ROUTING_REPLY.slice(0, 20))) return true;
  if (!quickReplies?.length) return false;
  return (
    quickReplies.some((chip) => isPhotoIntentSearchChip(chip)) &&
    quickReplies.some((chip) => isPhotoIntentListingChip(chip))
  );
}
