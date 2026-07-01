import { analyzePhotoIntentResolution } from "@/lib/photo-intent-analyze";
import {
  buildPhotoIntentPrompt,
  PHOTO_INTENT_QUICK_REPLIES,
} from "@/lib/photo-intent-resolution";
import { setPendingPhotoIntent } from "@/lib/photo-intent-session";
import type { AiPhotoFlowResult } from "@/components/photo/AiPhotoFlowSheet";

export interface PhotoIntentInterceptContext {
  userCity?: string;
  userName?: string;
  wardrobeOnly?: boolean;
  openWithGreeting: (
    text: string,
    options?: {
      quickReplies?: string[];
      isolatedMismatch?: boolean;
      openSheet?: boolean;
    }
  ) => void;
  showToast: (msg: string, kind?: "success" | "info" | "error") => void;
  fallbackMessage: string;
}

/**
 * v1.6.18 — Intent Interceptor: pipeline + vision, then ask search vs listing.
 * Returns true when handled (greeting shown or multi-object branch).
 */
export async function interceptPhotoUploadForIntent(
  result: AiPhotoFlowResult,
  ctx: PhotoIntentInterceptContext
): Promise<boolean> {
  const photos = result.photos.filter(Boolean).slice(0, 6);
  if (!photos[0]) return false;

  let analysis;
  try {
    analysis = await analyzePhotoIntentResolution({
      photos,
      extraContext: result.extraContext || undefined,
      userCity: ctx.userCity,
      userName: ctx.userName,
      wardrobeOnly: ctx.wardrobeOnly,
    });
  } catch {
    ctx.showToast(ctx.fallbackMessage, "info");
    return false;
  }

  if (!analysis?.ok) {
    ctx.showToast(ctx.fallbackMessage, "info");
    return false;
  }

  if (analysis.phase === "multi_object" && (analysis.choiceChips?.length ?? 0) >= 2) {
    ctx.openWithGreeting(
      analysis.clarificationPrompt ||
        "Nuotraukoje matau kelis objektus. Ką norite daryti?",
      { quickReplies: analysis.choiceChips, openSheet: true }
    );
    return true;
  }

  setPendingPhotoIntent({
    photos,
    extraContext: result.extraContext || undefined,
    analysis,
    wardrobeOnly: ctx.wardrobeOnly,
  });

  ctx.openWithGreeting(
    buildPhotoIntentPrompt(analysis.objectLabel, analysis.categoryLabel),
    {
      quickReplies: [...PHOTO_INTENT_QUICK_REPLIES],
      isolatedMismatch: true,
      openSheet: true,
    }
  );

  return true;
}
