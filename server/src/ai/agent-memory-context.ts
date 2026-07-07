import {
  ALL_LITHUANIA_LABEL,
  DEFAULT_PRIMARY_VEHICLE,
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
- Numatytoji paieškos aprėptis: ${ALL_LITHUANIA_LABEL}. Jei vartotojas neįvardina miesto — NEPERDUOK searchListings.city ir postNewListing.city; ieškok visoje Lietuvoje be lokacijos filtro.
- Vartotojo automobilis (Fleet): ${formatPrimaryVehicleLabel(DEFAULT_PRIMARY_VEHICLE)}. Jei užklausa neaiški BE markės/modelio (pvz. „rask priekinį bamperį“) — searchListings.query turi apimti make, model, year; NEPRIDĖK sintetinio „dalys“ priedo. Jei vartotojas jau įvardino markę ir modelį — naudok TIK jo žodžius.
- SESIJOS TĘSTINUMAS: Jei vartotojas refine'ina ankstesnę paiešką (pvz. „O dabar rodyk tik pilkos spalvos“), SULIET activeSearchFilters su nauju filtru — nepradėk paieškos iš naujo be senų kriterijų (miestas, kaina, kategorija, query).
- PROAKTYVUS FILTRŲ IŠVALYMAS: Jei vartotojas pateikia kardinaliai naują paiešką (kitas miestas, kita markė, „nauji BMW nuo 2018“ ir pan.) — NENAUDOK senų activeSearchFilters; searchListings turi naudoti tik naują užklausą. Klientas jau pažymėjo searchSessionReset=true.`;

export function buildAgentMemoryContextBlock(
  memory: AgentMemoryPayload | undefined,
  lastUserText?: string
): string | null {
  if (!memory) return null;

  const lines: string[] = [];

  const region = memory.defaultRegion?.trim();
  if (region) {
    lines.push(
      `defaultRegion=${region} (naudok searchListings.city / postNewListing.city tik kai vartotojas įvardina šį miestą)`
    );
  } else {
    lines.push(
      `defaultRegion=${ALL_LITHUANIA_LABEL} (nepridėk city parametro jei vartotojas neįvardino miesto)`
    );
  }

  const vehicle = memory.primaryVehicle ?? DEFAULT_PRIMARY_VEHICLE;
  const userNamedVehicle =
    Boolean(lastUserText?.trim()) &&
    new RegExp(`\\b${vehicle.make}\\b`, "i").test(lastUserText!) &&
    new RegExp(`\\b${vehicle.model}\\b`, "i").test(lastUserText!);

  if (userNamedVehicle) {
    lines.push(
      `primaryVehicle=${formatPrimaryVehicleLabel(vehicle)} (vartotojas jau įvardino markę/modelį — naudok TIK jo žodžius; NEPRIDĖK „dalys“ ar kito sintetinio priedo)`
    );
  } else {
    lines.push(
      `primaryVehicle=${formatPrimaryVehicleLabel(vehicle)} (tik neaiškios dalys/paslaugos be markės → query su ${vehicle.make} ${vehicle.model}; NEPRIDĖK „dalys“)`
    );
  }

  if (memory.activeSearchFilters && Object.keys(memory.activeSearchFilters).length) {
    lines.push(
      `activeSearchFilters=${JSON.stringify(memory.activeSearchFilters)} (PRIVALOMA sujungti su naujais filtrais tęsiant paiešką)`
    );
  }

  return lines.length ? `[Zero-UI atmintis: ${lines.join("; ")}]` : null;
}
