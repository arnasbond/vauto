import type { AdaptiveCategoryKey } from "@/lib/adaptive-categories";
import type { ListingCategory } from "@/lib/types";
import { listingToAdaptiveKey } from "@/lib/adaptive-categories";
import { isVehicleQuery } from "@/lib/vehicle-keywords";
import type { ChameleonThemeId } from "@/lib/chameleon-themes";

/**
 * VAUTO-native vertical presentation layer (Stage 20B.1).
 *
 * Replaces the deprecated "Chameleon / portal" semantics:
 * - category → theme  (portal imitation)   is now category → presentation
 * - portal UI palettes (autoplius blue…)   are now DS 2.0 token-driven
 * - portal experiences (Skelbiu, Aruodas…) are now vertical experiences
 *
 * Vertikalių adaptacija (schema / atributai / filtrai / pristatymas) yra
 * išsaugoma; svetimų marketplace portalų imitavimas — pašalintas.
 */

/** Vertikalės, kurias palaiko VAUTO universalus marketplace. */
export type VerticalPresentationId =
  | "marketplace" // flux — bendras VAUTO marketplace (DS 2.0 emerald)
  | "transport" // buvęs "autoplius"
  | "fashion" // buvęs "wardrobe" (Spinta)
  | "goods" // buvęs "skelbiu" (prekės)
  | "real_estate" // buvęs "aruodas"
  | "services" // buvęs "paslaugos"
  | "jobs"; // buvęs "cvbankas"

export interface VerticalPromoteLabels {
  modalTitle: string;
  cardCta: string;
  bumpLabel: string;
  successMessage: string;
}

export interface VerticalPresentationTokens {
  id: VerticalPresentationId;
  bodyClass: string;
  verticalLabel: string;
  /** Nebėra portal-native "classic" variantų — visos vertikalės naudoja DS 2.0. */
  promote: VerticalPromoteLabels;
  confirmation: {
    shell: string;
    headerBar: string;
    title: string;
    subtitle: string;
    assistantLabel: string;
    aiBubble: string;
    userBubble: string;
    detailsToggle: string;
    detailsPanel: string;
    publishBtn: string;
    publishBtnDisabled: string;
    cancelBtn: string;
  };
  panel: string;
  published: {
    shell: string;
    card: string;
    title: string;
  };
}

const DS_CONFIRMATION = {
  shell: "bg-background text-foreground",
  headerBar: "border-border bg-card",
  title: "text-primary",
  subtitle: "text-muted-foreground",
  assistantLabel: "text-primary",
  aiBubble: "border border-border bg-card text-foreground shadow-sm",
  userBubble: "bg-primary text-primary-foreground",
  detailsToggle: "border-border bg-card text-muted-foreground",
  detailsPanel: "border-border bg-card",
  publishBtn:
    "bg-primary text-primary-foreground shadow-[var(--vauto-primary)]/25",
  publishBtnDisabled: "disabled:opacity-40",
  cancelBtn: "text-muted-foreground hover:bg-accent hover:text-foreground",
} as const;

