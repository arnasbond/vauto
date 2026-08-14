/**
 * Zero-result relaxations (manual suggestions only — never auto-widen filters).
 */

import type { SearchQuery, SearchRelaxation } from "./search-schema.js";

export function suggestRelaxations(query: SearchQuery): SearchRelaxation[] {
  const out: SearchRelaxation[] = [];
  if (query.priceMax != null) {
    out.push({
      field: "priceMax",
      action: "widen",
      label: `Padidinti max kainą (dabar ${query.priceMax} €)`,
    });
  }
  if (query.priceMin != null) {
    out.push({
      field: "priceMin",
      action: "remove",
      label: "Pašalinti min kainos filtrą",
    });
  }
  if (query.yearMin != null || query.yearMax != null) {
    out.push({
      field: "yearMin",
      action: "widen",
      label: "Atlaisvinti metų intervalą",
    });
  }
  if (query.radiusKm != null) {
    out.push({
      field: "radiusKm",
      action: "widen",
      label: `Padidinti spindulį (dabar ${query.radiusKm} km)`,
    });
  }
  if (query.model) {
    out.push({
      field: "model",
      action: "remove",
      label: `Pašalinti modelio filtrą (${query.model})`,
    });
  }
  if (query.brand) {
    out.push({
      field: "brand",
      action: "remove",
      label: `Pašalinti markės filtrą (${query.brand})`,
    });
  }
  if (query.location) {
    out.push({
      field: "location",
      action: "remove",
      label: `Pašalinti vietos filtrą (${query.location})`,
    });
  }
  if (query.transmission) {
    out.push({
      field: "transmission",
      action: "remove",
      label: "Pašalinti greičių dėžės filtrą",
    });
  }
  if (query.fuel) {
    out.push({
      field: "fuel",
      action: "remove",
      label: "Pašalinti kuro filtrą",
    });
  }
  if (!out.length && query.keywords) {
    out.push({
      field: "keywords",
      action: "widen",
      label: "Supaprastinti raktažodžius",
    });
  }
  return out.slice(0, 6);
}
