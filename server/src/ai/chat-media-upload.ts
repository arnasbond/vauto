import type { AgentSideEffect } from "./agent-tools.js";
import { normalizeListingDraftForAction } from "./listing-chat-input.js";
import {
  AWAITING_CONFIRMATION_LOCKED,
  buildConversationalMissingPrompt,
  buildPostVisionHeroMessage,
  inferListingFlowState,
  listingFlowAllowsPhotoUpload,
  POST_VISION_PUBLISH_CHIPS,
  transitionListingFlow,
  type ListingFlowState,
} from "./listing-conversational-flow.js";
import { parseListingImagesForAgent } from "./vauto-unified.js";

export const PHOTO_INTENT_ROUTING_REPLY =
  "Matau nuotrauką! Ką norėtumėte daryti – ieškome šio daikto pirkti, o gal norite jį parduoti ir sukurti naują skelbimą?";

export const PHOTO_INTENT_SEARCH_CHIP = "🔍 Ieškoti šio daikto";
export const PHOTO_INTENT_SELL_CHIP = "📦 Parduoti šį daiktą";

export const PHOTO_INTENT_ROUTING_CHIPS = [
  PHOTO_INTENT_SEARCH_CHIP,
  PHOTO_INTENT_SELL_CHIP,
] as const;

