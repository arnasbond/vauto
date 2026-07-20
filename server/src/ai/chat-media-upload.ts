import type { AgentSideEffect } from "./agent-tools.js";
import { normalizeListingDraftForAction } from "./listing-chat-input.js";
import { buildConversationalMissingPrompt } from "./listing-conversational-flow.js";
import {
  buildPostValidationReportMessage,
  POST_VALIDATION_QUICK_REPLIES,
} from "./structured-input-pipeline.js";
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
    t === "skelbti"
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

async function resolveListingPhotoScan(input: {
  imageUrls: string[];
  listingDraft?: {
    title?: string;
    description?: string;
    price?: number;
    location?: string;
    category?: string;
    attributes?: Record<string, string>;
  };
  userCity?: string;
  contact?: string;
  userText?: string;
}): Promise<{
  ok: true;
  reply: string;
  quickReplies?: string[];
  toolCalls: { name: string; result: unknown }[];
  actions: AgentSideEffect | { type: "none" };
}> {
  const imageUrls = uniqueImageUrls(input.imageUrls);

  const extraBits = [
    input.listingDraft?.category
      ? `category hint: ${input.listingDraft.category}`
      : "",
    input.userText?.trim() && !isImageOnlyChatUpload(input.userText)
      ? `user note: ${input.userText.trim()}`
      : "",
    "Vision: enrich listing description with color, condition, equipment, and visible defects from ALL photos.",
  ].filter(Boolean);

  const parsed = await parseListingImagesForAgent({
    imageDataUrls: imageUrls,
    userCity: input.userCity ?? "",
    contact: input.contact,
    extraContext: extraBits.length ? extraBits.join("; ") : undefined,
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
    price: parsed.listing.price,
    location: parsed.listing.location,
    category: parsed.listing.category,
    attributes: listingAttrs,
  };

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
        }
      : visionDraft,
    {
      contact: input.contact,
      userCity: input.userCity,
    }
  );

  const ack = photoAckLine(imageUrls.length);
  const report = buildPostValidationReportMessage({
    category: mergedDraft.category,
    title: mergedDraft.title,
    description: mergedDraft.description,
    price: mergedDraft.price,
    location: mergedDraft.location,
    attributes: mergedDraft.attributes,
  });

  let reply = `${ack}\n\n${report}`;

  if (!mergedDraft.price || mergedDraft.price <= 0) {
    reply = `${ack}\n\n${buildConversationalMissingPrompt({ missingPrice: true })}`;
  } else if (!mergedDraft.location?.trim()) {
    reply = `${ack}\n\n${buildConversationalMissingPrompt({ missingCity: true })}`;
  }

  const ambiguousImageOnly =
    isImageOnlyChatUpload(input.userText) && !input.listingDraft?.title?.trim();

  return {
    ok: true,
    reply,
    quickReplies: ambiguousImageOnly
      ? [...PHOTO_INTENT_ROUTING_CHIPS, ...POST_VALIDATION_QUICK_REPLIES].slice(0, 4)
      : [...POST_VALIDATION_QUICK_REPLIES],
    toolCalls: [
      {
        name: "scanListingPhotos",
        result: {
          ok: true,
          message: reply,
          draft: mergedDraft,
          imageUrls,
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
  listingDraft?: {
    title?: string;
    description?: string;
    price?: number;
    location?: string;
    category?: string;
    attributes?: Record<string, string>;
  };
  userCity?: string;
  contact?: string;
  userText?: string;
}): Promise<{
  ok: true;
  reply: string;
  quickReplies?: string[];
  toolCalls: { name: string; result: unknown }[];
  actions: AgentSideEffect | { type: "none" };
} | null> {
  const imageUrls = uniqueImageUrls(input.imageUrls);
  if (!imageUrls.length) return null;

  const userNote = input.userText;
  const sellIntent = isPhotoSellIntentText(userNote);
  const searchIntent = isPhotoSearchIntentText(userNote);

  // Pure search chip — do not create/overwrite a sell draft.
  if (searchIntent && !sellIntent) {
    return {
      ok: true,
      reply:
        "Gerai — ieškau panašių skelbimų pagal jūsų nuotrauką(-as). Jei reikės, paklausiu dar vieno patikslinimo.",
      quickReplies: [],
      toolCalls: [{ name: "photoIntentSearch", result: { ok: true, imageUrls } }],
      actions: { type: "none" },
    };
  }

  // Always run Gemini Vision for uploads: enrich title/description/attrs from
  // all photos — never stop at a bare „nuotrauka įdėta“ ack.
  return resolveListingPhotoScan(input);
}
