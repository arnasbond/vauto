/**
 * VAUTO listing organism — Hero Flow state machine (Arnold / constitution).
 *
 * Universal text-first (all categories):
 *   DRAFTING_TEXT → DRAFT_READY → AWAITING_CONFIRMATION
 * Photos are optional enrichment — never required before a text draft.
 * AWAITING_PHOTOS = soft “user chose to attach photos now” (not a hard gate).
 *
 * P0-2 — Before any show_confirmation / Publikuoti / Publikuok finalize,
 * callers MUST run ensureRichSalesCopyBeforePublish() so Pass-2 / deferred
 * sales copy is attached. Never publish empty Vision description stubs.
 */

export {
  draftHasRichSalesCopyAttached,
  draftNeedsRichSalesCopyMaterialization,
  ensureRichSalesCopyBeforePublish,
  isRichSalesCopyText,
  looksLikeVehicleSalesDraft,
} from "./ensure-rich-sales-copy.js";

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
  "Štai skelbimo peržiūros langas — galite redaguoti antraštę, kainą, aprašymą ir nuotraukas. Publikavimas vyksta TIK paspaudus „Publikuoti skelbimą“.";

/** Soft invite when user chose to attach photos — never a hard block on sell text. */
export const AWAITING_PHOTOS_PROMPT =
  "Puiku — įkelkite nuotraukas čia pokalbyje (iki 12 automobiliui, iki 8 kitoms prekėms). Gera nuotrauka dažnai atneša kelis kartus daugiau dėmesio.";

export const AWAITING_PHOTOS_NUDGE =
  "Kai būsite pasiruošę — įkelkite nuotraukas per (+) mygtuką pokalbyje (iki 12 / 8 vnt. pagal kategoriją).";

/** Step 2 CTA after vision summary — prepare full listing draft. */
export const POST_VISION_PUBLISH_GATE =
  "Ar paruošti skelbimo juodraštį patikrinimui?";

/**
 * Short conversational ack after draft synthesis (chat only).
 * Full title/description live on listingDraft / PrePublish — never paste them here.
 */
export const TEXT_DRAFT_READY_GATE =
  "Paruošiau pilną skelbimo juodraštį! Galite jį peržiūrėti PrePublish kortelėje arba parašyti, ką norite patikslinti.";

export const POST_VISION_MORE_PHOTOS_NUDGE =
  "Gerai — įkelkite nuotraukas per (+) mygtuką (iki 12 automobiliui ar iki 8 kitoms). Kuo daugiau kampų, tuo greičiau atsiranda pasitikėjimas.";

/** Step 2 chips — generate full marketplace draft. */
export const POST_VISION_PUBLISH_CHIPS = [
  "✨ Paruošti skelbimą",
  "Įkelti nuotraukas",
] as const;

/** Step 3 chips — open PrePublish or edit. */
export const TEXT_DRAFT_READY_CHIPS = ["🚀 Publikuoti", "✏️ Papildyti"] as const;

/** Lean Step-1 sell greeting — physical goods (photos / packaging tips). */
export const LEAN_SELL_GREETING =
  "Puiku — esu jūsų pardavimo partneris! Įkelkite nuotraukas (prekė, etiketė, komplektacija — iki 8, automobiliui iki 12) ir parašykite kainą — aš sudėliosiu turtingą skelbimą.";

/** Category-aware Step-1 greeting — no packaging tips for jobs/services/NT. */
export function buildLeanSellGreeting(category?: string | null): string {
  const cat = String(category ?? "").toLowerCase();
  if (
    cat === "jobs" ||
    cat === "services" ||
    cat === "real_estate" ||
    cat === "darbas" ||
    cat === "paslaugos" ||
    cat === "nt"
  ) {
    return "Puiku — esu jūsų pardavimo partneris! Aprašykite pasiūlymą (darbas, paslauga ar NT) ir kainą ar atlygį — aš sudėliosiu skelbimą. Nuotraukos neprivalomos.";
  }
  if (!cat || cat === "other" || cat === "kita" || cat === "rental" || cat === "nuoma") {
    return "Puiku — esu jūsų pardavimo partneris! Aprašykite, ką norite skelbti, ir kainą — aš sudėliosiu turtingą skelbimą. Nuotraukas galite įkelti dabar arba vėliau.";
  }
  return LEAN_SELL_GREETING;
}

