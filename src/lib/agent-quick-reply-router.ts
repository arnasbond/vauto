import type { SellerFlowStep } from "@/lib/types";
import type { WardrobeDraftItem } from "@/lib/wardrobe-vision";
import { wardrobeBulkToDrafts } from "@/lib/agent-wardrobe-bridge";
import type { AiExtractedListing, ListingCategory, UserProfile } from "@/lib/types";
import type { ZeroUiMicroPaymentIntent } from "@/lib/monetization-engine";

export interface AgentQuickReplyResult {
  handled: true;
  reply: string;
}

export interface AgentQuickReplyDeps {
  trimmed: string;
  user: UserProfile;
  searchQuery: string;
  aiDraft: AiExtractedListing | null;
  sellerStep: SellerFlowStep;
  pendingWardrobeBulkItems: WardrobeDraftItem[] | null;
  pendingWardrobeVoice: string | null;
  publishListing: () => void;
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
}

function normalizeChip(text: string): string {
  return text.trim().toLowerCase();
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
    location: user.city || "Vilnius",
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

  if (
    matchesChip(trimmed, [/patvirtinti visus/]) &&
    deps.pendingWardrobeBulkItems &&
    deps.pendingWardrobeBulkItems.length > 1
  ) {
    const drafts = wardrobeBulkToDrafts(
      deps.pendingWardrobeBulkItems,
      deps.user.phone,
      deps.user.city || "Vilnius"
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
    deps.applyAgentWardrobeBulk(deps.pendingWardrobeBulkItems, {
      voiceAnnouncement: deps.pendingWardrobeVoice ?? undefined,
    });
    return {
      handled: true,
      reply: "Atidarau importuotų prekių peržiūrą — patvirtinkite skelbimus.",
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

  if (matchesChip(trimmed, [/viskas tinka/])) {
    if (deps.aiDraft && deps.sellerStep === "confirmation") {
      deps.publishListing();
      return { handled: true, reply: "Puiku — publikuoju skelbimą!" };
    }
    if (deps.aiDraft) {
      deps.navigateToAdd(deps.aiDraft.category === "clothing");
      return {
        handled: true,
        reply: "Atidarau skelbimo peržiūrą — patvirtinkite publikavimą.",
      };
    }
    deps.navigateToAdd();
    return {
      handled: true,
      reply: "Atidarau skelbimo kūrimą — įkelkite nuotrauką arba aprašykite prekę.",
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

  return null;
}
