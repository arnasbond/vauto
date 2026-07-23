import type { AgentSideEffect } from "./agent-tools.js";
import { normalizeListingDraftForAction } from "./listing-chat-input.js";
import {
  AWAITING_CONFIRMATION_LOCKED,
  buildPostVisionHeroMessage,
  inferListingFlowState,
  listingFlowAllowsPhotoUpload,
  POST_VISION_PUBLISH_CHIPS,
  transitionListingFlow,
  type ListingFlowState,
} from "./listing-conversational-flow.js";
import { parseListingImagesForAgent } from "./vauto-unified.js";
import { hardFilterPublicGalleryUrls } from "./listing-gallery-roles.js";
import { DOCUMENT_OCR_SOFT_NOTE } from "./sell-intent-fallback.js";
import {
  LAZY_UPLOAD_LOG_TAG,
  LAZY_UPLOAD_PHASE,
  LAZY_UPLOAD_VISION,
} from "../shared/lazy-upload.js";

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

/** Vision sales copy replaces prior description — never append (stops duplicated paragraphs). */
function mergeVisionDescription(existing?: string, vision?: string): string {
  const a = String(existing ?? "").trim();
  const b = String(vision ?? "").trim();
  if (b) return b;
  return a;
}

function imageDedupeKey(url: string): string {
  const u = url.trim();
  if (u.startsWith("data:")) {
    const comma = u.indexOf(",");
    const meta = comma >= 0 ? u.slice(0, comma) : "data";
    const payload = comma >= 0 ? u.slice(comma + 1) : u;
    const len = payload.length;
    const sample =
      payload.slice(0, 48) + payload.slice(Math.max(0, len - 48));
    return `data:${meta.length}:${len}:${sample}`;
  }
  try {
    const parsed = new URL(u);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return u;
  }
}

function uniqueImageUrls(urls: string[]): string[] {
  const map = new Map<string, string>();
  for (const raw of urls) {
    const u = String(raw ?? "").trim();
    if (!u) continue;
    const key = imageDedupeKey(u);
    if (!map.has(key)) map.set(key, u);
  }
  return Array.from(map.values()).slice(0, 6);
}