const PRESENTATIONS: Record<VerticalPresentationId, VerticalPresentationTokens> = {
  marketplace: {
    id: "marketplace",
    bodyClass: "chameleon-flux",
    verticalLabel: "VAUTO",
    promote: {
      modalTitle: "Smart Promote",
      cardCta: "Smart Promote",
      bumpLabel: "Iškelti skelbimą",
      successMessage: "Smart Promote aktyvuotas",
    },
    confirmation: { ...DS_CONFIRMATION },
    panel: "rounded-2xl border border-border bg-card p-4",
    published: {
      shell: "bg-background/95",
      card: "border-border bg-card text-foreground",
      title: "text-foreground",
    },
  },
  transport: {
    id: "transport",
    bodyClass: "chameleon-flux",
    verticalLabel: "Transporto skelbimas",
    promote: {
      modalTitle: "Paryškinti skelbimą",
      cardCta: "Paryškinti skelbimą",
      bumpLabel: "Iškelti į viršų",
      successMessage: "Skelbimas paryškintas ir iškeltas į viršų",
    },
    confirmation: { ...DS_CONFIRMATION },
    panel: "rounded-2xl border border-border bg-card p-4",
    published: {
      shell: "bg-background/95",
      card: "border-border bg-card text-foreground",
      title: "text-foreground",
    },
  },
  fashion: {
    id: "fashion",
    bodyClass: "chameleon-wardrobe",
    verticalLabel: "Aprangos skelbimas",
    promote: {
      modalTitle: "Iškelti skelbimą",
      cardCta: "Iškelti skelbimą",
      bumpLabel: "Iškelti į viršų",
      successMessage: "Skelbimas iškeltas į viršų",
    },
    confirmation: { ...DS_CONFIRMATION },
    panel: "rounded-2xl border border-border bg-card p-4",
    published: {
      shell: "bg-background/95",
      card: "border-border bg-card text-foreground",
      title: "text-foreground",
    },
  },
  goods: {
    id: "goods",
    bodyClass: "chameleon-flux",
    verticalLabel: "Universalus skelbimas",
    promote: {
      modalTitle: "Rodyti pirmame puslapyje",
      cardCta: "Rodyti pirmame puslapyje",
      bumpLabel: "Iškelti skelbimą",
      successMessage: "Skelbimas rodomas pirmame puslapyje",
    },
    confirmation: { ...DS_CONFIRMATION },
    panel: "rounded-2xl border border-border bg-card p-4",
    published: {
      shell: "bg-background/95",
      card: "border-border bg-card text-foreground",
      title: "text-foreground",
    },
  },
  real_estate: {
    id: "real_estate",
    bodyClass: "chameleon-flux",
    verticalLabel: "NT skelbimas",
    promote: {
      modalTitle: "Iškelti NT skelbimą",
      cardCta: "Iškelti NT skelbimą",
      bumpLabel: "VIP skelbimas",
      successMessage: "NT skelbimas iškeltas — matomas prioritetinėje zonoje",
    },
    confirmation: { ...DS_CONFIRMATION },
    panel: "rounded-2xl border border-border bg-card p-4",
    published: {
      shell: "bg-background/95",
      card: "border-border bg-card text-foreground",
      title: "text-foreground",
    },
  },
  services: {
    id: "services",
    bodyClass: "chameleon-flux",
    verticalLabel: "Paslaugų skelbimas",
    promote: {
      modalTitle: "Iškelti paslaugą",
      cardCta: "Iškelti paslaugą",
      bumpLabel: "TOP meistras",
      successMessage: "Paslaugos skelbimas iškeltas paslaugų kataloge",
    },
    confirmation: { ...DS_CONFIRMATION },
    panel: "rounded-2xl border border-border bg-card p-4",
    published: {
      shell: "bg-background/95",
      card: "border-border bg-card text-foreground",
      title: "text-foreground",
    },
  },
  jobs: {
    id: "jobs",
    bodyClass: "chameleon-flux",
    verticalLabel: "Darbo skelbimas",
    promote: {
      modalTitle: "Iškelti darbo skelbimą",
      cardCta: "Iškelti darbo skelbimą",
      bumpLabel: "TOP darbo pasiūlymas",
      successMessage: "Darbo skelbimas iškeltas kandidatų sraute",
    },
    confirmation: { ...DS_CONFIRMATION },
    panel: "rounded-2xl border border-border bg-card p-4",
    published: {
      shell: "bg-background/95",
      card: "border-border bg-card text-foreground",
      title: "text-foreground",
    },
  },
};

export function adaptiveKeyToPresentationId(
  key: AdaptiveCategoryKey
): VerticalPresentationId {
  switch (key) {
    case "vehicles":
      return "transport";
    case "clothing":
      return "fashion";
    case "real_estate":
      return "real_estate";
    case "services":
      return "services";
    case "jobs":
      return "jobs";
    default:
      return "goods";
  }
}

export function verticalPresentationForCategory(
  category: ListingCategory
): VerticalPresentationId {
  return adaptiveKeyToPresentationId(listingToAdaptiveKey(category));
}

export function getVerticalPresentation(
  id: VerticalPresentationId
): VerticalPresentationTokens {
  return PRESENTATIONS[id];
}

export function getPromoteLabelsForCategory(
  category: ListingCategory
): VerticalPromoteLabels {
  return getVerticalPresentation(verticalPresentationForCategory(category)).promote;
}

/* ── Vertikalės UI tokenai — DS 2.0 emerald (vienas VAUTO identitetas) ── */

export interface VerticalUiTokens {
  accent: string;
  accentHover: string;
  cta: string;
  ctaHover: string;
  bg: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  link: string;
  price: string;
  bannerBg: string;
  bannerText: string;
  searchBorder: string;
  progress: string;
  fontClass: string;
  verticalName: string;
  tagline: string;
  /**
   * @deprecated Legacy portal naming — kept for existing importers.
   * Use `verticalName`.
   */
  portalName: string;
}

