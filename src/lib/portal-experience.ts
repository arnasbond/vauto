import type { ChameleonThemeId } from "@/lib/chameleon-themes";
import { isVehicleQuery } from "@/lib/vehicle-keywords";

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
    headline: "Viskas vienoje paieškoje",
    description:
      "Vienas srautas daiktams, automobiliams, NT, drabužiams ir paslaugoms.",
    primaryCta: "Pradėti paiešką",
    color: "#1167b1",
    bg: "#ffffff",
    border: "#dde5ef",
    quickFilters: ["Foto paieška", "Rinkos kainos", "Saugus pirkimas"],
  },
  autoplius: {
    theme: "autoplius",
    portalName: "Automobiliai",
    headline: "Auto skelbimo režimas",
    description:
      "Techniniai laukai, VIN / numerio autofill, TA ir rinkos kainos signalai.",
    primaryCta: "Ieškoti auto",
    color: "#1a56db",
    bg: "#e8f0fe",
    border: "#c5d9f7",
    quickFilters: ["VIN", "Ratlankiai", "TA galioja"],
  },
  wardrobe: {
    theme: "wardrobe",
    portalName: "Apranga",
    headline: "Drabužių ir aksesuarų režimas",
    description:
      "Lengvas stilius, dydžiai, būklė, prekės ženklai ir greitas foto įkėlimas.",
    primaryCta: "Ieškoti aprangos",
    color: "#09b1a8",
    bg: "#e6f7f6",
    border: "#b8ebe8",
    quickFilters: ["Dydis", "Būklė", "Prekės ženklas"],
  },
  skelbiu: {
    theme: "skelbiu",
    portalName: "Prekės",
    headline: "Universalūs skelbimai",
    description:
      "Baldai, telefonai, buitis ir kitos prekės su rinkos kainų signalais.",
    primaryCta: "Naršyti skelbimus",
    color: "#1565c0",
    bg: "#e3f2fd",
    border: "#90caf9",
    quickFilters: ["Telefonai", "Baldai", "Buitis"],
  },
  aruodas: {
    theme: "aruodas",
    portalName: "Nekilnojamas turtas",
    headline: "NT skelbimų režimas",
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
    portalName: "Paslaugos",
    headline: "Greitas paslaugos užsakymas",
    description:
      "Pasakyk problemą balsu ar įkelk foto — asistentas suves su meistru pagal miestą ir spindulį.",
    primaryCta: "Reikia paslaugos",
    color: "#0f766e",
    bg: "#e6fffb",
    border: "#99f6e4",
    quickFilters: ["Elektrikas", "Santechnikas", "Valymas"],
  },
  cvbankas: {
    theme: "cvbankas",
    portalName: "Darbas",
    headline: "Darbo pasiūlymų ir kandidatų režimas",
    description:
      "Darbo pasiūlymai, kandidatų skelbimai, atlyginimo tipai ir greitas kontaktas viename sraute.",
    primaryCta: "Ieškoti darbo",
    color: "#1f4b99",
    bg: "#eaf1ff",
    border: "#c8d8f4",
    quickFilters: ["Darbas", "Sandėlininkas", "Vairuotojas"],
  },
};

export function portalExperienceForQuery(query: string): PortalExperience {
  const q = query.toLowerCase();
  if (isVehicleQuery(q)) {
    return EXPERIENCES.autoplius;
  }
  if (/suknel|batai|batų|batu|drabu|striuk|dydis|brand|zara|nike|vinted|aprang|krepš|kepur|megzt|keln|marškin|palaid|mados|spinta|adidas|h&m|reserved|sandal/i.test(q)) {
    return EXPERIENCES.wardrobe;
  }
  if (/but|nam|nuom|sklyp|kamb|aruod|nt\b|nekilnoj/.test(q)) {
    return EXPERIENCES.aruodas;
  }
  if (/meistr|paslaug|elektrik|santechn|valym|remont|statyb|plytel|groz|grož/.test(q)) {
    return EXPERIENCES.paslaugos;
  }
  if (/darbas|atlygin|etat|cv|kandidat|vairuotoj|sand[eė]l|kurjer|ie[šs]kau darbo|si[uū]lau darb/.test(q)) {
    return EXPERIENCES.cvbankas;
  }
  if (q.trim().length > 0) return EXPERIENCES.skelbiu;
  return EXPERIENCES.flux;
}

export function allPortalExperiences(): PortalExperience[] {
  return [
    EXPERIENCES.autoplius,
    EXPERIENCES.wardrobe,
    EXPERIENCES.skelbiu,
    EXPERIENCES.aruodas,
    EXPERIENCES.paslaugos,
    EXPERIENCES.cvbankas,
  ];
}

/** Short label for category quick-pick buttons */
export function portalShortLabel(theme: ChameleonThemeId): string {
  switch (theme) {
    case "autoplius":
      return "Auto";
    case "wardrobe":
      return "Apranga";
    case "aruodas":
      return "NT";
    case "paslaugos":
      return "Paslaugos";
    case "cvbankas":
      return "Darbas";
    case "skelbiu":
      return "Prekės";
    default:
      return "VAUTO";
  }
}
