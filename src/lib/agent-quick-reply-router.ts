import type { PrePublishReadiness } from "@/lib/pre-publish-validation";
import type { SellerFlowStep } from "@/lib/types";
import {
  WARDROBE_IMPORT_HOW_IT_WORKS_REPLY,
  WARDROBE_BULK_PHOTO_PICK_HINT,
  requestWardrobeBulkPhotoPick,
  scrollToWardrobeBulkReview,
} from "@/lib/agent-wardrobe-bulk-dialogue";
import {
  isSellerPhotoMismatchAcceptChip,
  isSellerPhotoMismatchRevertChip,
} from "@/lib/seller-photo-category-mismatch";
import { notifyAgentFlow } from "@/lib/vauto-agent-client";
import type { WardrobeDraftItem } from "@/lib/wardrobe-vision";
import { wardrobeBulkToDrafts } from "@/lib/agent-wardrobe-bridge";
import type { AiExtractedListing, ListingCategory, UserProfile } from "@/lib/types";
import type { ZeroUiMicroPaymentIntent } from "@/lib/monetization-engine";

export interface AgentQuickReplyResult {
  handled: true;
  reply: string;
  quickReplies?: string[];
  prePublishCard?: import("@/lib/pre-publish-validation").PrePublishCardPayload;
}

export interface AgentBargainingOffer {
  listingId: string;
  listingTitle: string;
  listingPrice: number;
  suggestedOfferMin: number;
  suggestedOfferMax: number;
}

export interface AgentQuickReplyDeps {
  trimmed: string;
  user: UserProfile;
  searchQuery: string;
  aiDraft: AiExtractedListing | null;
  sellerStep: SellerFlowStep;
  pendingWardrobeBulkItems: WardrobeDraftItem[] | null;
  pendingWardrobeVoice: string | null;
  lastBargainingOffer: AgentBargainingOffer | null;
  publishListing: () => Promise<{
    ok: boolean;
    error?: string;
    sessionExpired?: boolean;
    prePublishBlocked?: boolean;
    listing?: import("@/lib/types").Listing;
  }>;
  /** Returns chat reply when user tries to publish from chat chips. */
  requestPublishUpsell: () => AgentQuickReplyResult;
  /** Returns chat reply + PrePublish card; never publishes from chat alone. */
  confirmPublishNow: () => AgentQuickReplyResult;
  /** Detailed guide when user taps „Suvesti trūkstamus duomenis“. */
  buildPrePublishMissingGuide: () => string;
  /** Current pre-publish readiness for guided contact chips. */
  getPrePublishReadiness: () => PrePublishReadiness | null;
  publishBulkClothingListings: (drafts: AiExtractedListing[]) => void;
  applyAgentWardrobeBulk: (
    items: WardrobeDraftItem[],
    options?: { voiceAnnouncement?: string }
  ) => void;
  activateWardrobeSpinta: () => void;
  routeZeroUiScreen: (screen: "business_dashboard") => void;
  openMicroPayment: (intent: ZeroUiMicroPaymentIntent) => void;
  resolveSmartBoostPrice: (user: UserProfile) => number;
  navigateToAdd: (fashion?: boolean) => void;
  applyAgentListingDraft: (draft: AiExtractedListing, imageUrl?: string) => void;
  routerPush: (path: string) => void;
  goToDiscover: () => void;
  broadenSearch: () => void;
  registerWantedFlow: (query: string) => void;
  openChats: () => void;
  openBargainingChat: () => boolean;
  openAuthModal: (redirectPath?: string) => void;
  searchSimilarListings: () => void;
  revertPhotoCategoryMismatch: () => boolean;
  acceptPhotoCategoryMismatch: () => void;
}

function normalizeChip(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[!?.,…]+$/g, "");
}

function matchesChip(text: string, patterns: RegExp[]): boolean {
  const n = normalizeChip(text);
  return patterns.some((re) => re.test(n));
}

function seedListingDraft(
  category: ListingCategory,
  user: UserProfile
): AiExtractedListing {
  return {
    category,
    title: "",
    description: "",
    price: 0,
    location: user.city?.trim() || "",
    contact: user.phone || "+370 612 34567",
    confidence: 0.5,
    attributes: {},
  };
}