type VerticalUiTokensBase = Omit<VerticalUiTokens, "portalName">;

function withUiBridge(base: VerticalUiTokensBase): VerticalUiTokens {
  return {
    ...base,
    portalName: base.verticalName,
  };
}

const VERTICAL_UI_BASE: Record<VerticalPresentationId, VerticalUiTokensBase> = {
  marketplace: {
    accent: "#10b981",
    accentHover: "#0d9f6e",
    cta: "#10b981",
    ctaHover: "#0d9f6e",
    bg: "#f7f8fb",
    surface: "#ffffff",
    border: "#e6e9f0",
    text: "#0b1220",
    textMuted: "#5b6578",
    link: "#10b981",
    price: "#0f172a",
    bannerBg: "#10b981",
    bannerText: "#ffffff",
    searchBorder: "#a7e3cf",
    progress: "#10b981",
    fontClass: "font-sans",
    verticalName: "VAUTO",
    tagline: "Viskas vienoje paieškoje",
  },
  transport: {
    accent: "#10b981",
    accentHover: "#0d9f6e",
    cta: "#10b981",
    ctaHover: "#0d9f6e",
    bg: "#f7f8fb",
    surface: "#ffffff",
    border: "#e6e9f0",
    text: "#0b1220",
    textMuted: "#5b6578",
    link: "#10b981",
    price: "#0f172a",
    bannerBg: "#10b981",
    bannerText: "#ffffff",
    searchBorder: "#a7e3cf",
    progress: "#10b981",
    fontClass: "font-sans",
    verticalName: "Transportas",
    tagline: "Automobiliai, motociklai ir kita transporto technika",
  },
  fashion: {
    accent: "#10b981",
    accentHover: "#0d9f6e",
    cta: "#10b981",
    ctaHover: "#0d9f6e",
    bg: "#f7f8fb",
    surface: "#ffffff",
    border: "#e6e9f0",
    text: "#0b1220",
    textMuted: "#5b6578",
    link: "#10b981",
    price: "#0f172a",
    bannerBg: "#10b981",
    bannerText: "#ffffff",
    searchBorder: "#a7e3cf",
    progress: "#10b981",
    fontClass: "font-sans",
    verticalName: "Apranga",
    tagline: "Drabužiai, batai ir aksesuarai",
  },
  goods: {
    accent: "#10b981",
    accentHover: "#0d9f6e",
    cta: "#10b981",
    ctaHover: "#0d9f6e",
    bg: "#f7f8fb",
    surface: "#ffffff",
    border: "#e6e9f0",
    text: "#0b1220",
    textMuted: "#5b6578",
    link: "#10b981",
    price: "#0f172a",
    bannerBg: "#10b981",
    bannerText: "#ffffff",
    searchBorder: "#a7e3cf",
    progress: "#10b981",
    fontClass: "font-sans",
    verticalName: "Prekės",
    tagline: "Baldai, telefonai, buitis ir kitos prekės",
  },
  real_estate: {
    accent: "#10b981",
    accentHover: "#0d9f6e",
    cta: "#10b981",
    ctaHover: "#0d9f6e",
    bg: "#f7f8fb",
    surface: "#ffffff",
    border: "#e6e9f0",
    text: "#0b1220",
    textMuted: "#5b6578",
    link: "#10b981",
    price: "#0f172a",
    bannerBg: "#10b981",
    bannerText: "#ffffff",
    searchBorder: "#a7e3cf",
    progress: "#10b981",
    fontClass: "font-sans",
    verticalName: "Nekilnojamasis turtas",
    tagline: "Butai, namai, sklypai ir komercinės patalpos",
  },
  services: {
    accent: "#10b981",
    accentHover: "#0d9f6e",
    cta: "#10b981",
    ctaHover: "#0d9f6e",
    bg: "#f7f8fb",
    surface: "#ffffff",
    border: "#e6e9f0",
    text: "#0b1220",
    textMuted: "#5b6578",
    link: "#10b981",
    price: "#0f172a",
    bannerBg: "#10b981",
    bannerText: "#ffffff",
    searchBorder: "#a7e3cf",
    progress: "#10b981",
    fontClass: "font-sans",
    verticalName: "Paslaugos",
    tagline: "Meistrai ir paslaugos",
  },
  jobs: {
    accent: "#10b981",
    accentHover: "#0d9f6e",
    cta: "#10b981",
    ctaHover: "#0d9f6e",
    bg: "#f7f8fb",
    surface: "#ffffff",
    border: "#e6e9f0",
    text: "#0b1220",
    textMuted: "#5b6578",
    link: "#10b981",
    price: "#0f172a",
    bannerBg: "#10b981",
    bannerText: "#ffffff",
    searchBorder: "#a7e3cf",
    progress: "#10b981",
    fontClass: "font-sans",
    verticalName: "Darbas",
    tagline: "Darbo pasiūlymai ir kandidatai",
  },
};

