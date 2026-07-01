import {
  getMissingCriticalFieldsForListing,
  listingToAdaptiveKey,
} from "@/lib/adaptive-categories";
import { isPlaceholderCity, resolveListingCity } from "@/lib/city-resolve";
import type { AiExtractedListing } from "@/lib/types";
import type { PriceAdvice } from "@/lib/price-advisor";
import { CONVERSATIONAL_SKIP_QUICK_REPLY } from "@/lib/conversational-skip";

export type WizardPromptKind =
  | "missing_city"
  | "missing_price"
  | "missing_condition"
  | "account_type"
  | "auth_signup"
  | "enter_vin"
  | "ready_to_publish";

export interface WizardQuickReply {
  id: string;
  label: string;
  patch?: Partial<AiExtractedListing>;
  attributePatch?: Record<string, string>;
}

export interface WizardAnalysis {
  intro: string;
  questions: string[];
  quickReplies: WizardQuickReply[];
  prompts: WizardPromptKind[];
  missingFields: string[];
  marketHint?: string;
}

export function analyzeListingWizard(
  draft: AiExtractedListing,
  opts: {
    userCity?: string;
    isAuthenticated?: boolean;
    priceAdvice?: PriceAdvice | null;
    userPrompt?: string | null;
  } = {}
): WizardAnalysis {
  const adaptiveKey = listingToAdaptiveKey(draft.category);
  const userCity = resolveListingCity(opts.userCity, "Vilnius");
  const missingKeys = getMissingCriticalFieldsForListing(draft.category, draft.attributes ?? {}, {
    price: draft.price,
    description: draft.description,
  });

  const missingFields: string[] = [];
  const questions: string[] = [];
  const quickReplies: WizardQuickReply[] = [];
  const prompts: WizardPromptKind[] = [];

  const offerSkip = () => {
    if (!quickReplies.some((r) => r.id === CONVERSATIONAL_SKIP_QUICK_REPLY.id)) {
      quickReplies.push({ ...CONVERSATIONAL_SKIP_QUICK_REPLY });
    }
  };

  if (isPlaceholderCity(draft.location) || !draft.location?.trim()) {
    prompts.push("missing_city");
    questions.push(`Matau, kad nenurodėte miesto. Ar skelbiame ${userCity}?`);
    quickReplies.push(
      { id: "city-yes", label: `Taip, ${userCity}`, patch: { location: userCity } },
      { id: "city-vilnius", label: "Vilnius", patch: { location: "Vilnius" } },
      { id: "city-kaunas", label: "Kaunas", patch: { location: "Kaunas" } }
    );
    offerSkip();
  }

  if (draft.price <= 0 || missingKeys.includes("price")) {
    prompts.push("missing_price");
    if (opts.priceAdvice?.medianPrice) {
      questions.push(
        `Jei žinote kainą — rinkoje panašūs skelbimai ~${opts.priceAdvice.medianPrice} €. Kokią norite nurodyti? (galite praleisti)`
      );
    } else {
      questions.push("Kokios kainos tikitės? Galite praleisti ir nurodyti vėliau.");
    }
    offerSkip();
  }

  const condition = String(draft.attributes?.condition ?? "").trim();
  if (
    (adaptiveKey === "clothing" || adaptiveKey === "universal") &&
    !condition
  ) {
    prompts.push("missing_condition");
    questions.push('Ar prekė nauja, ar naudota? (galite atsakyti „nežinau")');
    quickReplies.push(
      { id: "cond-new", label: "Nauja", attributePatch: { condition: "Nauja" } },
      { id: "cond-good", label: "Labai gera", attributePatch: { condition: "Labai gera" } },
      { id: "cond-used", label: "Naudota", attributePatch: { condition: "Naudota" } }
    );
    offerSkip();
  }

  if (adaptiveKey === "vehicles") {
    const vin = String(draft.attributes?.vin ?? "").trim();
    if (!vin) {
      prompts.push("enter_vin");
      questions.push(
        "Ar norėtumėte įvesti VIN kodą, kad Regitra duomenys užsipildytų automatiškai?"
      );
      quickReplies.push(
        { id: "vin-yes", label: "Įvesti VIN", attributePatch: {} },
        { id: "vin-skip", label: "Vėliau", attributePatch: {} }
      );
    }
  }

  const sellerType = String(draft.attributes?.sellerType ?? "").trim();
  if (!sellerType) {
    prompts.push("account_type");
    questions.push("Ar keliate skelbimą kaip privatus asmuo, ar kaip įmonė? (galite praleisti)");
    quickReplies.push(
      {
        id: "seller-private",
        label: "Privatus asmuo",
        attributePatch: { sellerType: "Privatus asmuo" },
      },
      {
        id: "seller-business",
        label: "Įmonė / verslas",
        attributePatch: { sellerType: "Įmonė / verslas" },
      }
    );
    offerSkip();
  }

  if (!opts.isAuthenticated) {
    prompts.push("auth_signup");
    questions.push(
      "Sukurkime nemokamą paskyrą vienu spustelėjimu — galėsite sekti peržiūras ir žinutes."
    );
    quickReplies.push({ id: "auth-signup", label: "Sukurti paskyrą" });
  }

  const title = draft.title?.trim() || "skelbimas";
  const desc = draft.description?.trim();
  let intro = desc
    ? `Paruošiau profesionalų aprašymą „${title}". Kategorija: ${draft.category}.`
    : `Atpažinau „${title}" (${draft.category}).`;

  if (opts.priceAdvice?.medianPrice && draft.price > 0) {
    intro += ` Rinkos kaina ~${opts.priceAdvice.medianPrice} €.`;
  } else if (opts.priceAdvice?.medianPrice) {
    intro += ` Rinkoje panašūs skelbimai ~${opts.priceAdvice.medianPrice} €.`;
  }

  if (opts.userPrompt?.trim() && !/analizuoju/i.test(opts.userPrompt)) {
    intro += ` Jūsų užklausa: „${opts.userPrompt.trim().slice(0, 120)}".`;
  }

  if (missingFields.length === 0 && opts.isAuthenticated) {
    prompts.push("ready_to_publish");
    intro += " Galite publikuoti bet kada — likę laukai neprivalomi.";
  } else if (questions.length === 0) {
    intro += " Galite publikuoti bet kada — paklausiu tik jei norėsite patikslinti.";
  }

  return {
    intro,
    questions,
    quickReplies,
    prompts,
    missingFields,
    marketHint: opts.priceAdvice?.medianPrice
      ? `~${opts.priceAdvice.medianPrice} €`
      : undefined,
  };
}

export function buildWizardAgentContext(
  draft: AiExtractedListing,
  analysis: WizardAnalysis,
  opts: {
    isAuthenticated: boolean;
    userCity?: string;
    searchResultCount?: number;
    lastSearchQuery?: string;
  }
) {
  return {
    wizardMode: "listing_review" as const,
    listingDraft: {
      title: draft.title,
      description: draft.description,
      price: draft.price,
      location: draft.location,
      category: draft.category,
      attributes: Object.fromEntries(
        Object.entries(draft.attributes ?? {}).map(([k, v]) => [
          k,
          Array.isArray(v) ? v.join(", ") : String(v ?? ""),
        ])
      ),
    },
    missingFields: analysis.missingFields,
    wizardPrompts: analysis.prompts,
    isAuthenticated: opts.isAuthenticated,
    searchResultCount: opts.searchResultCount,
    lastSearchQuery: opts.lastSearchQuery,
    userCity: resolveListingCity(opts.userCity, "Vilnius"),
  };
}
