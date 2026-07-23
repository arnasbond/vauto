import type { AdaptiveCategoryKey } from "./types";
import { getFieldLabel } from "@/lib/listing-field-validation";

export {
  getMissingCriticalFields,
  getMissingCriticalFieldsForListing,
  evaluateListingPublishValidation,
  buildPublishBlockMessage,
  isFieldMissing,
  isCriticalFieldRequired,
  resolveFieldValue,
  getVehicleStepMissingKeys,
  getRealEstateStepMissingKeys,
  getFieldLabel,
} from "@/lib/listing-field-validation";

const FIELD_PROMPTS: Record<string, string> = {
  mileage: "kokia rida (km)?",
  engine: "koks variklis (litražas, galia)?",
  fuelType: "koks kuro tipas?",
  taExpiry: "iki kada galioja techninė apžiūra?",
  defects: "ar yra defektų?",
  size: "koks dydis?",
  brand: "koks prekės ženklas?",
  condition: "kokia būklė (Nauja / Gera / Dėvėta)?",
  furnishing: "koks įrengimas?",
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
  propertyType: "koks objekto tipas?",
  transactionType: "koks sandorio tipas?",
};

export function buildAssistantPrompt(
  adaptiveKey: AdaptiveCategoryKey,
  missingKeys: string[]
): string | null {
  if (missingKeys.length === 0) return null;

  const hints = missingKeys
    .slice(0, 3)
    .map((k) => FIELD_PROMPTS[k] ?? getFieldLabel(adaptiveKey, k))
    .join(", ");

  const intros: Record<AdaptiveCategoryKey, string> = {
    vehicles: "Automobilis — papildykite techninę informaciją:",
    transport: "Transportas — papildykite tipą ir būklę:",
    clothing: "Drabužis — nurodykite dydį ir prekės ženklą:",
    services: "Paslauga — nurodykite patirtį ir darbų sąrašą:",
    jobs: "Darbo skelbimas — nurodykite tipą ir sąlygas:",
    real_estate: "Nekilnojamasis turtas — nurodykite kvadratūrą ir kambarių skaičių:",
    electronics: "Elektronika — nurodykite gamintoją, modelį ir būklę:",
    home: "Namai / buitis — nurodykite tipą ir būklę:",
    tools: "Įrankiai — nurodykite tipą ir maitinimą:",
    rental: "Nuoma — nurodykite periodą ir užstatą:",
    universal: "Užpildykite trūkstamus laukus:",
  };

  return `${intros[adaptiveKey]} ${hints}`;
}
