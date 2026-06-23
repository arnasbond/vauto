import type { AiExtractedListing, ListingCategory } from "@/lib/types";
import type { SellerInputMode } from "@/lib/types";

/** Global ceiling for AI extraction — prevents UI freeze on slow/hung responses */
export const AI_PROCESSING_TIMEOUT_MS = 12000;

/** Client fetch budget for AI proxy calls (slightly under processing ceiling) */
export const AI_FETCH_TIMEOUT_MS = 11_000;

/** Shorter budget for local mock extraction only */
export const AI_MOCK_TIMEOUT_MS = 5000;

export const MANUAL_FALLBACK_TOAST =
  "Atsiprašau, nepavyko automatiškai suprasti įrašo. Užpildykime trumpą formą rankiniu būdu.";

export const ENTERPRISE_TONE_RULES =
  "Būk profesionalus, glaustas ir orientuotas į faktus. Nenaudok emoji. Venk žargono ir perteklinių emocijų. Sutelk dėmesį į skelbimo būseną ir reikalingus veiksmus.";

export const PROCESSING_MILESTONES = [
  { atMs: 0, label: "Apdorojamas audio įrašas..." },
  { atMs: 400, label: "Struktūrizuojami skelbimo duomenys..." },
  { atMs: 900, label: "Tikrinama lokacija ir saugumo ženkliukai..." },
] as const;

export const PROCESSING_MILESTONE_UPLOAD = [
  { atMs: 0, label: "Apdorojama nuotrauka..." },
  { atMs: 400, label: "Struktūrizuojami skelbimo duomenys..." },
  { atMs: 900, label: "Tikrinama lokacija ir saugumo ženkliukai..." },
] as const;

export class AiSafeguardError extends Error {
  constructor(
    public readonly code: "timeout" | "invalid" | "empty",
    message: string
  ) {
    super(message);
    this.name = "AiSafeguardError";
  }
}

type SafeguardLogEvent =
  | "processing_start"
  | "processing_success"
  | "processing_milestone"
  | "processing_timeout"
  | "processing_invalid"
  | "fallback_triggered"
  | "price_sanity_warning"
  | "price_sanity_confirmed"
  | "price_sanity_cancelled";

export function logAiSafeguard(
  event: SafeguardLogEvent,
  payload: Record<string, unknown> = {}
): void {
  if (process.env.NODE_ENV === "production") return;
  const stamp = new Date().toISOString();
  console.debug(`[VAUTO AI Safeguard] ${event}`, { stamp, ...payload });
}

export function withAiTimeout<T>(
  promise: Promise<T>,
  ms = AI_PROCESSING_TIMEOUT_MS,
  label = "ai_extract"
): Promise<T> {
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const elapsedMs = Math.round(performance.now() - started);
      logAiSafeguard("processing_timeout", { label, elapsedMs, limitMs: ms });
      reject(new AiSafeguardError("timeout", `${label} exceeded ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function isValidAiExtracted(
  data: AiExtractedListing | null | undefined
): boolean {
  if (!data) return false;

  const title = data.title?.trim() ?? "";
  if (title.length < 2) return false;

  const genericPlaceholders = ["skelbimas", "naujas skelbimas", "be pavadinimo"];
  if (
    genericPlaceholders.includes(title.toLowerCase()) &&
    (data.confidence ?? 0) <= 0.1
  ) {
    return false;
  }

  const validCategories: ListingCategory[] = [
    "electronics",
    "vehicles",
    "services",
    "jobs",
    "home",
    "clothing",
    "real_estate",
    "other",
  ];
  if (!validCategories.includes(data.category)) return false;

  return true;
}

export function createManualFallbackDraft(opts: {
  location: string;
  contact: string;
}): AiExtractedListing {
  return {
    title: "",
    price: 0,
    location: opts.location,
    contact: opts.contact,
    category: "other",
    confidence: 0,
    description: "",
    attributes: {},
  };
}

const PRICE_BOUNDS: Record<
  ListingCategory,
  { min: number; max: number; label: string }
> = {
  vehicles: { min: 200, max: 500_000, label: "automobilių" },
  real_estate: { min: 5_000, max: 10_000_000, label: "nekilnojamojo turto" },
  electronics: { min: 1, max: 50_000, label: "elektronikos" },
  services: { min: 1, max: 10_000, label: "paslaugų" },
  jobs: { min: 300, max: 100_000, label: "darbo" },
  home: { min: 1, max: 100_000, label: "buitinių prekių" },
  clothing: { min: 1, max: 5_000, label: "drabužių" },
  other: { min: 1, max: 100_000, label: "bendrų" },
};

export function evaluatePriceSanity(
  category: ListingCategory,
  price: number
): { suspicious: boolean; reason?: string } {
  if (price <= 0) {
    return { suspicious: true, reason: "Kaina nenurodyta arba lygi nuliui." };
  }

  const bounds = PRICE_BOUNDS[category] ?? PRICE_BOUNDS.other;
  if (price < bounds.min) {
    return {
      suspicious: true,
      reason: `Kaina ${price}€ yra neįprastai žema ${bounds.label} kategorijai (tikėtina nuo ${bounds.min}€).`,
    };
  }
  if (price > bounds.max) {
    return {
      suspicious: true,
      reason: `Kaina ${price}€ viršija įprastą ${bounds.label} kategorijos intervalą.`,
    };
  }

  return { suspicious: false };
}

export function formatPriceForConfirm(
  price: number,
  priceLabel?: string
): string {
  if (priceLabel?.trim()) return priceLabel.trim();
  return `${price}€`;
}

export function getProcessingMilestones(mode: SellerInputMode | null) {
  return mode === "upload" || mode === "combined"
    ? PROCESSING_MILESTONE_UPLOAD
    : PROCESSING_MILESTONES;
}
