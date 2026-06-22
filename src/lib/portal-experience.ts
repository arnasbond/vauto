import type { ChameleonThemeId } from "@/lib/chameleon-themes";

export interface PortalExperience {
  theme: ChameleonThemeId;
  portalName: string;
  headline: string;
  description: string;
  primaryCta: string;
  color: string;
  bg: string;
  border: string;
  quickFilters: string[];
}

const EXPERIENCES: Record<ChameleonThemeId, PortalExperience> = {
  flux: {
    theme: "flux",
    portalName: "VAUTO",
    headline: "Visi portalai vienoje paieškoje",
    description:
      "Vienas srautas daiktams, automobiliams, NT, drabužiams ir paslaugoms.",
    primaryCta: "Pradėti paiešką",
    color: "#1167b1",
    bg: "#ffffff",
    border: "#dde5ef",
    quickFilters: ["Foto paieška", "Skelbiu kainos", "Saugus pirkimas"],
  },
  autoplius: {
    theme: "autoplius",
    portalName: "Autoplius tipo auto zona",
    headline: "Auto skelbimo režimas",
    description:
      "Techniniai laukai, VIN / numerio autofill, TA ir rinkos kainos signalai.",
    primaryCta: "Ieškoti auto",
    color: "#1a56db",
    bg: "#e8f0fe",
    border: "#c5d9f7",
    quickFilters: ["VIN", "Ratlankiai", "TA galioja"],
  },
  vinted: {
    theme: "vinted",
    portalName: "Vinted tipo spinta",
    headline: "Drabužių ir aksesuarų režimas",
    description:
      "Lengvas stilius, dydžiai, būklė, brand’ai ir greitas foto įkėlimas.",
    primaryCta: "Atidaryti spintą",
    color: "#09b1a8",
    bg: "#e6f7f6",
    border: "#b8ebe8",
    quickFilters: ["Dydis", "Būklė", "Brand"],
  },
  skelbiu: {
    theme: "skelbiu",
    portalName: "Skelbiu tipo universalus turgus",
    headline: "Universalūs skelbimai",
    description:
      "Baldai, telefonai, buitis ir kitos prekės su Skelbiu.lt kainų signalu.",
    primaryCta: "Naršyti skelbimus",
    color: "#1565c0",
    bg: "#e3f2fd",
    border: "#90caf9",
    quickFilters: ["Telefonai", "Baldai", "Buitis"],
  },
  aruodas: {
    theme: "aruodas",
    portalName: "Aruodas tipo NT zona",
    headline: "Nekilnojamo turto režimas",
    description:
      "Plotas, kambariai, aukštas, šildymas ir miestų NT paieška viename sraute.",
    primaryCta: "Ieškoti NT",
    color: "#c62828",
    bg: "#ffebee",
    border: "#ffcdd2",
    quickFilters: ["Butai", "Namai", "Nuoma"],
  },
  paslaugos: {
    theme: "paslaugos",
    portalName: "Paslaugos.lt tipo meistrai",
    headline: "Greitas paslaugos užsakymas",
    description:
      "Pasakyk problemą balsu ar įkelk foto — brokeris suves su meistru pagal miestą ir spindulį.",
    primaryCta: "Reikia paslaugos",
    color: "#0f766e",
    bg: "#e6fffb",
    border: "#99f6e4",
    quickFilters: ["Elektrikas", "Santechnikas", "Valymas"],
  },
};

export function portalExperienceForQuery(query: string): PortalExperience {
  const q = query.toLowerCase();
  if (/auto|automobil|ratlank|padang|vin|valst|numer|golf|bmw|audi|ta\b/.test(q)) {
    return EXPERIENCES.autoplius;
  }
  if (/suknel|batai|drabu|striuk|dydis|brand|zara|nike|vinted/.test(q)) {
    return EXPERIENCES.vinted;
  }
  if (/but|nam|nuom|sklyp|kamb|aruod|nt\b|nekilnoj/.test(q)) {
    return EXPERIENCES.aruodas;
  }
  if (/meistr|paslaug|elektrik|santechn|valym|remont|statyb|plytel|groz|grož/.test(q)) {
    return EXPERIENCES.paslaugos;
  }
  if (q.trim().length > 0) return EXPERIENCES.skelbiu;
  return EXPERIENCES.flux;
}

export function allPortalExperiences(): PortalExperience[] {
  return [
    EXPERIENCES.autoplius,
    EXPERIENCES.vinted,
    EXPERIENCES.skelbiu,
    EXPERIENCES.aruodas,
    EXPERIENCES.paslaugos,
  ];
}