export const VERTICAL_UI: Record<VerticalPresentationId, VerticalUiTokens> = {
  marketplace: withUiBridge(VERTICAL_UI_BASE.marketplace),
  transport: withUiBridge(VERTICAL_UI_BASE.transport),
  fashion: withUiBridge(VERTICAL_UI_BASE.fashion),
  goods: withUiBridge(VERTICAL_UI_BASE.goods),
  real_estate: withUiBridge(VERTICAL_UI_BASE.real_estate),
  services: withUiBridge(VERTICAL_UI_BASE.services),
  jobs: withUiBridge(VERTICAL_UI_BASE.jobs),
};

export function getVerticalUi(id: VerticalPresentationId): VerticalUiTokens {
  return VERTICAL_UI[id];
}

/* ── Vertikalės experience — query → vertikalės adaptacija ── */

export interface VerticalExperience {
  vertical: VerticalPresentationId;
  verticalName: string;
  headline: string;
  description: string;
  primaryCta: string;
  color: string;
  bg: string;
  border: string;
  quickFilters: string[];
  /**
   * @deprecated Legacy Chameleon theme identity — kept for runtime/bridge
   * compatibility (VautoContext.chameleonTheme, frozen escrow checks).
   * Use `vertical` for VAUTO-native semantics.
   */
  theme: ChameleonThemeId;
  /**
   * @deprecated Legacy portal naming — kept for existing importers.
   * Use `verticalName`.
   */
  portalName: string;
}

type VerticalExperienceBase = Omit<VerticalExperience, "theme" | "portalName">;

const VERTICAL_EXPERIENCES: Record<
  VerticalPresentationId,
  VerticalExperienceBase
> = {
  marketplace: {
    vertical: "marketplace",
    verticalName: "VAUTO",
    headline: "Viskas vienoje paieškoje",
    description:
      "Vienas srautas transportui, NT, elektronikai, paslaugoms, darbui ir namų prekėms.",
    primaryCta: "Pradėti paiešką",
    color: "#10b981",
    bg: "#ffffff",
    border: "#e6e9f0",
    quickFilters: ["Foto paieška", "Kainos rėžis", "Sandorio eiga"],
  },
  transport: {
    vertical: "transport",
    verticalName: "Transportas",
    headline: "Transporto paieška",
    description:
      "Techniniai laukai, VIN / numerio autofill, TA ir rinkos kainos signalai.",
    primaryCta: "Ieškoti transporto",
    color: "#10b981",
    bg: "#ffffff",
    border: "#e6e9f0",
    quickFilters: ["VIN", "Ratlankiai", "TA galioja"],
  },
  fashion: {
    vertical: "fashion",
    verticalName: "Apranga",
    headline: "Drabužių ir aksesuarų paieška",
    description:
      "Lengvas stilius, dydžiai, būklė, prekės ženklai ir greitas foto įkėlimas.",
    primaryCta: "Ieškoti aprangos",
    color: "#10b981",
    bg: "#ffffff",
    border: "#e6e9f0",
    quickFilters: ["Dydis", "Būklė", "Prekės ženklas"],
  },
  goods: {
    vertical: "goods",
    verticalName: "Prekės",
    headline: "Universalūs skelbimai",
    description:
      "Baldai, telefonai, buitis ir kitos prekės su rinkos kainų signalais.",
    primaryCta: "Naršyti skelbimus",
    color: "#10b981",
    bg: "#ffffff",
    border: "#e6e9f0",
    quickFilters: ["Telefonai", "Baldai", "Buitis"],
  },
  real_estate: {
    vertical: "real_estate",
    verticalName: "Nekilnojamasis turtas",
    headline: "NT paieška",
    description:
      "Plotas, kambariai, aukštas, šildymas ir miestų NT paieška viename sraute.",
    primaryCta: "Ieškoti NT",
    color: "#10b981",
    bg: "#ffffff",
    border: "#e6e9f0",
    quickFilters: ["Butai", "Namai", "Nuoma"],
  },
  services: {
    vertical: "services",
    verticalName: "Paslaugos",
    headline: "Greitas paslaugos užsakymas",
    description:
      "Aprašyk problemą tekstu ar įkelk foto — asistentas suves su meistru pagal miestą ir spindulį.",
    primaryCta: "Reikia paslaugos",
    color: "#10b981",
    bg: "#ffffff",
    border: "#e6e9f0",
    quickFilters: ["Elektrikas", "Santechnikas", "Valymas"],
  },
  jobs: {
    vertical: "jobs",
    verticalName: "Darbas",
    headline: "Darbo pasiūlymai ir kandidatai",
    description:
      "Darbo pasiūlymai, kandidatų skelbimai, atlyginimo tipai ir greitas kontaktas viename sraute.",
    primaryCta: "Ieškoti darbo",
    color: "#10b981",
    bg: "#ffffff",
    border: "#e6e9f0",
    quickFilters: ["Darbas", "Sandėlininkas", "Vairuotojas"],
  },
};

