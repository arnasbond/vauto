/**
 * VAUTO listing organism — Hero Flow state machine (Arnold / constitution).
 *
 * Universal text-first (all categories):
 *   DRAFTING_TEXT → DRAFT_READY → AWAITING_CONFIRMATION
 * Photos are optional enrichment — never required before a text draft.
 * AWAITING_PHOTOS = soft “user chose to attach photos now” (not a hard gate).
 */

export const LISTING_FLOW_STATES = {
  DRAFTING_TEXT: "DRAFTING_TEXT",
  AWAITING_PHOTOS: "AWAITING_PHOTOS",
  DRAFT_READY: "DRAFT_READY",
  AWAITING_CONFIRMATION: "AWAITING_CONFIRMATION",
} as const;

export type ListingFlowState =
  (typeof LISTING_FLOW_STATES)[keyof typeof LISTING_FLOW_STATES];

export type ListingFlowEvent =
  | "DRAFT_SAVED"
  | "PHOTOS_SCANNED"
  | "OBJECT_SELECTED"
  | "READY_TO_PUBLISH"
  | "CONFIRMATION_SHOWN"
  | "FLOW_RESET";

const STATE_ORDER: ListingFlowState[] = [
  "DRAFTING_TEXT",
  "AWAITING_PHOTOS",
  "DRAFT_READY",
  "AWAITING_CONFIRMATION",
];

const EVENT_TARGET: Record<ListingFlowEvent, ListingFlowState | null> = {
  /** Text draft ready — photos optional; ask photos vs PrePublish */
  DRAFT_SAVED: "DRAFT_READY",
  /** Vision finished — same DRAFT_READY gate */
  PHOTOS_SCANNED: "DRAFT_READY",
  /** Multi-object chip pick — lock straight to PrePublish */
  OBJECT_SELECTED: "AWAITING_CONFIRMATION",
  READY_TO_PUBLISH: "AWAITING_CONFIRMATION",
  CONFIRMATION_SHOWN: "AWAITING_CONFIRMATION",
  FLOW_RESET: null,
};

export const PRE_PUBLISH_CARD_INTRO =
  "Štai jūsų skelbimo peržiūra — patikrinkite antraštę, kainą ir nuotraukas. Publikavimas vyksta TIK paspaudus „Patvirtinti ir publikuoti“.";

/** Soft invite when user chose to attach photos — never a hard block on sell text. */
export const AWAITING_PHOTOS_PROMPT =
  "Puiku — įkelkite iki 6 nuotraukų čia pokalbyje. Gera nuotrauka dažnai atneša kelis kartus daugiau dėmesio.";

export const AWAITING_PHOTOS_NUDGE =
  "Kai būsite pasiruošę — įkelkite nuotraukas čia pokalbyje (iki 6 vnt.). Arba parašykite „Judame prie PrePublish“, jei norite peržiūrėti be nuotraukų.";

/** Shared gate after text OR vision draft is ready (Arnold text-first). */
export const POST_VISION_PUBLISH_GATE =
  "Aprašymas paruoštas! Ar norite dabar prisegti nuotraukas, ar judame tiesiai prie PrePublish kortelės peržiūros?";

/** Alias — same universal gate copy. */
export const TEXT_DRAFT_READY_GATE = POST_VISION_PUBLISH_GATE;

export const POST_VISION_MORE_PHOTOS_NUDGE =
  "Gerai — įkelkite nuotraukas čia pokalbyje (iki 6 vnt.). Kuo daugiau kampų, tuo greičiau atsiranda pasitikėjimas.";

export const POST_VISION_PUBLISH_CHIPS = [
  "Judame prie PrePublish",
  "Prisegti nuotraukas",
] as const;

/** Alias — same chips. */
export const TEXT_DRAFT_READY_CHIPS = POST_VISION_PUBLISH_CHIPS;

