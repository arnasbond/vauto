import type { FacetableListing } from "./facet-query";

/** Deterministic 13B result-correctness fixtures (not production catalog). */
export const FACET_RESULT_FIXTURES: readonly FacetableListing[] = [
  {
    id: "nt-a",
    category: "real_estate",
    title: "Butas A",
    location: "Vilnius",
    price: 120000,
    createdAt: "2026-01-01T00:00:00.000Z",
    attributes: { rooms: 2, area: 48, propertyType: "Butas", location: "Vilnius" },
  },
  {
    id: "nt-b",
    category: "real_estate",
    title: "Butas B",
    location: "Vilnius",
    price: 150000,
    createdAt: "2026-02-01T00:00:00.000Z",
    attributes: { rooms: 3, area: 70, propertyType: "Butas", location: "Vilnius" },
  },
  {
    id: "nt-c",
    category: "real_estate",
    title: "Butas C",
    location: "Kaunas",
    price: 99000,
    createdAt: "2026-03-01T00:00:00.000Z",
    attributes: { rooms: 2, area: 40, propertyType: "Butas", location: "Kaunas" },
  },
  {
    id: "el-used",
    category: "electronics",
    title: "MacBook naudotas",
    price: 900,
    createdAt: "2026-04-01T00:00:00.000Z",
    attributes: { condition: "Naudotas", manufacturer: "Apple", deviceModel: "M3" },
  },
  {
    id: "el-new",
    category: "electronics",
    title: "MacBook naujas",
    price: 1900,
    createdAt: "2026-05-01T00:00:00.000Z",
    attributes: { condition: "Naujas", manufacturer: "Apple", deviceModel: "M3" },
  },
  {
    id: "tr-low",
    category: "transport",
    title: "Golf maža rida",
    price: 8000,
    createdAt: "2026-06-01T00:00:00.000Z",
    attributes: { make: "VW", mileage: 90000, fuelType: "Dyzelinas", year: 2016 },
  },
  {
    id: "tr-high",
    category: "transport",
    title: "Passat didelė rida",
    price: 5000,
    createdAt: "2026-07-01T00:00:00.000Z",
    attributes: { make: "VW", mileage: 180000, fuelType: "Benzinas", year: 2012 },
  },
  {
    id: "job-a",
    category: "jobs",
    title: "Vairuotojas",
    price: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
    attributes: {
      jobTitle: "Vairuotojas",
      employmentType: "Pilnas etatas",
      salaryMin: 1400,
      salaryMax: 1800,
      location: "Vilnius",
    },
  },
];

/** Isolated 13B.1 numeric-cast fixtures — not mixed into Test G result sets. */
export const FACET_NUMERIC_CAST_FIXTURES: readonly FacetableListing[] = [
  {
    id: "tr-malformed",
    category: "transport",
    title: "Sugadinta rida",
    price: 3000,
    createdAt: "2026-08-02T00:00:00.000Z",
    attributes: { make: "Opel", mileage: "unknown", fuelType: "Benzinas", year: 2010 },
  },
  {
    id: "tr-numeric-ok",
    category: "transport",
    title: "Rida skaičius",
    price: 4500,
    createdAt: "2026-08-03T00:00:00.000Z",
    attributes: { make: "Opel", mileage: "85000", fuelType: "Benzinas", year: 2014 },
  },
];