function verticalIdToLegacyTheme(id: VerticalPresentationId): ChameleonThemeId {
  switch (id) {
    case "transport":
      return "autoplius";
    case "fashion":
      return "wardrobe";
    case "real_estate":
      return "aruodas";
    case "services":
      return "paslaugos";
    case "jobs":
      return "cvbankas";
    case "goods":
      return "skelbiu";
    default:
      return "flux";
  }
}

function withExperienceBridge(
  base: VerticalExperienceBase
): VerticalExperience {
  return {
    ...base,
    theme: verticalIdToLegacyTheme(base.vertical),
    portalName: base.verticalName,
  };
}

const EXPERIENCE_BRIDGED: Record<
  VerticalPresentationId,
  VerticalExperience
> = {
  marketplace: withExperienceBridge(VERTICAL_EXPERIENCES.marketplace),
  transport: withExperienceBridge(VERTICAL_EXPERIENCES.transport),
  fashion: withExperienceBridge(VERTICAL_EXPERIENCES.fashion),
  goods: withExperienceBridge(VERTICAL_EXPERIENCES.goods),
  real_estate: withExperienceBridge(VERTICAL_EXPERIENCES.real_estate),
  services: withExperienceBridge(VERTICAL_EXPERIENCES.services),
  jobs: withExperienceBridge(VERTICAL_EXPERIENCES.jobs),
};

export function verticalExperienceForQuery(
  query: string
): VerticalExperience {
  const q = query.toLowerCase();
  if (isVehicleQuery(q)) {
    return EXPERIENCE_BRIDGED.transport;
  }
  if (/suknel|batai|batų|batu|drabu|striuk|dydis|brand|zara|nike|vinted|aprang|krepš|kepur|megzt|keln|marškin|palaid|mados|spinta|adidas|h&m|reserved|sandal/i.test(q)) {
    return EXPERIENCE_BRIDGED.fashion;
  }
  if (/but|nam|nuom|sklyp|kamb|nt\b|nekilnoj/.test(q)) {
    return EXPERIENCE_BRIDGED.real_estate;
  }
  if (/meistr|paslaug|elektrik|santechn|valym|remont|statyb|plytel|groz|grož/.test(q)) {
    return EXPERIENCE_BRIDGED.services;
  }
  if (/darbas|atlygin|etat|cv|kandidat|vairuotoj|sand[eė]l|kurjer|ie[šs]kau darbo|si[uū]lau darb/.test(q)) {
    return EXPERIENCE_BRIDGED.jobs;
  }
  if (q.trim().length > 0) return EXPERIENCE_BRIDGED.goods;
  return EXPERIENCE_BRIDGED.marketplace;
}

export function allVerticalExperiences(): VerticalExperience[] {
  return [
    EXPERIENCE_BRIDGED.transport,
    EXPERIENCE_BRIDGED.fashion,
    EXPERIENCE_BRIDGED.goods,
    EXPERIENCE_BRIDGED.real_estate,
    EXPERIENCE_BRIDGED.services,
    EXPERIENCE_BRIDGED.jobs,
  ];
}

/** Trumpas vertikalės pavadinimas greito pasirinkimo mygtukams */
export function verticalShortLabel(id: VerticalPresentationId): string {
  switch (id) {
    case "transport":
      return "Transportas";
    case "fashion":
      return "Apranga";
    case "real_estate":
      return "NT";
    case "services":
      return "Paslaugos";
    case "jobs":
      return "Darbas";
    case "goods":
      return "Prekės";
    default:
      return "VAUTO";
  }
}