export const AWAITING_CONFIRMATION_LOCKED =
  "Skelbimas paruoštas patvirtinimui. Tekstas nekeičia aprašymo — peržiūrėkite kortelę žemiau ir spauskite „Patvirtinti ir publikuoti“.";

export const PROFILE_CITY_REQUIRED =
  "Kad pirkėjai žinotų, kur jus rasti — kokį miestą rodyti skelbime? Parašykite čia pokalbyje.";

export const PROFILE_PHONE_REQUIRED =
  "Kad pirkėjai galėtų susisiekti — kokį telefono numerį rodyti skelbime? Parašykite čia, aš įrašysiu į profilį.";

/** Multi-object vision chip, e.g. „Parduoti telefoną“ (not „📦 Parduoti šį daiktą“). */
export function isVisionObjectSellChip(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^📦/.test(t)) return false;
  if (/parduoti\s+š[iį]\s+daikt/i.test(t)) return false;
  return /^parduoti\s+\S+/i.test(t);
}

export function nounFromVisionObjectSellChip(text: string): string {
  return text
    .trim()
    .replace(/^parduoti\s+/i, "")
    .replace(/[.!?]+$/g, "")
    .trim();
}

/** „viskas / publikuojam / PrePublish / nenoriu“ → lock PrePublish */
export function isPublishReadyIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (/^nenoriu(\b|$)/i.test(t)) return true;
  if (/^viskas\b/i.test(t)) return true;
  if (/\bpublikuojam\b|\bpublikuoti\b/i.test(t)) return true;
  if (/\bprepublish\b|\bpre-publish\b|\bpre\s*publish\b/i.test(t)) return true;
  if (/\bjudame\b.*\b(prepublish|publik|peržiūr)/i.test(t)) return true;
  if (/\bprie\s+(prepublish|publik|peržiūr)/i.test(t)) return true;
  if (/tiesiai\s+prie/i.test(t)) return true;
  if (/^(pakanka|užtenka|uztenka)\b/i.test(t)) return true;
  if (/^taip[,!]?\s*(publiku|tinka|judam)/i.test(t)) return true;
  if (/be\s+daugiau|nebereikia|daugiau\s+nereikia/i.test(t)) return true;
  return false;
}

export function isMorePhotosIntent(text: string): boolean {
  // „prisegti nuotraukas ir PrePublish“ → PrePublish wins (not photo nudge).
  if (isPublishReadyIntent(text)) return false;
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (/prisegti\s+nuotrauk/i.test(t)) return true;
  if (/įkelti\s+dar\s+nuotrauk/i.test(t)) return true;
  if (/įkelti\s+nuotrauk/i.test(t)) return true;
  if (/dar\s+nuotrauk/i.test(t)) return true;
  if (/noriu\s+dar/i.test(t)) return true;
  if (/papildom/i.test(t)) return true;
  return false;
}

/**
 * Text-first listing: generate description / sell without photos yet.
 * Must NEVER be blocked by the AWAITING_PHOTOS nudge loop.
 */
