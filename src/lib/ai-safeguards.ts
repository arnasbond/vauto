import type { AiExtractedListing, ListingCategory } from "@/lib/types";
import type { SellerInputMode } from "@/lib/types";
import { AI_TIMEOUT_POLICY } from "@/lib/ai-timeout-policy";

/** Global ceiling for AI extraction — prevents UI freeze on slow/hung responses */
export const AI_PROCESSING_TIMEOUT_MS = AI_TIMEOUT_POLICY.processingMs;

/** Client fetch budget for AI proxy calls (slightly under processing ceiling) */
export const AI_FETCH_TIMEOUT_MS = AI_TIMEOUT_POLICY.fetchMs;

/** Vision / large payload calls (Render cold start + Gemini) */
export const AI_VISION_FETCH_TIMEOUT_MS = AI_TIMEOUT_POLICY.visionFetchMs;

/** Barcode / open-data product lookup — fail fast on mobile */
export const BARCODE_LOOKUP_TIMEOUT_MS = AI_TIMEOUT_POLICY.barcodeLookupMs;

export const SCAN_NOT_RECOGNIZED_MSG =
  "Kodas arba daiktas neatpažintas. Įveskite informaciją patys, o aš padėsiu sugeneruoti aprašymą!";

/** Soft handoff when external DB lookup times out — never blocks the AI flow */
export const AI_SCAN_SOFT_HANDOFF_MSG =
  "Išorinės bazės tyli — tęsiu su nuotraukos analize. Parašykite, ką matote, arba patikslinkite detales pokalbyje.";

export const MANUAL_FALLBACK_TOAST =
  "Automatinis atpažinimas šį kartą nepavyko — tęskime pokalbyje, o aš padėsiu su aprašymu.";

/** Proactive agent question when barcode registry miss or vision fallback */
export const UNREGISTERED_PRODUCT_AGENT_PROMPT =
  "Sistemoje daikto kodo nerandu, bet matau jūsų nuotrauką. Ką norite daryti toliau – ieškoti panašių skelbimų ar sukurti naują skelbimą su AI aprašymu?";

/** Shorter budget for local mock extraction only */
export const AI_MOCK_TIMEOUT_MS = AI_TIMEOUT_POLICY.mockMs;

/** Marktplaats-style vision failure — shown before manual category/brand fields */
export const VISION_RECOGNITION_FAILED_MESSAGE =
  "Nuotrauka ne visai aiški — galite pabandyti kitą kadrą arba aprašykite prekę pokalbyje.";

export const PROCESSING_MILESTONES = [
  { atMs: 0, label: "Apdorojamas audio įrašas..." },
  { atMs: 400, label: "Struktūrizuojami skelbimo duomenys..." },
  { atMs: 900, label: "Tikrinama lokacija ir saugumo ženkliukai..." },
] as const;

/** Text-only seller input — no voice/location copy (S0) */
export const TEXT_PROCESSING_MILESTONES = [
  { atMs: 0, label: "Analizuoju jūsų aprašymą..." },
  { atMs: 500, label: "Nustatoma kategorija ir laukai..." },
  { atMs: 1200, label: "Ruošiamas skelbimo juodraštis..." },
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
  ms: number = AI_PROCESSING_TIMEOUT_MS,
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

/**
 * Minimal accept gate — never reject Vision drafts for placeholder titles,
 * low confidence, or category heuristics. Null/empty payload only.
 */
export function isValidAiExtracted(
  data: AiExtractedListing | null | undefined
): boolean {
  if (!data) return false;
  const title = data.title?.trim() ?? "";
  const description = data.description?.trim() ?? "";
  const hasAttrs =
    data.attributes &&
    Object.values(data.attributes).some((v) => String(v ?? "").trim().length > 0);
  // Accept any non-empty Gemini payload so the unified pipeline is never blocked.
  return title.length > 0 || description.length > 0 || Boolean(hasAttrs);
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
  transport: { min: 50, max: 500_000, label: "transporto" },
  real_estate: { min: 5_000, max: 10_000_000, label: "nekilnojamojo turto" },
  electronics: { min: 1, max: 50_000, label: "elektronikos" },
  services: { min: 1, max: 10_000, label: "paslaugų" },
  jobs: { min: 300, max: 100_000, label: "darbo" },
  home: { min: 1, max: 100_000, label: "buitinių prekių" },
  clothing: { min: 1, max: 5_000, label: "drabužių" },
  tools: { min: 1, max: 50_000, label: "įrankių" },
  rental: { min: 1, max: 50_000, label: "nuomos" },
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
  if (mode === "upload" || mode === "combined") return PROCESSING_MILESTONE_UPLOAD;
  if (mode === "text") return TEXT_PROCESSING_MILESTONES;
  return PROCESSING_MILESTONES;
}
