import { getAdaptiveConfig } from "./config";
import type { CategoryAttributes } from "@/lib/types";
import type { AdaptiveCategoryKey } from "./types";

const FIELD_PROMPTS: Record<string, string> = {
  mileage: "kokia rida (km)?",
  engine: "koks variklis (litražas, galia)?",
  fuelType: "koks kuro tipas?",
  taExpiry: "iki kada galioja techninė apžiūra?",
  defects: "ar yra defektų?",
  size: "koks dydis?",
  brand: "koks prekės ženklas?",
  condition: "kokia būklė (Nauja / Gera / Dėvėta)?",
  color: "kokios spalvos?",
  experience: "kiek metų patirties?",
  serviceList: "kokias paslaugas atliekate?",
  invoicing: "ar išrašote sąskaitas faktūras?",
  workingRadius: "kokiu atstumu vykdote darbus?",
  area: "kokia kvadratūra (kv.m.)?",
  rooms: "kiek kambarių?",
  floor: "kuris aukštas?",
  heating: "koks šildymas?",
  jobType: "ar siūlote darbą, ar ieškote?",
  employmentType: "koks darbo tipas (etatas, sezoninis…)?",
  description: "trumpas aprašymas?",
  price: "kokia kaina?",
};

function isEmpty(value: string | string[] | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return String(value).trim() === "";
}

export function getMissingCriticalFields(
  adaptiveKey: AdaptiveCategoryKey,
  attributes: CategoryAttributes = {},
  extras?: { price?: number; description?: string }
): string[] {
  const config = getAdaptiveConfig(adaptiveKey);
  const missing: string[] = [];

  if (extras?.price !== undefined && extras.price <= 0) missing.push("price");

  for (const field of config.fields) {
    if (!field.critical) continue;
    const val = attributes[field.key];
    if (isEmpty(val)) missing.push(field.key);
  }

  if (
    adaptiveKey === "universal" &&
    config.baseFields.includes("description") &&
    isEmpty(extras?.description)
  ) {
    missing.push("description");
  }

  return missing;
}

export function buildAssistantPrompt(
  adaptiveKey: AdaptiveCategoryKey,
  missingKeys: string[]
): string | null {
  if (missingKeys.length === 0) return null;

  const config = getAdaptiveConfig(adaptiveKey);
  const hints = missingKeys
    .slice(0, 3)
    .map((k) => FIELD_PROMPTS[k] ?? k)
    .join(", ");

  const intros: Record<AdaptiveCategoryKey, string> = {
    vehicles: "Automobilis — papildykite techninę informaciją:",
    clothing: "Drabužis — nurodykite dydį ir prekės ženklą:",
    services: "Paslauga — nurodykite patirtį ir darbų sąrašą:",
    jobs: "Darbo skelbimas — nurodykite tipą ir sąlygas:",
    real_estate: "Nekilnojamasis turtas — nurodykite kvadratūrą ir kambarių skaičių:",
    universal: "Užpildykite trūkstamus laukus:",
  };

  return `${intros[adaptiveKey]} ${hints}`;
}
