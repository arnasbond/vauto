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
  /** When true, return chips for inline sheet footer instead of opening agent greeting. */
  inlineInSheet?: boolean;
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

export type PhotoIntentInlineResolution = {
  prompt: string;
  quickReplies: string[];
};

export type PhotoIntentInterceptResult =
  | { handled: false }
  | { handled: true; inline?: PhotoIntentInlineResolution };

function needsVisualClarification(analysis: {
  objectLabel?: string;
  category?: string;
  confidence?: number;
}): boolean {
  const label = (analysis.objectLabel ?? "").trim().toLowerCase();
  return (
    (analysis.confidence ?? 0) < 0.45 ||
    analysis.category === "other" ||
    !label ||
    label === "objektą" ||
    label === "kita" ||
    label === "other"
  );
}

/**
 * v1.6.18 — Intent Interceptor: pipeline + vision, then ask search vs listing.
 * Returns true when handled (greeting shown or multi-object branch).
 */
export async function interceptPhotoUploadForIntent(
  result: AiPhotoFlowResult,
  ctx: PhotoIntentInterceptContext
): Promise<PhotoIntentInterceptResult> {
  const photos = result.photos.filter(Boolean).slice(0, 6);
  if (!photos[0]) return { handled: false };

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
    return { handled: false };
  }

  if (!analysis?.ok) {
    ctx.showToast(ctx.fallbackMessage, "info");
    return { handled: false };
  }

  if (analysis.phase === "multi_object" && (analysis.choiceChips?.length ?? 0) >= 2) {
    const prompt =
      analysis.clarificationPrompt ||
      "Nuotraukoje matau kelis objektus. Ką norite daryti?";
    const quickReplies = analysis.choiceChips!.slice(0, 4);
    if (ctx.inlineInSheet) {
      setPendingPhotoIntent({
        photos,
        extraContext: result.extraContext || undefined,
        analysis,
        wardrobeOnly: ctx.wardrobeOnly,
      });
      return { handled: true, inline: { prompt, quickReplies } };
    }
    ctx.openWithGreeting(prompt, { quickReplies, openSheet: true });
    return { handled: true };
  }

  if (needsVisualClarification(analysis)) {
    const prompt =
      analysis.clarificationPrompt ||
      "Nuotrauką gavau, bet nesu pakankamai tikras, kas joje yra. Parašykite trumpai, ką matote arba ką norite padaryti.";
    const quickReplies = ["Patikslinti tekstu", ...PHOTO_INTENT_QUICK_REPLIES];
    setPendingPhotoIntent({
      photos,
      extraContext: result.extraContext || undefined,
      analysis,
      wardrobeOnly: ctx.wardrobeOnly,
    });
    if (ctx.inlineInSheet) {
      return { handled: true, inline: { prompt, quickReplies } };
    }
    ctx.openWithGreeting(prompt, { quickReplies, openSheet: true });
    return { handled: true };
  }

  setPendingPhotoIntent({
    photos,
    extraContext: result.extraContext || undefined,
    analysis,
    wardrobeOnly: ctx.wardrobeOnly,
  });

  const prompt = buildPhotoIntentPrompt(analysis.objectLabel, analysis.categoryLabel);
  const quickReplies = [...PHOTO_INTENT_QUICK_REPLIES];

  if (ctx.inlineInSheet) {
    return { handled: true, inline: { prompt, quickReplies } };
  }

  ctx.openWithGreeting(prompt, {
    quickReplies,
    isolatedMismatch: true,
    openSheet: true,
  });

  return { handled: true };
}