/** Client-side quick-reply chips that should act immediately without another Gemini round-trip. */
export function tryHandleAgentQuickReply(
  deps: AgentQuickReplyDeps
): AgentQuickReplyResult | null {
  const { trimmed } = deps;
  if (!trimmed) return null;

  if (isSellerPhotoMismatchRevertChip(trimmed)) {
    if (deps.revertPhotoCategoryMismatch()) {
      return {
        handled: true,
        reply:
          "Gerai — atstatiau ankstesnį skelbimo juodraštį. Galite įkelti tinkamą automobilio nuotrauką.",
      };
    }
    return {
      handled: true,
      reply: "Šiuo metu neturiu ankstesnio juodraščio — tęskite pokalbį arba pradėkite iš naujo.",
    };
  }

  if (isSellerPhotoMismatchAcceptChip(trimmed)) {
    deps.acceptPhotoCategoryMismatch();
    return {
      handled: true,
      reply: "Supratau — paliekame naują kategoriją pagal įkeltą nuotrauką. Patikrinkite detales pokalbyje ir publikuokite.",
    };
  }

  if (
    matchesChip(trimmed, [/patvirtinti visus/]) &&
    deps.pendingWardrobeBulkItems &&
    deps.pendingWardrobeBulkItems.length > 1
  ) {
    const drafts = wardrobeBulkToDrafts(
      deps.pendingWardrobeBulkItems,
      deps.user.phone,
      deps.user.city?.trim() || ""
    );
    void deps.publishBulkClothingListings(drafts);
    return {
      handled: true,
      reply: `Puiku — publikuoju ${drafts.length} drabužių skelbimus!`,
    };
  }

  if (
    matchesChip(trimmed, [/peržiūrėti importą/, /perziureti importa/]) &&
    deps.pendingWardrobeBulkItems?.length
  ) {
    scrollToWardrobeBulkReview();
    return {
      handled: true,
      reply: "Slinkite žemyn — parodau importuotų prekių sąrašą peržiūrai.",
    };
  }

  if (matchesChip(trimmed, [/atidaryti spintą/, /atidaryti spinta/])) {
    deps.activateWardrobeSpinta();
    deps.routerPush("/fashion");
    return { handled: true, reply: "Atidarau VAUTO Spintą." };
  }

  if (
    matchesChip(trimmed, [/atidaryti verslo skydelį/, /verslo skydel/]) &&
    (deps.user.role === "pro" || deps.user.role === "admin")
  ) {
    deps.routeZeroUiScreen("business_dashboard");
    return { handled: true, reply: "Atidarau verslo skydelį." };
  }

  if (
    matchesChip(trimmed, [/peržiūrėti leadus/, /perziureti leadus/]) &&
    (deps.user.role === "pro" || deps.user.role === "admin")
  ) {
    deps.routeZeroUiScreen("business_dashboard");
    return { handled: true, reply: "Atidarau leadų dėžutę verslo skydelyje." };
  }

  if (matchesChip(trimmed, [/pakelti matomumą/, /pakelti matomuma/])) {
    const price = deps.resolveSmartBoostPrice(deps.user);
    deps.openMicroPayment({
      reason: "Smart Boost — iškelkite skelbimo matomumą",
      price,
      product: "smart_boost",
      voiceConfirmPhrase: "Taip, apmokėti",
    });
    return {
      handled: true,
      reply: `Atidarau Smart Boost (${price.toFixed(2)} €) — patvirtinkite mokėjimą.`,
    };
  }

  if (matchesChip(trimmed, [/viskas tinka/, /✅\s*viskas tinka/i])) {
    if (deps.aiDraft) {
      return deps.confirmPublishNow();
    }
    deps.navigateToAdd();
    return {
      handled: true,
      reply: "Atidarau skelbimo kūrimą — įkelkite nuotrauką arba aprašykite prekę.",
    };
  }

  if (matchesChip(trimmed, [/taip,?\s*publikuoti/, /publikuojam/])) {
    if (deps.aiDraft) {
      return deps.confirmPublishNow();
    }
    deps.navigateToAdd();
    return {
      handled: true,
      reply: "Atidarau skelbimo kūrimą — įkelkite nuotrauką arba aprašykite prekę.",
    };
  }

  if (
    matchesChip(trimmed, [
      /ne,?\s*be\s*reklamos/,
      /be\s*reklamos/,
      /nenoriu\s*reklamos/,
      /^ne,?\s*dar\s*pataisysiu/i,
    ])
  ) {
    return {
      handled: true,
      reply:
        "Supratau. Skelbimas bus patalpintas standartiniu režimu. Jei vėliau norėsite, kad AI dvynys derėtųsi už jus, funkciją bet kada galėsite aktyvuoti skiltyje „Mano skelbimai“. Skelbimą publikuojam?",
      quickReplies: ["Taip, publikuoti", "Ne, dar pataisysiu"],
    };
  }

  if (matchesChip(trimmed, [/iškelti į viršų/, /iskelti i virsu/, /\biškelti\b/])) {
    const price = deps.resolveSmartBoostPrice(deps.user);
    deps.openMicroPayment({
      reason: "Iškelti į viršų — daugiau matomumo",
      price,
      product: "smart_boost",
      voiceConfirmPhrase: "Taip, apmokėti",
    });
    return {
      handled: true,
      reply: `Atidarau iškėlimą (${price.toFixed(2)} €). Kai būsite pasiruošę — skelbimą publikuojam?`,
      quickReplies: ["Taip, publikuoti", "Ne, be reklamos"],
    };
  }

  if (matchesChip(trimmed, [/paryškinti/, /paryskinti/])) {
    const price = deps.resolveSmartBoostPrice(deps.user);
    deps.openMicroPayment({
      reason: "Paryškinti — daugiau matomumo",
      price,
      product: "smart_boost",
      voiceConfirmPhrase: "Taip, apmokėti",
    });
    return {
      handled: true,
      reply: `Atidarau paryškinimą (${price.toFixed(2)} €). Kai būsite pasiruošę — skelbimą publikuojam?`,
      quickReplies: ["Taip, publikuoti", "Ne, be reklamos"],
    };
  }

  if (
    matchesChip(trimmed, [
      /aktyvuoti\s+ai\s+derybinink/,
      /ai\s+derybinink/,
      /dvyn[iį]-?derybinink/,
      /deryb[ųu]\s+dvyn/,
      /twin\s+negoti/,
    ])
  ) {
    return {
      handled: true,
      reply:
        "Puiku — AI Dvynys–Derybininkas veiks 24/7. Parašykite minimalią kainą (pvz. „min 250 €“), ir aš jį aktyvuosiu skelbimui. Skelbimą publikuojam dabar, ar pirmiau nustatom ribas?",
      quickReplies: ["Taip, publikuoti", "Nustatyti min kainą", "Ne, be reklamos"],
    };
  }

  if (matchesChip(trimmed, [/užfiksuoti norą/, /uzfiksuoti nora/])) {
    const query = deps.searchQuery.trim() || trimmed;
    deps.registerWantedFlow(query);
    return {
      handled: true,
      reply: query
        ? `Užfiksuoju jūsų norą „${query}" — pranešiu, kai atsiras atitikmuo.`
        : "Užfiksuoju pageidavimą — pranešiu, kai atsiras tinkamas skelbimas.",
    };
  }

  if (matchesChip(trimmed, [/platesnė paieška/, /platesne paieska/])) {
    deps.broadenSearch();
    return {
      handled: true,
      reply: "Išplėčiau paieškos filtrus — peržiūrėkite atnaujintus rezultatus.",
    };
  }

  if (matchesChip(trimmed, [/parodyti populiariausius/])) {
    deps.goToDiscover();
    return { handled: true, reply: "Atidarau populiariausius skelbimus." };
  }

  if (matchesChip(trimmed, [/įkelti paslaugų skelbimą/, /ikelti paslaugu skelbima/])) {
    const draft = seedListingDraft("services", deps.user);
    deps.applyAgentListingDraft(draft);
    deps.navigateToAdd();
    return { handled: true, reply: "Atidarau paslaugų skelbimo formą." };
  }

  if (matchesChip(trimmed, [/įkelti skelbimą/, /ikelti skelbima/])) {
    deps.navigateToAdd();
    return { handled: true, reply: "Atidarau skelbimo kūrimą." };
  }

  if (
    matchesChip(trimmed, [/atsakyti klientui/]) &&
    (deps.user.role === "pro" || deps.user.role === "admin")
  ) {
    deps.openChats();
    return { handled: true, reply: "Atidarau pokalbius su klientais." };
  }

  if (matchesChip(trimmed, [/taip, derėtis/, /taip deretis/, /suderinti nuolaidą/, /suderinti nuolaida/])) {
    if (deps.lastBargainingOffer) {
      const opened = deps.openBargainingChat();
      if (opened) {
        const { listingTitle, suggestedOfferMin, suggestedOfferMax } = deps.lastBargainingOffer;
        return {
          handled: true,
          reply: `Atidarau pokalbį dėl „${listingTitle}" — siūlomas rėžis ${suggestedOfferMin}–${suggestedOfferMax} €.`,
        };
      }
    }
  }

  if (matchesChip(trimmed, [/ne, ačiū/, /ne aciu/])) {
    return {
      handled: true,
      reply: "Gerai — jei persigalvosite, parašykite bet kada.",
    };
  }

  if (matchesChip(trimmed, [/parodyti panašius/])) {
    deps.searchSimilarListings();
    return {
      handled: true,
      reply: "Ieškau panašių skelbimų pagal paskutinę paiešką.",
    };
  }

  if (matchesChip(trimmed, [/kaip veikia importas/])) {
    return { handled: true, reply: WARDROBE_IMPORT_HOW_IT_WORKS_REPLY };
  }

  if (
    matchesChip(trimmed, [
      /įkelti nuotraukų krepšelį/,
      /ikelti nuotrauku krepseli/,
      /įkelti nuotraukų/,
      /ikelti nuotrauku/,
      /įkelti nuotraukas/,
      /ikelti nuotraukas/,
    ])
  ) {
    requestWardrobeBulkPhotoPick();
    return { handled: true, reply: WARDROBE_BULK_PHOTO_PICK_HINT };
  }

  if (matchesChip(trimmed, [/taip, viskas tikslu/, /taip viskas tikslu/])) {
    if (deps.aiDraft && deps.sellerStep === "confirmation") {
      return deps.confirmPublishNow();
    }
  }

  if (matchesChip(trimmed, [/prisijungti iš naujo/, /prisijungti is naujo/])) {
    deps.openAuthModal("/");
    return {
      handled: true,
      reply: "Atidarau prisijungimo langą — prisijunkite ir bandykite publikuoti dar kartą.",
    };
  }

  if (matchesChip(trimmed, [/suvesti tr[uū]kstamus duomenis/])) {
    return {
      handled: true,
      reply: deps.buildPrePublishMissingGuide(),
    };
  }

  if (matchesChip(trimmed, [/dar pataisysiu/i, /✏️/])) {
    return {
      handled: true,
      reply: "Gerai — ką norėtumėte pataisyti? Parašykite pokalbyje arba pasirinkite.",
      quickReplies: ["Pataisyti kainą", "Pataisyti aprašymą", "✅ Viskas tinka"],
    };
  }

  if (matchesChip(trimmed, [/pataisyti kain/i])) {
    return {
      handled: true,
      reply: "Kokia turėtų būti kaina? Parašykite sumą eurais, pvz. 1200 €.",
      quickReplies: ["Viskas tinka", "Pataisyti aprašymą"],
    };
  }

  if (matchesChip(trimmed, [/pataisyti kategorij/i])) {
    return {
      handled: true,
      reply: "Kokia kategorija? Parašykite, pvz. Automobiliai, Būstas, Drabužiai.",
      quickReplies: ["Viskas tinka", "Pataisyti kainą"],
    };
  }

  if (matchesChip(trimmed, [/pataisyti aprašym/i, /pataisyti aprasym/i])) {
    return {
      handled: true,
      reply: "Parašykite naują aprašymą — pakeisiu esamą tekstą.",
      quickReplies: ["Viskas tinka", "Pataisyti kainą"],
    };
  }

  if (matchesChip(trimmed, [/reikia pataisyti/, /redaguoti duomenis/i])) {
    return {
      handled: true,
      reply: "Ką norite pataisyti? Pasirinkite arba parašykite pokalbyje.",
      quickReplies: ["Pataisyti kainą", "Pataisyti kategoriją", "Pataisyti aprašymą", "Viskas tinka"],
    };
  }

  if (matchesChip(trimmed, [/taip, tinka/, /taip tinka/])) {
    return {
      handled: true,
      reply: "Puiku — jei norėsite platesnės paieškos ar naujo skelbimo, pasakykite.",
    };
  }

  if (matchesChip(trimmed, [/platesnė paieška/, /platesne paieska/])) {
    deps.broadenSearch();
    return {
      handled: true,
      reply: "Išplėsiu paieškos filtrus — peržiūrėkite atnaujintus rezultatus.",
    };
  }

  if (matchesChip(trimmed, [/sukurti skelbimą/, /sukurti skelbima/])) {
    deps.navigateToAdd(deps.aiDraft?.category === "clothing");
    notifyAgentFlow({
      kind: "listing_wizard_opened",
      category: deps.aiDraft?.category,
    });
    return {
      handled: true,
      reply: "Atidarau skelbimo kūrimą — įkelkite nuotrauką arba aprašykite prekę.",
    };
  }

  if (matchesChip(trimmed, [/pildyti rankiniu būdu/, /pildyti rankiniu budu/])) {
    return {
      handled: true,
      reply:
        "Gerai — tęskime pokalbyje. Parašykite kainą, aprašymą ar kitą detalę čia, ir aš paruošiu skelbimą be formų.",
    };
  }

  if (matchesChip(trimmed, [/įkelti kitą nuotrauką/, /ikelti kita nuotrauka/])) {
    requestWardrobeBulkPhotoPick();
    return { handled: true, reply: WARDROBE_BULK_PHOTO_PICK_HINT };
  }

  if (matchesChip(trimmed, [/redaguoti po vieną/, /redaguoti po viena/])) {
    scrollToWardrobeBulkReview();
    return {
      handled: true,
      reply: "Pasirinkite drabužį iš sąrašo žemiau — galėsite koreguoti laukus prieš publikuojant.",
    };
  }

  if (matchesChip(trimmed, [/taip, tęsti/, /taip tęsti/, /taip, testi/, /taip testi/])) {
    if (deps.pendingWardrobeBulkItems && deps.pendingWardrobeBulkItems.length > 1) {
      const drafts = wardrobeBulkToDrafts(
        deps.pendingWardrobeBulkItems,
        deps.user.phone,
        deps.user.city?.trim() || ""
      );
      void deps.publishBulkClothingListings(drafts);
      return {
        handled: true,
        reply: `Puiku — publikuoju ${drafts.length} drabužių skelbimus!`,
      };
    }
    if (deps.aiDraft && deps.sellerStep === "confirmation") {
      return deps.confirmPublishNow();
    }
    if (deps.aiDraft) {
      deps.navigateToAdd(deps.aiDraft.category === "clothing");
      return {
        handled: true,
        reply: "Atidarau skelbimo peržiūrą — patvirtinkite publikavimą.",
      };
    }
  }

  if (matchesChip(trimmed, [/super, labai greita/])) {
    return {
      handled: true,
      reply: "Ačiū už atsiliepimą — džiaugiuosi, kad padėjau greitai! Jei prireiks, visada čia.",
    };
  }

  if (matchesChip(trimmed, [/buvo neaiškumų/, /buvo neaiskumu/])) {
    return {
      handled: true,
      reply:
        "Atsiprašau dėl neaiškumų — parašykite, kuriame žingsnyje užstrigo, ir iš karto patobulinsiu srautą.",
    };
  }

  if (matchesChip(trimmed, [/noriu įkelti dar/, /noriu ikelti dar/])) {
    const fashion = deps.aiDraft?.category === "clothing";
    deps.navigateToAdd(fashion);
    notifyAgentFlow({
      kind: "listing_wizard_opened",
      category: deps.aiDraft?.category ?? (fashion ? "clothing" : undefined),
    });
    return {
      handled: true,
      reply: fashion
        ? "Atidarau Spintos įkėlimą — galite mesti nuotraukų krepšelį arba profilio nuorodą."
        : "Atidarau skelbimo kūrimą — vedžiu jus per visus žingsnius.",
    };
  }

  return null;
}