export function isTextFirstListingIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t || t.length < 3) return false;
  if (
    /\b(sugeneruok|sugeneruoti|sugeneruos|generuok|generate)\b/i.test(t)
  ) {
    return true;
  }
  if (
    /\b(parašyk|parasyk|sukurk|paruošk|paruosk)\b.*\b(apraš|apras|skelbim|tekst)/i.test(
      t
    ) ||
    /\b(aprašym|aprasym).*\b(sugener|paraš|parasy|sukur)/i.test(t)
  ) {
    return true;
  }
  if (
    /\b(be\s+nuotrauk|neturiu\s+nuotrauk|nėra\s+nuotrauk|nera\s+nuotrauk|praleisk\s+nuotrauk|skip\s+photo|later\s+photo)\b/i.test(
      t
    )
  ) {
    return true;
  }
  if (
    /\b(parduodu|parduoti|pardavim|noriu\s+parduot|norėčiau\s+parduot|noreciau\s+parduot|įkelti\s+skelbim|ikelti\s+skelbim|paskelbk|paskelbti)\b/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

/** Product/model/year/color context — any category, no image required. */
export function isProductDescriptionContext(text: string): boolean {
  const t = text.trim();
  if (t.length < 4) return false;
  if (
    /\b(iphone|samsung|galaxy|fold|pixel|xiaomi|huawei|macbook|ipad|airpods|volvo|bmw|audi|mercedes|toyota|vw|volkswagen|ford|opel|peugeot|citroen|skoda|seat|honda|nissan|kia|hyundai|nike|adidas|zara|butas|namas|sklypas|sodyba)\b/i.test(
      t
    )
  ) {
    return true;
  }
  // Year + vehicle/product signal (e.g. „2006 Volvo V70“)
  if (/\b(19|20)\d{2}\b/.test(t) && t.split(/\s+/).length >= 2) {
    return true;
  }
  if (
    /\b(mėlyn|melyn|juod|balt|auksin|sidabr|žali|zali|raudon|pilk|pilkas|spalvos|spalva|universalas|hečbek|sedanas|rankinė|automatinė)\b/i.test(
      t
    ) &&
    t.length >= 8
  ) {
    return true;
  }
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 3 && !/^(taip|ne|ok|gerai|supratau)\b/i.test(t)) {
    return true;
  }
  return false;
}

/** Global: never hard-block text-driven listing turns behind a photo gate. */
export function shouldBypassPhotosNudge(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isMorePhotosIntent(t)) return false;
  return (
    isTextFirstListingIntent(t) ||
    isProductDescriptionContext(t) ||
    isPublishReadyIntent(t) ||
    t.length >= 8
  );
}

export function isListingFlowState(value: unknown): value is ListingFlowState {
  return (
    value === "DRAFTING_TEXT" ||
    value === "AWAITING_PHOTOS" ||
    value === "DRAFT_READY" ||
    value === "AWAITING_CONFIRMATION"
  );
}

export function inferListingFlowState(input: {
  listingFlowState?: string | null;
  hasDraft: boolean;
  photoCount: number;
}): ListingFlowState | null {
  if (!input.hasDraft) return null;
  if (isListingFlowState(input.listingFlowState)) return input.listingFlowState;
  // Text-first default: never force AWAITING_PHOTOS without an explicit state.
  if (input.photoCount > 0) return "DRAFT_READY";
  return "DRAFTING_TEXT";
}

export function canTransitionListingFlow(
  from: ListingFlowState | null,
  to: ListingFlowState | null
): boolean {
  if (to === null) return true;
  if (from === null) {
    return STATE_ORDER.includes(to);
  }
  if (from === to) return true;
  // Explicit unlock: PrePublish not ready (missing price) → allow typing again.
  if (from === "AWAITING_CONFIRMATION" && to === "DRAFT_READY") return true;
  return STATE_ORDER.indexOf(to) >= STATE_ORDER.indexOf(from);
}

/**
 * Never downgrade past DRAFT_READY into AWAITING_PHOTOS / DRAFTING_TEXT.
 * AWAITING_CONFIRMATION → DRAFT_READY IS allowed when PrePublish cannot render
 * (missing price/city) so the composer does not stay in a dead lock.
 */
export function resolveLockedListingFlowState(
  current: ListingFlowState | string | null | undefined,
  incoming: ListingFlowState | string | null | undefined
): ListingFlowState | undefined {
  const cur = isListingFlowState(current) ? current : null;
  const next = isListingFlowState(incoming) ? incoming : null;
  if (!cur && !next) return undefined;
  if (!cur) return next ?? undefined;
  if (!next) return cur;
  if (canTransitionListingFlow(cur, next)) return next;
  return cur;
}

export function isHeroFlowLocked(state: ListingFlowState | string | null | undefined): boolean {
  return state === "DRAFT_READY" || state === "AWAITING_CONFIRMATION";
}

