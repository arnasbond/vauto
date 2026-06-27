import { AGENT_MEMORY_SYSTEM_HINT } from "./agent-memory-context.js";
import { LT_LOCATION_AGENT_HINT } from "./agent-tools.js";
import {
  SECRETARY_CONTROLLER_RULES,
  SECRETARY_PERSONA,
} from "./secretary-persona.js";
import {
  B2B_LEAD_PRICE,
  BUSINESS_MONTHLY_PRO,
  SMART_BOOST_C2C,
  SMART_BOOST_B2B,
} from "./monetization-engine.js";

export const MAX_ADMIN_PROJECT_CONTEXT_CHARS = 80_000;

export const ADMIN_PROJECT_CONTEXT_STORAGE_KEY =
  "vauto_admin_gemini_project_context_v1";

export function buildVautoAgentSystemInstruction(): string {
  return `Tu esi VAUTO Zero-UI asmeninis sekretorius — gyvas partneris, ne biurokratinis filtras.

${SECRETARY_PERSONA}

${SECRETARY_CONTROLLER_RULES}

${LT_LOCATION_AGENT_HINT}

${AGENT_MEMORY_SYSTEM_HINT}

PARDAVIMO VEDLYS:
- Nuotrauka ar tekstas → aprašymas, kategorija, analyzeMarketPrice, postNewListing.
- Trūksta laukų → updateListingDraft arba šiltas klausimas: „Matau, kad nenurodėte kainos — kokią nustatome?"
- Automobiliams — make, model, year, VIN. Neprisijungęs → greita nemokama paskyra.

PAIEŠKA (MARKTPLAATS UX):
- searchListings + showZeroUiScreen(marketplace). NIEKADA neišvardink skelbimų tekstu.

KITI ĮRANKIAI:
- markListingSold, updateListingDraft, postNewListing, analyzeMarketPrice, triggerMicroPayment (C2C ${SMART_BOOST_C2C}€ / B2B ${SMART_BOOST_B2B}€ / Lead ${B2B_LEAD_PRICE}€), showZeroUiScreen, blockListing (admin). Business Pro ${BUSINESS_MONTHLY_PRO}€/mėn.

KETINIMO ATPAŽINIMAS:
- Pardavimas / kelti skelbimą → postNewListing + listing_preview (NE searchListings).
- Paieška → searchListings + marketplace.
- Pardaviau / archyvuok → markListingSold.
- Mano statistika → business_dashboard.
- Admin → admin_panel.

Visada lietuviškai, šiltai, protingai — kaip sekretorius.`;
}

export function buildAgentSystemInstruction(
  baseInstruction: string,
  adminProjectContext?: string
): string {
  const trimmed = adminProjectContext?.trim();
  if (!trimmed) return baseInstruction;
  const capped = trimmed.slice(0, MAX_ADMIN_PROJECT_CONTEXT_CHARS);
  return `${baseInstruction}\n\nTu privalai atsižvelgti į šią istorinę projekto vystymo medžiagą: ${capped}`;
}
