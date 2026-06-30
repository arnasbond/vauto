/**
 * Global VAUTO agent flow orchestrator (P7 foundation).
 * Unifies continuous wizard dialogue, photo intelligence, B2B nudges, and emotional finish
 * across all verticals — not only wardrobe/spinta.
 */
import type { ListingCategory } from "@/lib/types";
import { listingToAdaptiveKey } from "@/lib/adaptive-categories";

export type AgentFlowKind =
  | "listing_wizard_opened"
  | "listing_media_analyzed"
  | "photo_search_applied"
  | "business_dashboard_nudge"
  | "listing_publish_success"
  | "flow_completed";

export interface AgentFlowEvent {
  kind: AgentFlowKind;
  category?: ListingCategory;
  /** Recognized object label from vision (e.g. „BMW 320d“, „MacBook Pro“). */
  objectLabel?: string;
  /** Items detected (wardrobe bulk, multi-draft). */
  itemCount?: number;
  photoCount?: number;
  publishedCount?: number;
  /** Search results count after photo search. */
  resultCount?: number;
  /** Business dashboard context */
  region?: string;
  viewsLow?: boolean;
  buyerIntentCount?: number;
  firstName?: string;
}

export interface AgentFlowDialogue {
  message: string;
  quickReplies?: string[];
  openSheet?: boolean;
}

export const UNIVERSAL_FEEDBACK_QUESTION =
  "Ar patiko mano pagalba ir bendravimas šiame procese?";

export const UNIVERSAL_FEEDBACK_CHIPS = [
  "Super, labai greita!",
  "Buvo neaiškumų",
  "Noriu įkelti dar",
] as const;

export const FLOW_PHOTO_PICK_EVENT = "vauto:flow-photo-pick";
export const FLOW_REVIEW_SCROLL_EVENT = "vauto:flow-review-scroll";

/** @deprecated use FLOW_PHOTO_PICK_EVENT */
export const WARDROBE_BULK_PHOTO_PICK_EVENT = FLOW_PHOTO_PICK_EVENT;
/** @deprecated use FLOW_REVIEW_SCROLL_EVENT */
export const WARDROBE_BULK_REVIEW_EVENT = FLOW_REVIEW_SCROLL_EVENT;

const CATEGORY_LABEL: Record<string, string> = {
  vehicles: "automobilio",
  real_estate: "nekilnojamojo turto",
  services: "paslaugų",
  clothing: "drabužių",
  jobs: "darbo",
  other: "skelbimo",
};

export function categoryFlowLabel(category?: ListingCategory): string {
  if (!category) return "skelbimo";
  const key = listingToAdaptiveKey(category);
  return CATEGORY_LABEL[key] ?? "skelbimo";
}

export function buildListingWizardOpenedMessage(category?: ListingCategory): string {
  const label = categoryFlowLabel(category);
  if (category === "clothing") {
    return "Puiku, mes jau tavo spintoje! Neminkyk formos rankiniu būdu — tiesiog įkelk visas drabužių nuotraukas iškart, o aš fone pradėsiu pildyti laukus.";
  }
  if (category === "vehicles") {
    return "Puiku, atidarėme automobilio skelbimą! Įkelkite nuotraukas arba įveskite VIN — aš fone užpildysiu techninius laukus. Jūs tik patvirtinkite.";
  }
  if (category === "real_estate") {
    return "Puiku, pradedame NT skelbimą! Įkelkite objekto nuotraukas — aš padėsiu užpildyti plotą, kambarius ir kitus laukus. Peržiūrėkite ir patvirtinkite.";
  }
  if (category === "services") {
    return "Puiku, kuriate paslaugų skelbimą! Aprašykite ką siūlote — aš padėsiu suformuluoti ir užpildysiu laukus. Kartu sutvarkysime iki publikavimo.";
  }
  return `Puiku, pradedame ${label} formą! Įkelkite nuotraukas arba užpildykite laukus — aš vedliuosiu kiekviename žingsnyje ir patarsiu realiu laiku.`;
}

export function listingWizardOpenedChips(category?: ListingCategory): string[] {
  if (category === "clothing") {
    return ["Įkelti nuotraukų krepšelį", "Kaip veikia importas?", "Pildyti rankiniu būdu"];
  }
  return ["Įkelti nuotraukas", "Kaip užpildyti laukus?", "Publikuoti vėliau"];
}

export function buildListingMediaAnalyzedMessage(
  objectLabel: string,
  category?: ListingCategory
): string {
  const label = categoryFlowLabel(category);
  const subject = objectLabel.trim() || "objektą";
  return `Matau nuotraukoje: ${subject}. Automatiškai pritaikiau ${label} laukus — peržiūrėkite formą žemiau ir patvirtinkite, ar viskas tikslu.`;
}

