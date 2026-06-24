const {
  ALL_LITHUANIA_LABEL,
  DEFAULT_PRIMARY_VEHICLE,
  formatPrimaryVehicleLabel,
} = require("./zero-ui-defaults");

const AGENT_MEMORY_SYSTEM_HINT = `ATMINTIS IR KONTEKSTAS (PRIVALOMA):
- Numatytoji paieškos aprėptis: ${ALL_LITHUANIA_LABEL}. Jei vartotojas neįvardina miesto — NEPERDUOK searchListings.city ir postNewListing.city; ieškok visoje Lietuvoje.
- Vartotojo automobilis (Fleet): ${formatPrimaryVehicleLabel(DEFAULT_PRIMARY_VEHICLE)}. Neaiškios dalys/paslaugos → query su Volvo V70 2006.
- SESIJOS TĘSTINUMAS: Refine'inus paiešką — sujunk activeSearchFilters su nauju filtru.
- PROAKTYVUS FILTRŲ IŠVALYMAS: Kardinaliai nauja paieška — nenaudok senų activeSearchFilters; klientas pažymėjo searchSessionReset=true.`;

function buildAgentMemoryContextBlock(memory) {
  if (!memory) return null;
  const lines = [];
  const region = memory.defaultRegion?.trim();
  if (region) {
    lines.push(
      `defaultRegion=${region} (naudok city tik kai vartotojas įvardina miestą)`
    );
  } else {
    lines.push(
      `defaultRegion=${ALL_LITHUANIA_LABEL} (nepridėk city jei vartotojas neįvardino miesto)`
    );
  }
  const vehicle = memory.primaryVehicle ?? DEFAULT_PRIMARY_VEHICLE;
  lines.push(`primaryVehicle=${formatPrimaryVehicleLabel(vehicle)}`);
  if (memory.activeSearchFilters && Object.keys(memory.activeSearchFilters).length) {
    lines.push(
      `activeSearchFilters=${JSON.stringify(memory.activeSearchFilters)} (sujunk su naujais filtrais)`
    );
  }
  return lines.length ? `[Zero-UI atmintis: ${lines.join("; ")}]` : null;
}

module.exports = {
  AGENT_MEMORY_SYSTEM_HINT,
  buildAgentMemoryContextBlock,
};