function foldIntentText(raw?: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function isImageOnlyChatUpload(userText?: string): boolean {
  const t = foldIntentText(userText);
  if (!t) return true;
  if (t === "[nuotraukos įkeltos]") return true;
  if (t === "nuotraukos įkeltos") return true;
  return false;
}

export function isPhotoSearchIntentText(userText?: string): boolean {
  const t = foldIntentText(userText);
  return (
    t.includes("ieškoti šio daikto") ||
    t.startsWith("🔍") ||
    /^ieškoti\b/.test(t)
  );
}

export function isPhotoSellIntentText(userText?: string): boolean {
  const t = foldIntentText(userText);
  return (
    t.includes("parduoti šį daikt") ||
    t.includes("parduoti si daikt") ||
    t.includes("įkelti skelb") ||
    t.includes("ikelti skelb") ||
    t.startsWith("📦") ||
    t === "parduoti" ||
    t === "skelbti" ||
    /\bnoriu\s+parduot/i.test(t) ||
    /\bparduodu\b/i.test(t) ||
    /\bsugeneruok\b.*\bapraš/i.test(t) ||
    /\baprašym/.test(t)
  );
}

export function isPhotoIntentRoutingResponse(quickReplies?: string[]): boolean {
  if (!quickReplies?.length) return false;
  return quickReplies.some(
    (chip) =>
      chip.includes(PHOTO_INTENT_SEARCH_CHIP) ||
      chip.includes(PHOTO_INTENT_SELL_CHIP)
  );
}

function photoAckLine(count: number): string {
  if (count > 1) {
    return `Matau ${count} nuotraukas — analizuoju vaizdą ir papildau skelbimo aprašymą.`;
  }
  return "Matau nuotrauką — analizuoju vaizdą ir papildau skelbimo aprašymą.";
}

function mergeVisionDescription(existing?: string, vision?: string): string {
  const a = String(existing ?? "").trim();
  const b = String(vision ?? "").trim();
  if (!a) return b;
  if (!b) return a;
  if (a.includes(b) || b.includes(a)) return a.length >= b.length ? a : b;
  return `${a}\n\n${b}`;
}

function uniqueImageUrls(urls: string[]): string[] {
  const out: string[] = [];
  for (const raw of urls) {
    const u = String(raw ?? "").trim();
    if (u && !out.includes(u)) out.push(u);
  }
  return out.slice(0, 6);
}

type MediaListingDraft = {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
  category?: string;
  attributes?: Record<string, string>;
  listingFlowState?: ListingFlowState;
};

type MediaResponse = {
  ok: true;
  reply: string;
  quickReplies?: string[];
  toolCalls: { name: string; result: unknown }[];
  actions: AgentSideEffect | { type: "none" };
};

async function resolveListingPhotoScan(input: {
  imageUrls: string[];
  listingDraft?: MediaListingDraft;
  userCity?: string;
  contact?: string;
  userText?: string;
  flowState: ListingFlowState | null;
}): Promise<MediaResponse> {
  const imageUrls = uniqueImageUrls(input.imageUrls);
  console.log("[vision] resolveListingPhotoScan enter", {
    imageCount: imageUrls.length,
    flowState: input.flowState,
    hasDraft: Boolean(input.listingDraft?.title?.trim()),
    userTextHead: input.userText?.trim().slice(0, 120) ?? null,
    imageKinds: imageUrls.map((u) =>
      u.startsWith("data:")
        ? `data(${u.length})`
        : u.startsWith("http")
          ? `http`
          : "other"
    ),
  });

  const extraBits = [
    input.listingDraft?.category
      ? `category hint: ${input.listingDraft.category}`
      : "",
    input.userText?.trim() && !isImageOnlyChatUpload(input.userText)
      ? `user note: ${input.userText.trim()}`
      : "",
    "Vision: enrich listing with vehicle/product SPECS only (make, model, year, engine, kW, mileage, seats, VIN/plate if visible). NEVER describe background (paving, house, trees, sky).",
  ].filter(Boolean);

  let parsed: Awaited<ReturnType<typeof parseListingImagesForAgent>>;
  try {
    parsed = await parseListingImagesForAgent({
      imageDataUrls: imageUrls,
      userCity: input.userCity ?? "",
      contact: input.contact,
      // Pass sell note as context for brand/category hints — Vision still owns the description.
      text:
        input.userText?.trim() && !isImageOnlyChatUpload(input.userText)
          ? input.userText.trim()
          : undefined,
      extraContext: [
        ...extraBits,
        "PRIVALOMA: parašyk turtingą 4–8 sakinių marketplace description lietuviškai iš NUOTRAUKŲ (markė, modelis, spalva, salonas, būklė). NIEKADA nekartok vartotojo frazės kaip aprašymo.",
      ].join("; "),
    });
  } catch (err) {
    const errMessage = err instanceof Error ? err.message : String(err);
    console.error(
      `[vision] resolveListingPhotoScan FAILED ${JSON.stringify({
        errMessage,
        imageCount: imageUrls.length,
        stack: err instanceof Error ? err.stack?.slice(0, 800) : undefined,
      })}`
    );
    throw err;
  }
  console.log("[vision] resolveListingPhotoScan parsed", {
    needsClarification: parsed.needsClarification,
    title: parsed.listing.title?.slice(0, 80),
    descriptionChars: parsed.listing.description?.length ?? 0,
    category: parsed.listing.category,
    confidence: parsed.listing.confidence,
  });

  if (parsed.needsClarification) {
    const message =
      parsed.clarificationPrompt ||
      "Matau kelis objektus nuotraukoje — kurį norite parduoti? Pasirinkite žemiau.";
    return {
      ok: true,
      reply: message,
      quickReplies: parsed.choiceChips.slice(0, 4),
      toolCalls: [
        {
          name: "scanListingPhotos",
          result: { ok: true, needsClarification: true, message },
        },
      ],
      actions: { type: "none" },
    };
  }

  const listingAttrs = Object.fromEntries(
    Object.entries(parsed.listing.attributes).map(([k, v]) => [
      k,
      Array.isArray(v) ? v.join(", ") : String(v),
    ])
  );

  const visionDraft = {
    title: parsed.listing.title,
    description: mergeVisionDescription(
      input.listingDraft?.description,
      parsed.listing.description
    ),
    price: parsed.listing.price || input.listingDraft?.price || 0,
    location: parsed.listing.location || input.listingDraft?.location || "",
    category: parsed.listing.category,
    attributes: listingAttrs,
  };

  const nextState =
    transitionListingFlow(input.flowState, "PHOTOS_SCANNED") ?? "DRAFT_READY";

  const mergedDraft = normalizeListingDraftForAction(
    input.listingDraft
      ? {
          ...input.listingDraft,
          ...visionDraft,
          description: visionDraft.description,
          attributes: {
            ...(input.listingDraft.attributes ?? {}),
            ...visionDraft.attributes,
          },
          listingFlowState: nextState,
        }
      : { ...visionDraft, listingFlowState: nextState },
    {
      contact: input.contact,
      userCity: input.userCity,
      listingFlowState: nextState,
    }
  );

  const ack = photoAckLine(imageUrls.length);
  const resolvedCity =
    mergedDraft.location?.trim() || input.userCity?.trim() || "";

  let reply = `${ack}\n\n${buildPostVisionHeroMessage(mergedDraft)}`;
  let quickReplies: string[] = [...POST_VISION_PUBLISH_CHIPS];

  if (!mergedDraft.price || mergedDraft.price <= 0) {
    reply = `${ack}\n\n${buildConversationalMissingPrompt({ missingPrice: true })}`;
    quickReplies = [];
  } else if (!resolvedCity) {
    reply = `${ack}\n\n${buildConversationalMissingPrompt({ missingCity: true })}`;
    quickReplies = [];
  }

  return {
    ok: true,
    reply,
    quickReplies,
    toolCalls: [
      {
        name: "scanListingPhotos",
        result: {
          ok: true,
          message: reply,
          draft: mergedDraft,
          imageUrls,
          listingFlowState: nextState,
        },
      },
    ],
    actions: {
      type: "listing_draft",
      listingDraft: mergedDraft,
      imageUrl: imageUrls[0],
      imageUrls,
    },
  };
}

export async function resolveChatMediaAttachmentResponse(input: {
  imageUrls: string[];
  listingDraft?: MediaListingDraft;
  userCity?: string;
  contact?: string;
  userText?: string;
}): Promise<MediaResponse | null> {
  const imageUrls = uniqueImageUrls(input.imageUrls);
  console.log("[vision] resolveChatMediaAttachmentResponse enter", {
    imageCount: imageUrls.length,
    userTextHead: input.userText?.trim().slice(0, 120) ?? null,
    hasDraftTitle: Boolean(input.listingDraft?.title?.trim()),
  });
  if (!imageUrls.length) {
    console.warn("[vision] resolveChatMediaAttachmentResponse: empty imageUrls");
    return null;
  }

  const userNote = input.userText;
  const sellIntent = isPhotoSellIntentText(userNote);
  const searchIntent = isPhotoSearchIntentText(userNote);
  console.log("[vision] resolveChatMediaAttachmentResponse intents", {
    sellIntent,
    searchIntent,
    imageOnly: isImageOnlyChatUpload(userNote),
  });

  const flowState = inferListingFlowState({
    listingFlowState: input.listingDraft?.listingFlowState,
    hasDraft: Boolean(input.listingDraft?.title?.trim()),
    photoCount: 0,
  });

  if (searchIntent && !sellIntent) {
    console.log("[vision] resolveChatMediaAttachmentResponse: search path (skip scan)", {
      flowState,
    });
    return {
      ok: true,
      reply:
        "Gerai — ieškau panašių skelbimų pagal jūsų nuotrauką(-as). Jei reikės, paklausiu dar vieno patikslinimo.",
      quickReplies: [],
      toolCalls: [{ name: "photoIntentSearch", result: { ok: true, imageUrls } }],
      actions: { type: "none" },
    };
  }

  if (!listingFlowAllowsPhotoUpload(flowState)) {
    console.warn("[vision] resolveChatMediaAttachmentResponse: photo upload locked", {
      flowState,
    });
    return {
      ok: true,
      reply: AWAITING_CONFIRMATION_LOCKED,
      quickReplies: [],
      toolCalls: [],
      actions: { type: "none" },
    };
  }

  console.log("[vision] resolveChatMediaAttachmentResponse → resolveListingPhotoScan", {
    flowState,
    sellIntent,
    hasDraftTitle: Boolean(input.listingDraft?.title?.trim()),
  });

  // Photos without a draft yet: create draft via vision, then land in confirmation.
  // If draft exists in AWAITING_PHOTOS / DRAFTING_TEXT — scan and advance.
  if (!input.listingDraft?.title?.trim() && !sellIntent && isImageOnlyChatUpload(userNote)) {
    // Still allow vision sell-path for bare photo uploads (marketplace default).
    return resolveListingPhotoScan({
      ...input,
      flowState: flowState ?? "AWAITING_PHOTOS",
    });
  }

  if (flowState === null && !input.listingDraft?.title?.trim()) {
    // No draft — vision creates one; treat as photos stage entry.
    return resolveListingPhotoScan({
      ...input,
      flowState: "AWAITING_PHOTOS",
    });
  }

  if (flowState === "DRAFTING_TEXT") {
    // Photos arrived during drafting: accept (cannot skip confirmation without scan).
    return resolveListingPhotoScan({
      ...input,
      flowState: transitionListingFlow("DRAFTING_TEXT", "DRAFT_SAVED"),
    });
  }

  return resolveListingPhotoScan({
    ...input,
    flowState: flowState ?? "AWAITING_PHOTOS",
  });
}