export function listingMediaAnalyzedChips(): string[] {
  return ["Taip, viskas tikslu", "Reikia pataisyti", "Įkelti kitą nuotrauką"];
}

export function buildPhotoSearchAppliedMessage(
  objectLabel: string,
  resultCount: number
): string {
  const subject = objectLabel.trim() || "objektą";
  if (resultCount <= 0) {
    return `Matau nuotraukoje ${subject} — tikslaus atitikmens neradau. Galiu padėti sukurti skelbimą arba išplėsti paiešką.`;
  }
  if (resultCount === 1) {
    return `Matau nuotraukoje ${subject} — radau 1 atitikmenį ir pritaikiau filtrus. Ar rezultatas tinkamas?`;
  }
  return `Matau nuotraukoje ${subject} — radau ${resultCount} atitikmenų ir automatiškai pritaikiau filtrus. Peržiūrėkite rezultatus žemiau.`;
}

export function photoSearchAppliedChips(resultCount: number): string[] {
  if (resultCount <= 0) {
    return ["Sukurti skelbimą", "Platesnė paieška", "Kita nuotrauka"];
  }
  return ["Taip, tinka", "Platesnė paieška", "Sukurti skelbimą"];
}

export function buildBusinessDashboardNudgeMessage(opts: {
  region?: string;
  viewsLow?: boolean;
  buyerIntentCount?: number;
  firstName?: string;
}): string {
  const name = opts.firstName?.trim() || "drauge";
  if (opts.buyerIntentCount && opts.buyerIntentCount > 0) {
    return `${name}, rinkoje ${opts.buyerIntentCount} pirkėjų ieško panašių prekių — geras laikas išryškinti skelbimus!`;
  }
  const region = opts.region?.trim() || "tavo regione";
  if (opts.viewsLow) {
    return `${name}, matau, kad paslaugos ${region} sulaukė mažiau peržiūrų. Rekomenduoju patikslinti aprašymą arba panaudoti Smart Boost.`;
  }
  return `${name}, atidarau verslo skydelį — peržiūrėkite statistiką ir leadus, padėsiu optimizuoti matomumą.`;
}

export function businessDashboardChips(): string[] {
  return ["Pakelti matomumą", "Peržiūrėti leadus", "Verslo apžvalga"];
}

export function buildPublishSuccessMessage(
  category: ListingCategory | undefined,
  publishedCount: number
): string {
  const label = categoryFlowLabel(category);
  if (publishedCount <= 1) {
    if (category === "clothing") {
      return "Valio! Tavo drabužis sėkmingai patalpintas ir jau laukia pirkėjų.";
    }
    return `Valio! Jūsų ${label} skelbimas sėkmingai patalpintas ir jau matomas rinkoje.`;
  }
  if (category === "clothing") {
    return `Valio! Visi ${publishedCount} drabužiai sėkmingai patalpinti ir jau laukia pirkėjų.`;
  }
  return `Valio! Sėkmingai publikuota ${publishedCount} skelbimų — jie jau matomi rinkoje.`;
}

export function buildFlowCompletedMessage(contextLabel: string): string {
  return `${contextLabel} ${UNIVERSAL_FEEDBACK_QUESTION}`;
}

export function buildWardrobePhotosReceivedMessage(
  itemCount: number,
  photoCount = 1
): string {
  if (itemCount <= 0) {
    return "Nuotraukas gavau — analizuoju. Jei matysiu drabužius, paruošiu juodraščius.";
  }
  if (photoCount > 1) {
    return `Matau ${itemCount} tavo drabužius iš ${photoCount} nuotraukų! Užfiksavau dydžius ir spalvas — juodraščiai paruošti. Pažvelk į formą žemiau.`;
  }
  if (itemCount === 1) {
    return "Nuotrauką gavau, matau vieną drabuį — ruošiu skelbimo juodraštį. Ar tęsiame?";
  }
  return `Nuotraukas gavau, matau ${itemCount} drabužius — pradedu ruošti skelbimų juodraščius. Ar tęsiame?`;
}

export function wardrobePhotosReceivedChips(itemCount: number): string[] {
  if (itemCount > 1) {
    return ["Taip, tęsti", "Redaguoti po vieną", "Įkelti kitą nuotrauką"];
  }
  return ["Taip, tęsti", "Pildyti rankiniu būdu", "Įkelti kitą nuotrauką"];
}