export function transitionListingFlow(
  current: ListingFlowState | null,
  event: ListingFlowEvent
): ListingFlowState | null {
  if (event === "FLOW_RESET") return null;
  const target = EVENT_TARGET[event];
  if (!target) return current;
  if (current === null) {
    if (event === "DRAFT_SAVED" || event === "PHOTOS_SCANNED") {
      return "DRAFT_READY";
    }
    if (
      event === "OBJECT_SELECTED" ||
      event === "READY_TO_PUBLISH" ||
      event === "CONFIRMATION_SHOWN"
    ) {
      return "AWAITING_CONFIRMATION";
    }
    return current;
  }
  if (current === target) return current;
  if (!canTransitionListingFlow(current, target)) return current;
  return target;
}

export function listingFlowAllowsFieldMutation(state: ListingFlowState | null): boolean {
  return state === null || state === "DRAFTING_TEXT";
}

export function listingFlowAllowsPhotoUpload(state: ListingFlowState | null): boolean {
  return (
    state === null ||
    state === "DRAFTING_TEXT" ||
    state === "AWAITING_PHOTOS" ||
    state === "DRAFT_READY"
  );
}

export function listingFlowTreatsTextAsConfirmation(
  state: ListingFlowState | null
): boolean {
  return state === "AWAITING_CONFIRMATION";
}

export function listingFlowComposerPlaceholder(
  state: ListingFlowState | null
): string | null {
  if (state === "AWAITING_PHOTOS") {
    return "Įkelkite nuotraukas arba „Judame prie PrePublish“…";
  }
  if (state === "DRAFT_READY") {
    return "„Prisegti nuotraukas“ arba „Judame prie PrePublish“…";
  }
  if (state === "AWAITING_CONFIRMATION") {
    return "Spauskite „Patvirtinti ir publikuoti“ ant kortelės";
  }
  return null;
}

/**
 * Composer must NEVER hard-lock on AWAITING_CONFIRMATION.
 * Sellers still need to type price / city fixes if the PrePublish card
 * failed to render — a locked empty composer is a dead end.
 */
export function listingFlowComposerTextLocked(
  _state: ListingFlowState | null
): boolean {
  void _state;
  return false;
}

export type ListingFlowDispatchResult =
  | { kind: "allow_drafting" }
  | { kind: "nudge_photos"; reply: string }
  | { kind: "process_photos" }
  | { kind: "object_selected" }
  | { kind: "show_confirmation"; reply: string }
  | { kind: "ignore_backward"; reply: string };

