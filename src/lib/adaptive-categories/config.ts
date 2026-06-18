import type { AdaptiveCategoryConfig } from "./types";

export const ADAPTIVE_CATEGORIES: Record<
  AdaptiveCategoryConfig["key"],
  AdaptiveCategoryConfig
> = {
  vehicles: {
    key: "vehicles",
    label: "AUTOMOBILIŲ",
    portalStyle: "Autoplius",
    layout: "technical-grid",
    baseFields: ["title", "price", "location", "contact"],
    fields: [
      { key: "mileage", label: "Rida", placeholder: "185 000 km", critical: true, gridSpan: 1 },
      { key: "engine", label: "Variklis", placeholder: "1.6 TDI 77 kW", critical: true, gridSpan: 1 },
      {
        key: "fuelType",
        label: "Kuras",
        placeholder: "Dyzelinas",
        critical: true,
        inputType: "select",
        options: ["Benzinas", "Dyzelinas", "Elektra", "Hibridas", "LPG"],
        gridSpan: 1,
      },
      { key: "taExpiry", label: "TA galioja iki", placeholder: "2027-03", critical: true, gridSpan: 1 },
      { key: "defects", label: "Defektai", placeholder: "Nėra / smulkūs įbrėžimai", gridSpan: 2 },
      {
        key: "vin",
        label: "VIN kėbulo numeris",
        placeholder: "WVWZZZ1KZAW123456",
        critical: false,
        gridSpan: 2,
      },
    ],
  },
  clothing: {
    key: "clothing",
    label: "APRANGOS",
    portalStyle: "Vinted",
    layout: "tag-social",
    baseFields: ["title", "price", "location", "contact"],
    fields: [
      { key: "size", label: "Dydis", placeholder: "M / 38 / 42", critical: true },
      { key: "brand", label: "Prekės ženklas", placeholder: "Zara, Nike…", critical: true },
      {
        key: "condition",
        label: "Būklė",
        critical: true,
        inputType: "select",
        options: ["Nauja", "Gera", "Dėvėta"],
      },
      { key: "color", label: "Spalva", placeholder: "Juoda, mėlyna…", critical: true },
    ],
  },
  services: {
    key: "services",
    label: "PASLAUGŲ",
    portalStyle: "Paslaugos.lt",
    layout: "service-profile",
    baseFields: ["title", "price", "location", "contact", "description"],
    fields: [
      { key: "experience", label: "Patirtis", placeholder: "8 m. patirtis", critical: true },
      {
        key: "serviceList",
        label: "Darbų sąrašas",
        critical: true,
        inputType: "checklist",
        options: [
          "Montavimas",
          "Remontas",
          "Konsultacija",
          "Diagnostika",
          "Valymas",
          "Transportas",
        ],
      },
      {
        key: "invoicing",
        label: "Sąskaitos",
        inputType: "select",
        options: ["Taip, su PVM", "Taip, be PVM", "Ne"],
        critical: true,
      },
      {
        key: "workingRadius",
        label: "Atstumas kur vyksta",
        placeholder: "Panevėžys + 30 km",
        critical: true,
      },
    ],
  },
  jobs: {
    key: "jobs",
    label: "DARBO",
    portalStyle: "CVbankas",
    layout: "service-profile",
    baseFields: ["title", "price", "location", "contact", "description"],
    fields: [
      {
        key: "jobType",
        label: "Skelbimo tipas",
        critical: true,
        inputType: "select",
        options: ["Siūlau darbą", "Ieškau darbo"],
      },
      {
        key: "employmentType",
        label: "Darbo tipas",
        critical: true,
        inputType: "select",
        options: [
          "Pilnas etatas",
          "Puse etato",
          "Sezoninis",
          "Projektinis",
          "Nuotolinis",
        ],
      },
      {
        key: "salaryType",
        label: "Atlyginimas",
        inputType: "select",
        options: ["Valandinis", "Mėnesinis", "Sutartinis", "Derinamas"],
        critical: false,
      },
      {
        key: "schedule",
        label: "Darbo grafikas",
        placeholder: "Pvz. Pn–Pt 8–17",
        critical: false,
      },
      {
        key: "requirements",
        label: "Reikalavimai / įgūdžiai",
        inputType: "textarea",
        placeholder: "Patirtis, kalbos, pažymėjimai…",
        critical: false,
        gridSpan: 2,
      },
    ],
  },
  real_estate: {
    key: "real_estate",
    label: "NT",
    portalStyle: "Aruodas.lt",
    layout: "estate-sheet",
    baseFields: ["title", "price", "location", "contact", "description"],
    fields: [
      { key: "area", label: "Kvadratūra", placeholder: "62 kv.m.", critical: true, gridSpan: 1 },
      { key: "rooms", label: "Kambariai", placeholder: "3", critical: true, gridSpan: 1 },
      { key: "floor", label: "Aukštas", placeholder: "2 / 5", critical: true, gridSpan: 1 },
      {
        key: "heating",
        label: "Šildymas",
        inputType: "select",
        options: ["Centrinis", "Dujinis", "Elektra", "Krosnelė", "Geoterminis"],
        critical: true,
        gridSpan: 1,
      },
    ],
  },
  universal: {
    key: "universal",
    label: "BENDRAS",
    portalStyle: "Skelbiu.lt",
    layout: "universal",
    baseFields: ["title", "price", "location", "contact", "description"],
    fields: [],
  },
};

export function getAdaptiveConfig(key: AdaptiveCategoryConfig["key"]) {
  return ADAPTIVE_CATEGORIES[key];
}
