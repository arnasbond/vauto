const {
  DEFAULT_PRIMARY_VEHICLE,
  DEFAULT_USER_REGION,
  formatPrimaryVehicleLabel,
} = require("./zero-ui-defaults");

const AGENT_MEMORY_SYSTEM_HINT = `ATMINTIS IR KONTEKSTAS (PRIVALOMA):
- Numatytoji vartotojo lokacija: ${DEFAULT_USER_REGION}. Jei miestas neįvardytas — naudok ją postNewListing.city ir searchListings.city.
- Vartotojo automobilis (Fleet): ${formatPrimaryVehicleLabel(DEFAULT_PRIMARY_VEHICLE)}. Neaiškios dalys/paslaugos → query su Volvo V70 2006.
- SESIJOS TĘSTINUMAS: Refine'inus paiešką — sujunk activeSearchFilters su nauju filtru.
- PROAKTYVUS FILTRŲ IŠVALYMAS: Kardinaliai nauja paieška — nenaudok senų activeSearchFilters; klientas pažymėjo searchSessionReset=true.`;

function buildAgentMemoryContextBlock(memory) {
  if (!memory) return null;
  const lines = [];
  const region = memory.defaultRegion?.trim() || DEFAULT_USER_REGION;
  lines.push(`defaultRegion=${region}`);
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
