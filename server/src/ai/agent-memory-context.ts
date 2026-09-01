import {
  ALL_LITHUANIA_LABEL,
  formatPrimaryVehicleLabel,
  type PrimaryVehicle,
} from "./zero-ui-defaults.js";
import { CONTEXT_BLOCK_BUDGET } from "./context-budget.js";
import { clampJsonBlock } from "../shared/text-truncation.js";

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
  /** F1.3 — optional: absent for users without a saved vehicle (no fake fleet). */
  primaryVehicle?: PrimaryVehicle | null;
  activeSearchFilters?: AgentSearchFilters | null;
}

export const AGENT_MEMORY_SYSTEM_HINT = `ATMINTIS IR KONTEKSTAS (PRIVALOMA):
- Numatytoji paieškos aprėptis: ${ALL_LITHUANIA_LABEL}. Jei vartotojas neįvardina miesto — NEPERDUOK searchListings.city ir postNewListing.city; ieškok visoje Lietuvoje be lokacijos filtro.
- PAIEŠKOS IZOLIACIJA: searchListings.query GRIEŽTAI iš PASKUTINĖS vartotojo žinutės. NIEKADA nejunk nesusijusių temų („gitara“ + „automobilis“ → NE „gitaros ir automobilio“).
- SESIJOS TĘSTINUMAS: Refine TIK kai aiškiai tęsia TĄ PAČIĄ temą (pvz. „O dabar tik pilkos“). Kitaip — nauja paieška be senų filtrų.
- PROAKTYVUS FILTRŲ IŠVALYMAS: Kardinaliai nauja paieška / searchSessionReset=true — NENAUDOK senų activeSearchFilters; tik nauja užklausa + NLP filtrai (kaina, miestas).`;

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

  // F1.3 — no universal vehicle anchor: the fleet line exists ONLY for users
  // who explicitly saved a vehicle. No fake "Volvo V70" default for everyone.
  if (memory.primaryVehicle?.make && memory.primaryVehicle?.model) {
    const vehicle = memory.primaryVehicle;
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
  }

  if (memory.activeSearchFilters && Object.keys(memory.activeSearchFilters).length) {
    const filtersJson = clampJsonBlock(
      memory.activeSearchFilters,
      CONTEXT_BLOCK_BUDGET.searchFiltersJson
    );
    lines.push(
      `activeSearchFilters=${filtersJson} (naudok TIK refine'inant tą pačią temą; naujai temai IGNORUOK)`
    );
  }

  return lines.length ? `[Zero-UI atmintis: ${lines.join("; ")}]` : null;
}