/** True when user taps / types Step-2 prepare CTA. */
export function isPrepareListingIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t || t.length > 120) return false;
  if (/paruošti\s+skelbim/i.test(t)) return true;
  if (/^✨?\s*paruošti\s+skelbim/i.test(t)) return true;
  if (/^(paruošk|paruosk|generuok|sukurk)\b/i.test(t)) return true;
  if (/generuok\s+skelbim/i.test(t)) return true;
  if (/paruošk.*skelbim/i.test(t)) return true;
  return false;
}

/** True when user wants to edit before publish (Step 3 Papildyti). */
export function isAmendListingIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (isPublishReadyIntent(text)) return false;
  if (/^✏️?\s*papildyti$/i.test(t)) return true;
  if (/^papildyti$/i.test(t)) return true;
  if (/^papildyk$/i.test(t)) return true;
  return false;
}

/** Multimodal fusion confirm when tech passport + car photos are both present. */
export const MULTIMODAL_FUSION_CONFIRM =
  "Sujungiau techninio paso ir nuotraukų duomenis į specifikacijų ataskaitą.";

/**
 * Exact CTA after vehicle OCR / Vision spec report — NEVER demand price in step 1.
 */
export const VEHICLE_SPEC_COPY_OFFER =
  "Ar norėtumėte, kad pagal šiuos duomenis paruoščiau patrauklų automobilio pardavimo skelbimo tekstą?";

export const AWAITING_CONFIRMATION_LOCKED =
  "Skelbimas paruoštas patvirtinimui. Tekstas nekeičia aprašymo — peržiūrėkite PrePublish langą ir spauskite „Publikuoti skelbimą“.";

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

/**
 * Strong publish imperatives — skip photo re-ask and trigger publication immediately
 * (not merely open PrePublish preview).
 */
export function isImmediatePublishCommand(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (/\bpublikuok(?:ite|im)?\b/i.test(t)) return true;
  if (/\bpublikuojam\b/i.test(t)) return true;
  if (/^publikuoti\b/i.test(t)) return true;
  if (
    /nebereikia|ne,?\s*nereikia|daugiau\s+nereikia|nereikia,?\s*publiku|be\s+daugiau/i.test(
      t
    )
  ) {
    return true;
  }
  if (/^taip[,!]?\s*publiku/i.test(t)) return true;
  return false;
}

/**
 * „Tiesiog parodyk skelbimą“ / „Parodyk“ / „Atidaryk kortelę“ → open PrePublish preview.
 * Must NOT reset the active draft session.
 */
export function isShowDraftPreviewIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t || t.length > 100) return false;
  if (/tiesiog\s+parodyk/i.test(t)) return true;
  if (/parodyk\s+(skelbim|juodrašt|juodrast|kortel|prepublish|peržiūr|perziur)/i.test(t)) {
    return true;
  }
  if (/^(parodyk|peržiūrėti|perziureti)\b/i.test(t) && t.split(/\s+/).length <= 4) {
    return true;
  }
  if (/atidaryk\s+(skelbim|juodrašt|juodrast|kortel|prepublish|peržiūr)/i.test(t)) {
    return true;
  }
  if (/^peržiūrėti\s+skelbim/i.test(t) || /^perziureti\s+skelbim/i.test(t)) return true;
  return false;
}

