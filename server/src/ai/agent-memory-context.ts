import {
  DEFAULT_PRIMARY_VEHICLE,
  DEFAULT_USER_REGION,
  formatPrimaryVehicleLabel,
  type PrimaryVehicle,
} from "./zero-ui-defaults.js";

export interface AgentSearchFilters {
  query?: string;
  category?: string;
  city?: string;
  maxPrice?: number;
  minPrice?: number;
  refinements?: string[];
}

export interface AgentMemoryPayload {
  defaultRegion?: string;
  primaryVehicle?: PrimaryVehicle;
  activeSearchFilters?: AgentSearchFilters | null;
}

export const AGENT_MEMORY_SYSTEM_HINT = `ATMINTIS IR KONTEKSTAS (PRIVALOMA):
- Numatytoji vartotojo lokacija: ${DEFAULT_USER_REGION}. Jei miestas neįvardytas balsu ar tekste — naudok ją postNewListing.city ir searchListings.city (location: "${DEFAULT_USER_REGION}").
- Vartotojo automobilis (Fleet): ${formatPrimaryVehicleLabel(DEFAULT_PRIMARY_VEHICLE)}. Jei užklausa neaiški (pvz. „rask priekinį bamperį“, „kiek kainuoja generatoriaus keitimas?“) — searchListings.query ir category filtruok TIK šiam modeliui; query turi apimti make, model, year.
- SESIJOS TĘSTINUMAS: Jei vartotojas refine'ina ankstesnę paiešką (pvz. „O dabar rodyk tik pilkos spalvos“), SULIET activeSearchFilters su nauju filtru — nepradėk paieškos iš naujo be senų kriterijų (miestas, kaina, kategorija, query).
- PROAKTYVUS FILTRŲ IŠVALYMAS: Jei vartotojas pateikia kardinaliai naują paiešką (kitas miestas, kita markė, „nauji BMW nuo 2018“ ir pan.) — NENAUDOK senų activeSearchFilters; searchListings turi naudoti tik naują užklausą. Klientas jau pažymėjo searchSessionReset=true.`;

export function buildAgentMemoryContextBlock(
  memory: AgentMemoryPayload | undefined
): string | null {
  if (!memory) return null;

  const lines: string[] = [];

  const region = memory.defaultRegion?.trim() || DEFAULT_USER_REGION;
  lines.push(
    `defaultRegion=${region} (naudok postNewListing/searchListings kai lokacija neįvardyta)`
  );

  const vehicle = memory.primaryVehicle ?? DEFAULT_PRIMARY_VEHICLE;
  lines.push(
    `primaryVehicle=${formatPrimaryVehicleLabel(vehicle)} (neaiškios dalys/paslaugos → query su ${vehicle.make} ${vehicle.model} ${vehicle.year})`
  );

  if (memory.activeSearchFilters && Object.keys(memory.activeSearchFilters).length) {
    lines.push(
      `activeSearchFilters=${JSON.stringify(memory.activeSearchFilters)} (PRIVALOMA sujungti su naujais filtrais tęsiant paiešką)`
    );
  }

  return lines.length ? `[Zero-UI atmintis: ${lines.join("; ")}]` : null;
}