export function dispatchListingFlowTurn(input: {
  state: ListingFlowState | null;
  userText: string;
  hasIncomingPhotos: boolean;
  photoCount: number;
  hasDraft?: boolean;
}): ListingFlowDispatchResult {
  const state = input.state;
  const text = input.userText.trim();

  if (input.hasIncomingPhotos) {
    if (!listingFlowAllowsPhotoUpload(state)) {
      return { kind: "ignore_backward", reply: AWAITING_CONFIRMATION_LOCKED };
    }
    /**
     * Same turn: attach photos + „judame prie PrePublish“.
     * Client merges URLs into the draft before dispatch; skip Vision detour.
     */
    if (
      isPublishReadyIntent(text) &&
      (state === "DRAFT_READY" ||
        state === "AWAITING_PHOTOS" ||
        state === "DRAFTING_TEXT" ||
        Boolean(input.hasDraft) ||
        input.photoCount > 0)
    ) {
      return { kind: "show_confirmation", reply: PRE_PUBLISH_CARD_INTRO };
    }
    return { kind: "process_photos" };
  }

  /** Multi-object pick → PrePublish immediately (no photos-nudge / LLM detour). */
  if (isVisionObjectSellChip(text)) {
    return { kind: "object_selected" };
  }

  /** Hero gate: PrePublish / publikuojam — photos NOT required */
  if (
    isPublishReadyIntent(text) &&
    (state === "DRAFT_READY" ||
      state === "AWAITING_PHOTOS" ||
      state === "DRAFTING_TEXT" ||
      state === "AWAITING_CONFIRMATION" ||
      Boolean(input.hasDraft))
  ) {
    return { kind: "show_confirmation", reply: PRE_PUBLISH_CARD_INTRO };
  }

  // Rule #1: DRAFT_READY — any non-photo text goes to the AI (no gate / no intent guessing).
  if (state === "DRAFT_READY") {
    return { kind: "allow_drafting" };
  }

  if (state === "AWAITING_CONFIRMATION") {
    // Only the explicit publish chips lock PrePublish — free text goes to the AI.
    return { kind: "allow_drafting" };
  }

  if (state === "AWAITING_PHOTOS") {
    if (isMorePhotosIntent(text)) {
      return { kind: "nudge_photos", reply: POST_VISION_MORE_PHOTOS_NUDGE };
    }
    // Soft stage only — any substantive text returns to proactive drafting.
    if (shouldBypassPhotosNudge(text) || text.length >= 2) {
      return { kind: "allow_drafting" };
    }
    return { kind: "nudge_photos", reply: AWAITING_PHOTOS_NUDGE };
  }

  return { kind: "allow_drafting" };
}

/** After text draft: show description + Arnold gate (photos optional). */
export function buildDraftingCompletePhotosPrompt(draft: {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
}): string {
  const title = draft.title?.trim() || "prekę";
  const price =
    draft.price != null && draft.price > 0 ? `${draft.price} €` : "";
  const loc = draft.location?.trim() || "";
  const desc = draft.description?.trim();
  const bits = [title, price, loc].filter(Boolean).join(" · ");
  const preview =
    desc && desc.length >= 40
      ? `\n\n${desc.length > 320 ? `${desc.slice(0, 320).trim()}…` : desc}`
      : "";
  return `Paruošiau skelbimą: ${bits}.${preview}\n\n${POST_VISION_PUBLISH_GATE}`;
}

/** Alias for text-first complete draft bubble. */
export function buildTextDraftReadyMessage(draft: {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
}): string {
  return buildDraftingCompletePhotosPrompt(draft);
}

/** Beautiful completed listing bubble after Vision — then publish gate question. */
export function buildPostVisionHeroMessage(draft: {
  title?: string;
  description?: string;
  price?: number;
  priceLabel?: string;
  location?: string;
  category?: string;
}): string {
  const title = draft.title?.trim() || "Jūsų prekė";
  const desc = draft.description?.trim() || "";
  const price =
    draft.priceLabel?.trim() ||
    (draft.price != null && draft.price > 0 ? `${draft.price} €` : "");
  const loc = draft.location?.trim() || "";
  const meta = [price, loc].filter(Boolean).join(" · ");
  const tip =
    draft.category === "electronics"
      ? "Patarimas: baterijos būklė, atmintis ir dėžutė — trys dalykai, kurie greičiausiai uždaro sandorį."
      : draft.category === "vehicles"
        ? "Patarimas: metai, rida ir komplektacija kelia pasitikėjimą labiau nei ilgas tekstas be faktų."
        : "Patarimas: konkretus aprašymas parduoda greičiau — pirkėjai greitai pastebi aiškumą.";
  // After Vision, photos are already attached — never ask to „prisegti nuotraukas“ again.
  const cta =
    "Štai aprašymas pagal jūsų nuotraukas. Kokią kainą nustatome, ar judame prie PrePublish kortelės peržiūros?";
  const lines = [
    `Paruošiau gražų skelbimą:`,
    ``,
    title,
    desc ? `\n${desc}` : "",
    meta ? `\n${meta}` : "",
    ``,
    tip,
    ``,
    cta,
  ];
  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
}