/**
 * Explicit “open PrePublish / publish now” intents only.
 * Ultra-short affirmations (ok / taip / 👍 / gerai) intentionally do NOT match —
 * they must reach Gemini so dialogue stays natural. Exact chip labels still
 * publish via quick-reply / immediate publish verbs below.
 */
export function isPublishReadyIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (isShowDraftPreviewIntent(t)) return true;
  if (isImmediatePublishCommand(t)) return true;
  // Explicit multi-word confirmations (chip-like), not bare "taip"/"ok".
  if (/^viskas\s+(tinka|gerai|ok|okay)\b/i.test(t)) return true;
  if (/^tinka[,!]?\s*(publiku|skelbk|keliam)/i.test(t)) return true;
  if (/^(keliam|keliame)\b/i.test(t)) return true;
  // Imperative + infinitive publish verbs — never fall through to photo re-ask loops.
  if (/\bpublikuok(?:ite|im)?\b|\bpublikuojam\b|\bpublikuoti\b|\bkeliam\b/i.test(t)) {
    return true;
  }
  if (/\bprepublish\b|\bpre-publish\b|\bpre\s*publish\b/i.test(t)) return true;
  if (/\bjudame\b.*\b(prepublish|publik|peržiūr)/i.test(t)) return true;
  if (/\bprie\s+(prepublish|publik|peržiūr)/i.test(t)) return true;
  if (/tiesiai\s+prie\s+(prepublish|publik|peržiūr)/i.test(t)) return true;
  if (/^(pakanka|užtenka|uztenka)\b/i.test(t)) return true;
  if (/^taip[,!]?\s*(publiku|tinka|judam|keliam)/i.test(t)) return true;
  // „Ne nereikia, publikuok“ / „daugiau nereikia“ — publish, not bare „nenoriu“.
  if (
    /be\s+daugiau|nebereikia|ne,?\s*nereikia|daugiau\s+nereikia|nereikia,?\s*publiku/i.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

export function isMorePhotosIntent(text: string): boolean {
  // „prisegti nuotraukas ir PrePublish“ → PrePublish wins (not photo nudge).
  if (isPublishReadyIntent(text)) return false;
  if (isAmendListingIntent(text)) return true;
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (/prisegti\s+nuotrauk/i.test(t)) return true;
  if (/įkelti\s+dar\s+nuotrauk/i.test(t)) return true;
  if (/įkelti\s+nuotrauk/i.test(t)) return true;
  if (/dar\s+nuotrauk/i.test(t)) return true;
  if (/noriu\s+dar/i.test(t)) return true;
  if (/papildom/i.test(t)) return true;
  if (/papildyti/i.test(t)) return true;
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
  // Explicit create / text-listing intents — never fall through to browse/search.
  if (
    /\b(tiesiog\s+)?noriu\s+(į|i)?kelti\s+skelb/i.test(t) ||
    /\b(tiesiog\s+)?noriu\s+(į|i)?dėti\s+skelb/i.test(t) ||
    /\b(į|i)kelti\s+skelbim/i.test(t) ||
    /\bieškau\s+darbo\b/i.test(t) ||
    /\bieskau\s+darbo\b/i.test(t) ||
    /\bsiūlau\s+(darb|paslaug)/i.test(t) ||
    /\bsiulau\s+(darb|paslaug)/i.test(t)
  ) {
    return true;
  }
  if (
    /\b(parduodu|parduoti|pardavim|noriu\s+parduot|norėčiau\s+parduot|noreciau\s+parduot|paskelbk|paskelbti)\b/i.test(
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
    return "Įkelkite nuotraukas per (+) arba parašykite kainą…";
  }
  if (state === "DRAFT_READY") {
    return "Parašykite ridą, TA, kainą ar kitą detalę…";
  }
  if (state === "AWAITING_CONFIRMATION") {
    return "Patikslinkite čia arba spauskite „Publikuoti“ kortelėje";
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

/**
 * Single warm chat sentence after draft synthesis.
 * Rich title/description belong only on listingDraft → PrePublish.
 * When facts are missing, invite the seller to continue the dialogue.
 */
export function buildDraftReadyChatReply(draft: {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
  category?: string;
  attributes?: Record<string, string | string[] | undefined>;
}): string {
  const title = draft.title?.trim();
  const ready = title
    ? (() => {
        const short =
          title.length > 72 ? `${title.slice(0, 69).trim()}…` : title;
        return `Paruošiau pilną „${short}“ skelbimo juodraštį!`;
      })()
    : "Paruošiau pilną skelbimo juodraštį!";

  const gaps = collectDraftFollowUpGaps(draft);
  if (gaps.length) {
    return `${ready} Jei turite, parašykite: ${gaps.join(", ")} — arba atidarykite PrePublish kortelę ir patikrinkite.`;
  }
  return `${ready} Galite patikrinti PrePublish kortelėje arba parašyti, ką norite pakeisti.`;
}

function collectDraftFollowUpGaps(draft: {
  price?: number;
  category?: string;
  attributes?: Record<string, string | string[] | undefined>;
}): string[] {
  const attrs = draft.attributes ?? {};
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const raw = attrs[key];
      const value = Array.isArray(raw)
        ? raw.map(String).join(", ")
        : String(raw ?? "");
      if (value.trim()) return value.trim();
    }
    return "";
  };
  const cat = String(draft.category ?? "").toLowerCase();
  const isVehicle =
    cat === "vehicles" ||
    cat === "transport" ||
    cat === "automobiliai" ||
    Boolean(pick("vin", "plate", "licensePlate", "make"));

  const gaps: string[] = [];
  if (!(Number(draft.price) > 0)) gaps.push("kainą");
  if (isVehicle) {
    if (!pick("mileage", "odometer", "rida")) gaps.push("ridą (km)");
    if (!pick("techInspection", "ta", "inspectionValidUntil", "taValidUntil")) {
      gaps.push("TA galiojimą");
    }
    if (!pick("transmission", "gearbox")) gaps.push("pavarų dėžę");
  }
  return gaps.slice(0, 3);
}

/**
 * When a draft-ready ack is concatenated with an older vision CTA, keep only
 * the draft-ready sentence. Never strip standalone warm OCR / guidance messages.
 */
export function stripStaleChatPromptTails(text: string): string {
  const t = String(text ?? "").trim();
  if (!t) return "";
  const hasReady = /Paruošiau pilną|Paruošiau juodraštį/i.test(t);
  if (!hasReady) return t;
  const ready =
    t.match(
      /Paruošiau pilną\s+[„"][^„"]+[“"]\s+skelbimo juodraštį![^.!\n]*[.!]?/i
    )?.[0] ||
    t.match(/Paruošiau pilną skelbimo juodraštį![^.!\n]*[.!]?/i)?.[0] ||
    t.match(/Paruošiau juodraštį[^.!\n]*[.!]/i)?.[0];
  if (ready && /Matau\b|Ar paruošti/i.test(t)) {
    return ready.trim();
  }
  return t;
}

/**
 * @deprecated Prefer buildDraftReadyChatReply — kept as alias for call sites.
 * Never returns the full listing description (chat ≠ draft synthesis).
 */
export function buildDraftingCompletePhotosPrompt(draft: {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
}): string {
  return buildDraftReadyChatReply(draft);
}

/** Alias for text-first complete draft chat bubble. */
export function buildTextDraftReadyMessage(draft: {
  title?: string;
  description?: string;
  price?: number;
  location?: string;
}): string {
  return buildDraftReadyChatReply(draft);
}

function attrPick(
  attrs: Record<string, string | string[] | undefined> | undefined,
  ...keys: string[]
): string {
  if (!attrs) return "";
  for (const key of keys) {
    const raw = attrs[key];
    const value = Array.isArray(raw) ? raw.map(String).join(", ") : String(raw ?? "");
    const t = value.trim();
    if (t) return t;
  }
  return "";
}

function formatEngineDisplacement(engineRaw: string): string {
  const t = engineRaw.trim();
  if (!t) return "";
  if (/\d[.,]\d/.test(t) && /l/i.test(t)) return t;
  const cm3 = t.match(/(\d{3,4})\s*(?:cm|cm³|cc)?/i);
  if (cm3) {
    const n = Number(cm3[1]);
    const liters = Math.round((n / 1000) * 10) / 10;
    return `${n} cm³ (${liters} L)`;
  }
  if (/^\d([.,]\d+)?$/.test(t)) return `${t.replace(",", ".")} L`;
  return t;
}

/**
 * Benchmark vehicle OCR report — structured Markdown for chat after Vision/docs.
 * Populates listing JSON behind the scenes separately; this is the chat UX only.
 */
function featureBulletLines(raw: string): string[] {
  return raw
    .split(/\n|•|;|\|/)
    .map((s) => s.replace(/^[-*•\s]+/, "").trim())
    .filter((s) => s.length >= 3)
    .map((s) => `- ${s}`);
}

export function buildVehicleSpecReportMarkdown(draft: {
  title?: string;
  description?: string;
  category?: string;
  attributes?: Record<string, string | string[] | undefined>;
}): string {
  const attrs = draft.attributes ?? {};
  const make = attrPick(attrs, "make", "brand");
  const model = attrPick(attrs, "model");
  const makeModel = [make, model].filter(Boolean).join(" ") || draft.title?.trim() || "—";
  const plate = attrPick(attrs, "plate", "licensePlate", "numberPlate");
  // Prefer full B-field date (YYYY-MM-DD); fall back to year only if that is all we have.
  const fullReg = attrPick(
    attrs,
    "firstRegistration",
    "registrationDate",
    "regDate",
    "firstRegDate"
  );
  const yearOnly = attrPick(attrs, "year");
  const regDate =
    fullReg && /\d{4}/.test(fullReg)
      ? fullReg
      : yearOnly || "—";
  const bodyType = attrPick(attrs, "bodyType", "body");
  const color = attrPick(attrs, "color", "colour");
  const bodyColor = [bodyType, color].filter(Boolean).join(", ") || "—";
  const vin = attrPick(attrs, "vin", "chassisNumber", "kebuloNumeris");
  const seats = attrPick(attrs, "seats", "seatCount", "vietos");
  const transmission = attrPick(attrs, "transmission", "gearbox");
  const engine = formatEngineDisplacement(attrPick(attrs, "engine", "engineSize", "displacement"));
  const fuel = attrPick(attrs, "fuelType", "fuel");
  const powerKw = attrPick(attrs, "powerKw", "power", "kw");
  const euro = attrPick(attrs, "euroStandard", "emissionStandard", "tarša", "euro");
  const co2 = attrPick(attrs, "co2", "co2Gkm", "co2_g_km");
  const emissions =
    [euro, co2 ? `${co2} g/km` : ""].filter(Boolean).join(", ") || "—";
  const maxSpeed = attrPick(attrs, "maxSpeed", "topSpeed", "maksimalusGreitis");
  const mass = attrPick(
    attrs,
    "curbWeight",
    "mass",
    "operatingMass",
    "maxMass",
    "technineMase",
    "leidziamaMase"
  );
  const speedMass =
    [maxSpeed ? `${maxSpeed} km/h` : "", mass].filter(Boolean).join(" · ") || "—";
  const interior = attrPick(
    attrs,
    "interiorCondition",
    "interior",
    "salon",
    "upholstery"
  );
  const exterior = attrPick(
    attrs,
    "exteriorFeatures",
    "exterior",
    "features",
    "equipment",
    "trim"
  );
  const interiorLines = featureBulletLines(interior);
  const exteriorLines = featureBulletLines(exterior);
  // Fallback: mine description for visual extras when structured fields are thin.
  const salonFallback: string[] = [];
  if (!interiorLines.length && !exteriorLines.length && draft.description?.trim()) {
    const d = draft.description.trim();
    if (d.length >= 24 && d.length <= 420) {
      salonFallback.push(`- ${d}`);
    }
  }

  const bullet = (label: string, value: string) =>
    `- **${label}:** ${value.trim() || "—"}`;

  const lines = [
    "**Pagrindiniai duomenys**",
    bullet("Markė ir modelis", makeModel),
    bullet("Valstybinis numeris", plate || "—"),
    bullet("Pirmosios registracijos data", regDate),
    bullet("Kėbulo tipas ir spalva", bodyColor),
    bullet("Kėbulo numeris (VIN)", vin || "—"),
    bullet("Sėdimų vietų skaičius", seats || "—"),
    bullet("Pavarų dėžė", transmission || "—"),
    "",
    "**Variklis ir techniniai parametrai**",
    bullet("Variklio darbinis tūris (cm³ ir L)", engine || "—"),
    bullet("Kuro tipas", fuel || "—"),
    bullet("Galia (kW)", powerKw ? `${powerKw.replace(/\s*kW$/i, "")} kW` : "—"),
    bullet("Taršos standartas ir CO2 (g/km)", emissions),
    bullet("Maksimalus greitis ir masės (eksploatacinė / leidžiama)", speedMass),
    "",
    "**Salonas (iš nuotraukų)**",
    ...(interiorLines.length
      ? interiorLines
      : salonFallback.length
        ? salonFallback
        : ["- (salono detalės — tik jei matosi nuotraukose; neišgalvok)"]),
    "",
    "**Išorė ir komplektacija (iš nuotraukų)**",
    ...(exteriorLines.length
      ? exteriorLines
      : (!interiorLines.length && salonFallback.length)
        ? []
        : ["- (išorės detalės — tik jei matosi nuotraukose; neišgalvok)"]),
    "",
    VEHICLE_SPEC_COPY_OFFER,
  ];

  const catalogNote = attrPick(draft.attributes, "catalogNote");
  const catalogAlt = attrPick(draft.attributes, "catalogAlternatives");
  const catalogLabel = attrPick(draft.attributes, "catalogModificationLabel");
  if (attrPick(draft.attributes, "specSource") === "catalog") {
    lines.splice(
      lines.length - 1,
      0,
      "**Katalogo pasiūlymas (be tech. paso)**",
      catalogLabel
        ? `- Siūloma modifikacija: ${catalogLabel}`
        : "- Bazinės specifikacijos pagal markę/modelį",
      catalogAlt ? `- Alternatyvos: ${catalogAlt}` : "",
      catalogNote ? `- ${catalogNote}` : "- Patikrinkite PrePublish lange prieš publikuojant.",
      ""
    );
  }

  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
}

/** Collect short human-readable OCR/vision facts for chat acknowledgment. */
function collectVisionFactHints(
  attrs: Record<string, string | string[] | undefined> | undefined
): string[] {
  const hints: string[] = [];
  const push = (label: string) => {
    const t = label.trim();
    if (t && !hints.includes(t) && hints.length < 5) hints.push(t);
  };
  const blob = [
    attrPick(attrs, "factNotes", "ocrText", "sceneContext", "specs"),
    attrPick(attrs, "exteriorFeatures", "interiorCondition", "contents"),
    attrPick(attrs, "Apšvietimas", "apšvietimas", "lighting", "features"),
    attrPick(attrs, "Jungtys", "jungtys", "ports", "connectors"),
    attrPick(attrs, "battery", "Baterija", "power", "Galingumas"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/rgb|spalvot|party\s*light|led|apšviet/.test(blob)) {
    push("RGB / spalvotą apšvietimą");
  }
  if (/jungt|bluetooth|usb|aux|hdmi|wi-?fi|nfc/.test(blob)) {
    push("jungtis");
  }
  if (/bater|akumuliator|veikimo\s*laik/.test(blob)) {
    push("bateriją");
  }
  if (/galing|watt|\bw\b|galia/.test(blob)) {
    push("galingumą");
  }
  const condition = attrPick(attrs, "condition", "Būklė", "bukle");
  if (condition) push(`būklę (${condition})`);
  const storage = attrPick(attrs, "storageCapacity", "memory", "Atmintis");
  if (storage) push(`atmintį (${storage})`);
  const engine = attrPick(attrs, "engine", "powerKw", "fuelType");
  if (engine) push("techninius parametrus");
  return hints;
}

/**
 * Warm Step-2 vision summary — OCR fact transparency + proactive guidance + CTA.
 * Full sales draft materializes after „Paruošti skelbimą“ (PrePublish only).
 */
export function buildPostVisionHeroMessage(draft: {
  title?: string;
  description?: string;
  price?: number;
  priceLabel?: string;
  location?: string;
  category?: string;
  attributes?: Record<string, string | string[] | undefined>;
}): string {
  const make = attrPick(draft.attributes, "make", "brand", "manufacturer");
  const model = attrPick(draft.attributes, "model", "deviceModel");
  const year = attrPick(draft.attributes, "year");
  const vehicleLabel = [make, model, year].filter(Boolean).join(" ");
  const title = draft.title?.trim() || "";
  const label = (vehicleLabel || title || "prekę").replace(/\s+/g, " ").trim();
  const short = label.length > 72 ? `${label.slice(0, 69)}…` : label;
  const category = String(draft.category ?? "").toLowerCase();
  const isVehicle =
    category === "vehicles" ||
    category === "transport" ||
    Boolean(attrPick(draft.attributes, "vin", "plate", "licensePlate"));
  const isTextOnlyCategory =
    category === "jobs" ||
    category === "services" ||
    category === "real_estate" ||
    category === "darbas" ||
    category === "paslaugos" ||
    category === "nt";
  const wantsPackagingTip =
    !isTextOnlyCategory &&
    (category === "electronics" ||
      category === "tools" ||
      category === "home" ||
      category === "clothing" ||
      category === "vehicles" ||
      category === "transport" ||
      Boolean(attrPick(draft.attributes, "vin", "plate", "licensePlate")));
  const facts = collectVisionFactHints(draft.attributes);
  const factAck = facts.length
    ? ` Nuotraukoje sėkmingai atpažinau modelį ir pagrindines specifikacijas (${facts.join(", ")}).`
    : " Nuotraukoje sėkmingai atpažinau modelį ir pagrindines specifikacijas.";

  const hasPrice =
    (draft.price != null && Number(draft.price) > 0) ||
    Boolean(String(draft.priceLabel ?? "").trim());
  const guidance: string[] = [];
  if (!hasPrice) {
    guidance.push(
      isVehicle
        ? "Kokią kainą norėtumėte matyti skelbime?"
        : isTextOnlyCategory
          ? "Kokia būtų kaina ar atlygis skelbime?"
          : "Kokia būtų šios prekės kaina?"
    );
  }
  if (isVehicle) {
    guidance.push(
      "Jei turite techninio paso ar kitų kampų nuotraukų — atsiųskite, papildysiu specifikacijas."
    );
  } else if (wantsPackagingTip) {
    guidance.push(
      "Jei turite, galite įkelti ir pakuotės, etiketės ar priedų nuotrauką — aprašymas bus dar tikslesnis!"
    );
  } else if (isTextOnlyCategory) {
    guidance.push(
      "Nuotraukos neprivalomos — galite publikuoti vien iš teksto."
    );
  }
  guidance.push("Ar paruošti skelbimo juodraštį patikrinimui?");

  return `Matau ${short}!${factAck} ${guidance.join(" ")}`.replace(/\s+/g, " ").trim();
}
