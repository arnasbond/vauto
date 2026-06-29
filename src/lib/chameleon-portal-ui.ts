import type { ChameleonThemeId } from "@/lib/chameleon-themes";

/** Per-portal visual tokens — colors, typography, layout cues */
export interface PortalUiTokens {
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
  portalName: string;
  tagline: string;
}

export const PORTAL_UI: Record<ChameleonThemeId, PortalUiTokens> = {
  flux: {
    accent: "#1167b1",
    accentHover: "#0d5291",
    cta: "#f97316",
    ctaHover: "#ea580c",
    bg: "#f3f5f8",
    surface: "#ffffff",
    border: "#dde5ef",
    text: "#111827",
    textMuted: "#6b7280",
    link: "#1167b1",
    price: "#f97316",
    bannerBg: "#1167b1",
    bannerText: "#ffffff",
    searchBorder: "#cfd8e3",
    progress: "#1167b1",
    fontClass: "font-sans",
    portalName: "VAUTO",
    tagline: "Viskas vienoje paieškoje",
  },
  autoplius: {
    accent: "#1167b1",
    accentHover: "#0d5291",
    cta: "#ea580c",
    ctaHover: "#c2410c",
    bg: "#f3f4f6",
    surface: "#ffffff",
    border: "#d0d7de",
    text: "#1f2937",
    textMuted: "#6b7280",
    link: "#1167b1",
    price: "#ea580c",
    bannerBg: "#1167b1",
    bannerText: "#ffffff",
    searchBorder: "#c5d9f7",
    progress: "#1167b1",
    fontClass: "font-sans",
    portalName: "autoplius",
    tagline: "Automobilių skelbimai Lietuvoje",
  },
  wardrobe: {
    accent: "#09b1a8",
    accentHover: "#078f88",
    cta: "#09b1a8",
    ctaHover: "#078f88",
    bg: "#faf8f5",
    surface: "#fffdf9",
    border: "#e8e4df",
    text: "#374151",
    textMuted: "#9ca3af",
    link: "#09b1a8",
    price: "#374151",
    bannerBg: "#09b1a8",
    bannerText: "#ffffff",
    searchBorder: "#e8e4df",
    progress: "#09b1a8",
    fontClass: "font-sans font-light",
    portalName: "VAUTO Asortimentas",
    tagline: "Prekės ir paslaugos",
  },
  skelbiu: {
    accent: "#1565c0",
    accentHover: "#0d47a1",
    cta: "#43a047",
    ctaHover: "#2e7d32",
    bg: "#eceff1",
    surface: "#ffffff",
    border: "#b0bec5",
    text: "#263238",
    textMuted: "#546e7a",
    link: "#1565c0",
    price: "#43a047",
    bannerBg: "#cfd8dc",
    bannerText: "#1565c0",
    searchBorder: "#b0bec5",
    progress: "#1565c0",
    fontClass: "font-sans font-semibold",
    portalName: "Skelbiu",
    tagline: "Skelbimai Lietuvoje",
  },
  aruodas: {
    accent: "#c62828",
    accentHover: "#b71c1c",
    cta: "#c62828",
    ctaHover: "#b71c1c",
    bg: "#f5f5f5",
    surface: "#ffffff",
    border: "#e0e0e0",
    text: "#212121",
    textMuted: "#757575",
    link: "#c62828",
    price: "#c62828",
    bannerBg: "#c62828",
    bannerText: "#ffffff",
    searchBorder: "#ffcdd2",
    progress: "#c62828",
    fontClass: "font-sans font-bold",
    portalName: "Aruodas",
    tagline: "Nekilnojamasis turtas",
  },
  paslaugos: {
    accent: "#0f766e",
    accentHover: "#115e59",
    cta: "#0f766e",
    ctaHover: "#115e59",
    bg: "#f4f9ff",
    surface: "#ffffff",
    border: "#cfe3ff",
    text: "#0f172a",
    textMuted: "#64748b",
    link: "#0f766e",
    price: "#0f766e",
    bannerBg: "#0f766e",
    bannerText: "#ffffff",
    searchBorder: "#cfe3ff",
    progress: "#0f766e",
    fontClass: "font-sans font-semibold",
    portalName: "Paslaugos",
    tagline: "Meistrai ir paslaugos",
  },
  cvbankas: {
    accent: "#1f4b99",
    accentHover: "#173a78",
    cta: "#1f4b99",
    ctaHover: "#173a78",
    bg: "#f5f7fb",
    surface: "#ffffff",
    border: "#d9e2f1",
    text: "#172033",
    textMuted: "#64748b",
    link: "#e53935",
    price: "#1f4b99",
    bannerBg: "#1f4b99",
    bannerText: "#ffffff",
    searchBorder: "#d9e2f1",
    progress: "#1f4b99",
    fontClass: "font-sans font-bold",
    portalName: "CVbankas",
    tagline: "Nr.1 lankomiausias darbo portalas",
  },
};

export function getPortalUi(theme: ChameleonThemeId): PortalUiTokens {
  return PORTAL_UI[theme];
}