export function buildWardrobeProfileImportedMessage(itemCount: number): string {
  if (itemCount <= 0) return "Profilį gavau — ruošiu juodraščius peržiūrai.";
  if (itemCount === 1) {
    return "Profilį gavau, matau vieną prekę — paruošiau juodraštį peržiūrai. Ar tęsiame?";
  }
  return `Profilį gavau, matau ${itemCount} prekių — paruošiau juodraščius peržiūrai žemiau. Ar tęsiame?`;
}

export function wardrobeProfileImportedChips(itemCount: number): string[] {
  if (itemCount > 1) {
    return ["Taip, tęsti", "Peržiūrėti importą", "Redaguoti po vieną"];
  }
  return ["Taip, tęsti", "Pildyti rankiniu būdu", "Kaip veikia importas?"];
}

/** Resolve a flow event into assistant dialogue (message + chips). */
export function resolveAgentFlowDialogue(event: AgentFlowEvent): AgentFlowDialogue | null {
  switch (event.kind) {
    case "listing_wizard_opened":
      return {
        message: buildListingWizardOpenedMessage(event.category),
        quickReplies: listingWizardOpenedChips(event.category),
        openSheet: true,
      };
    case "listing_media_analyzed":
      return {
        message: buildListingMediaAnalyzedMessage(event.objectLabel ?? "", event.category),
        quickReplies: listingMediaAnalyzedChips(),
        openSheet: true,
      };
    case "photo_search_applied":
      return {
        message: buildPhotoSearchAppliedMessage(
          event.objectLabel ?? "",
          event.resultCount ?? 0
        ),
        quickReplies: photoSearchAppliedChips(event.resultCount ?? 0),
        openSheet: true,
      };
    case "business_dashboard_nudge":
      return {
        message: buildBusinessDashboardNudgeMessage({
          region: event.region,
          viewsLow: event.viewsLow,
          buyerIntentCount: event.buyerIntentCount,
          firstName: event.firstName,
        }),
        quickReplies: businessDashboardChips(),
        openSheet: true,
      };
    case "listing_publish_success": {
      const success = buildPublishSuccessMessage(
        event.category,
        event.publishedCount ?? 1
      );
      return {
        message: buildFlowCompletedMessage(success),
        quickReplies: [...UNIVERSAL_FEEDBACK_CHIPS],
        openSheet: true,
      };
    }
    case "flow_completed":
      return {
        message: buildFlowCompletedMessage(event.objectLabel ?? "Puiku!"),
        quickReplies: [...UNIVERSAL_FEEDBACK_CHIPS],
        openSheet: true,
      };
    default:
      return null;
  }
}

export function requestFlowPhotoPick(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FLOW_PHOTO_PICK_EVENT));
}

export function scrollToFlowReview(targetId = "wardrobe-bulk-review"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FLOW_REVIEW_SCROLL_EVENT));
  document.getElementById(targetId)?.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
}

// --- Wardrobe-specific aliases (backward compat) ---
export const WARDROBE_CONTINUOUS_FLOW_GREETING = buildListingWizardOpenedMessage("clothing");
export const WARDROBE_BULK_IMPORT_GREETING = WARDROBE_CONTINUOUS_FLOW_GREETING;
export const WARDROBE_BULK_IMPORT_CHIPS = listingWizardOpenedChips("clothing");
export const WARDROBE_IMPORT_HOW_IT_WORKS_REPLY =
  "Importas veikia taip: 1) įklijuokite Vinted ar kitos spintos profilio nuorodą viršuje — AI paruoš skelbimus automatiškai; 2) arba įkelkite nuotraukas į krepšelį — Smart Wardrobe Vision atpažins kiekvieną drabužį; 3) peržiūrėkite juodraščius ir patvirtinkite vienu paspaudimu.";
export const WARDROBE_BULK_MANUAL_FILL_REPLY =
  "Gerai — užpildykite laukus žemiau ranka arba pasirinkite vieną drabuį iš AI sąrašo, jei jis jau paruoštas.";
export const WARDROBE_BULK_PHOTO_PICK_HINT =
  "Atidarykite nuotraukų krepšelį žemiau — vilkite failus arba paspauskite „Įkelti nuotraukų“.";
export const WARDROBE_PUBLISH_FEEDBACK_QUESTION = UNIVERSAL_FEEDBACK_QUESTION;
export const WARDROBE_PUBLISH_FEEDBACK_CHIPS = UNIVERSAL_FEEDBACK_CHIPS;

export function requestWardrobeBulkPhotoPick(): void {
  requestFlowPhotoPick();
}

export function scrollToWardrobeBulkReview(): void {
  scrollToFlowReview();
}

export function buildWardrobePublishSuccessMessage(publishedCount: number): string {
  return buildPublishSuccessMessage("clothing", publishedCount);
}