type MediaListingDraft = {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
  category?: string;
  attributes?: Record<string, string>;
  orderedImageUrls?: string[];
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
  // Lazy Upload invariant: Vision OCR uses in-memory data/http URLs only.
  // Permanent Cloudinary + insertListing wait for Publikuoti / Patvirtinti.
  console.log(`${LAZY_UPLOAD_LOG_TAG} resolveListingPhotoScan`, {
    phase: LAZY_UPLOAD_PHASE.VISION,
    lazyUpload: LAZY_UPLOAD_VISION,
    persist: false,
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

  const priorTitle = input.listingDraft?.title?.trim() || "";
  const priorTitleIsGeneric =
    !priorTitle ||
    /^(naujas skelbimas|drabužių skelbimas|prekė)$/i.test(priorTitle);

  const extraBits = [
    input.listingDraft?.category
      ? `category hint: ${input.listingDraft.category}`
      : "",
    input.userText?.trim() && !isImageOnlyChatUpload(input.userText)
      ? `user note: ${input.userText.trim()}`
      : "",
    "Vision MULTIMODAL FUSION (UNIVERSAL OCR + MASTER SALES COPYWRITER): passport PRIMARY OCR across ALL attached photos. HARD SPECS A/B/D.1/D.3/S.1/P.1–P.3/R/V.9/G/C.1.3/E → technicalFields. B→firstRegistration YYYY-MM-DD. S.1=7/Grand → Grand C4 Picasso. Mentelės → Automatinė/EGS. DRAUDŽIAMA išgalvoti kainą/TA/ridą. documentImageIndexes = OCR-only.",
    "ANTI-STALE: title/make/model TIK iš dabartinių nuotraukų+OCR. IGNORUOK seną listingDraft.title / myListings antraštes, jei vizualiai nesutampa.",
    "MASTER SALES COPYWRITER: title engaginantis; description = hook + • **Ypatybės** bullet'ai + CTA su Markdown ** ir \\n. DRAUDŽIAMA sausas caption („pavaizduoti rudi taškeliai…“).",
  ].filter(Boolean);

  let parsed: Awaited<ReturnType<typeof parseListingImagesForAgent>>;
  try {
    parsed = await parseListingImagesForAgent({
      imageDataUrls: imageUrls,
      userCity: input.userCity ?? "",
      contact: input.contact,
      text:
        input.userText?.trim() && !isImageOnlyChatUpload(input.userText)
          ? input.userText.trim()
          : input.userText?.trim() ||
            (!priorTitleIsGeneric ? priorTitle : undefined),
      priceHint:
        input.listingDraft?.price && input.listingDraft.price > 0
          ? input.listingDraft.price
          : undefined,
      extraContext: [
        ...extraBits,
        "PRIVALOMA: UNIVERSAL OCR → technicalFields/attributes; tada MASTER SALES COPYWRITER description lietuviškai (hook + **Atlikimas/Būklė**, **Stilius/Specifikacijos**, **Spalvos/Parametrai** + closing CTA). PALIK Markdown ** ir naujas eilutes. DRAUDŽIAMA sausas image caption. Dokumentų indeksus — documentImageIndexes. NIEKADA neperrašyk senos antraštės be OCR pagrindo.",
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
          result: {
            ok: true,
            needsClarification: true,
            message,
            documentUrls: parsed.documentUrls,
            galleryUrls: parsed.galleryUrls,
          },
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
  const evidenceDocs = parsed.documentUrls;
  // NEVER fall back to the full upload set — that re-injects tech passport into Vieša galerija.
  const publicGallery = hardFilterPublicGalleryUrls(
    parsed.galleryUrls,
    evidenceDocs,
    listingAttrs
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
    attributes: {
      ...listingAttrs,
      ...(evidenceDocs.length
        ? {
            documentImageUrls: evidenceDocs.join("|"),
            documentImageCount: String(evidenceDocs.length),
          }
        : {}),
    },
    orderedImageUrls: publicGallery,
  };

  const nextState =
    transitionListingFlow(input.flowState, "PHOTOS_SCANNED") ?? "DRAFT_READY";

  const priorAttrs = input.listingDraft?.attributes ?? {};
  const categoryChanged =
    Boolean(input.listingDraft?.category) &&
    input.listingDraft?.category !== visionDraft.category;
  // Never bleed previous product identity (Peiko/Hohner/fashion size) into a new Vision scan.
  const safePriorAttrs = categoryChanged
    ? Object.fromEntries(
        Object.entries(priorAttrs).filter(
          ([k]) =>
            !/^(brand|fashionCategory|fashionSubcategory|clothingType|size|colors|manufacturer|deviceModel|selectedObject|choiceChips|clarificationPrompt)$/i.test(
              k
            )
        )
      )
    : priorAttrs;

  const mergedDraft = normalizeListingDraftForAction(
    input.listingDraft
      ? {
          ...input.listingDraft,
          ...visionDraft,
          title: visionDraft.title,
          description: visionDraft.description,
          orderedImageUrls: publicGallery,
          attributes: {
            ...safePriorAttrs,
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

  const quotaFallback =
    String(mergedDraft.attributes?.visionQuotaFallback ?? "") === "true";
  const hasFusion = evidenceDocs.length > 0 && publicGallery.length > 0;
  const hasHardSpecs = Boolean(
    mergedDraft.attributes?.year ||
      mergedDraft.attributes?.engine ||
      mergedDraft.attributes?.fuelType ||
      mergedDraft.attributes?.make
  );
  const softOcrNoteRaw =
    !hasFusion &&
    !hasHardSpecs &&
    (String(mergedDraft.attributes?.documentOcrSoftNote ?? "").trim() ||
      (String(mergedDraft.attributes?.documentOcrUnclear ?? "") === "true"
        ? DOCUMENT_OCR_SOFT_NOTE
        : ""));
  const softOcrNote =
    typeof softOcrNoteRaw === "string" ? softOcrNoteRaw.trim() : "";
  // Lean Step-2: one-line vision summary + prepare chip (skip verbose ack chatter).
  const summary = buildPostVisionHeroMessage(mergedDraft);
  const reply = softOcrNote
    ? `${softOcrNote}\n\n${summary}`
    : quotaFallback
      ? `Išsaugojau nuotraukas. ${summary}`
      : summary;
  const quickReplies: string[] = [...POST_VISION_PUBLISH_CHIPS];

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
          imageUrls: publicGallery,
          documentUrls: evidenceDocs,
          listingFlowState: nextState,
          lazyUpload: true,
          persist: false,
        },
      },
    ],
    actions: {
      type: "listing_draft",
      listingDraft: mergedDraft,
      imageUrl: publicGallery[0],
      imageUrls: publicGallery,
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
