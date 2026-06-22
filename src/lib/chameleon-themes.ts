import type { AdaptiveCategoryKey } from "@/lib/adaptive-categories";
import type { ListingCategory } from "@/lib/types";
import { listingToAdaptiveKey } from "@/lib/adaptive-categories";

export type ChameleonThemeId =
  | "flux"
  | "autoplius"
  | "vinted"
  | "skelbiu"
  | "aruodas"
  | "paslaugos";

export interface ChameleonPromoteLabels {
  modalTitle: string;
  cardCta: string;
  bumpLabel: string;
  successMessage: string;
}

export interface ChameleonThemeTokens {
  id: ChameleonThemeId;
  bodyClass: string;
  portalLabel: string;
  /** Classic portals — hide neon / sci-fi buddy chrome */
  classicLayout: boolean;
  promote: ChameleonPromoteLabels;
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

const THEMES: Record<ChameleonThemeId, ChameleonThemeTokens> = {
  flux: {
    id: "flux",
    bodyClass: "chameleon-flux",
    portalLabel: "VAUTO",
    classicLayout: false,
    promote: {
      modalTitle: "Smart Promote",
      cardCta: "Smart Promote",
      bumpLabel: "Iškelti skelbimą",
      successMessage: "Smart Promote aktyvuotas",
    },
    confirmation: {
      shell: "bg-[var(--flux-bg)]",
      headerBar: "border-white/10",
      title: "text-[var(--vauto-teal)]",
      subtitle: "text-slate-400",
      assistantLabel: "text-[var(--vauto-teal)]",
      aiBubble: "bg-[var(--vauto-teal)]/12 ring-[var(--vauto-teal)]/20 text-teal-50",
      userBubble: "bg-[var(--flux-indigo)]/40 text-white",
      detailsToggle: "border-white/10 bg-white/5 text-slate-300",
      detailsPanel: "border-white/10 bg-black/20",
      publishBtn:
        "bg-[var(--flux-teal)] text-[var(--flux-bg)] shadow-[var(--flux-teal)]/25",
      publishBtnDisabled: "disabled:opacity-40",
      cancelBtn: "text-white/50 hover:bg-white/10 hover:text-white",
    },
    panel: "rounded-2xl border border-white/5 bg-black/20 p-4",
    published: {
      shell: "bg-[var(--flux-bg)]/95",
      card: "border-white/10 bg-white/5 text-white",
      title: "text-white",
    },
  },
  autoplius: {
    id: "autoplius",
    bodyClass: "chameleon-autoplius",
    portalLabel: "Autoplius stilius",
    classicLayout: true,
    promote: {
      modalTitle: "Paryškinti skelbimą",
      cardCta: "Paryškinti skelbimą",
      bumpLabel: "Iškelti į viršų",
      successMessage: "Skelbimas paryškintas ir iškeltas į viršų",
    },
    confirmation: {
      shell: "bg-[#f4f6f8]",
      headerBar: "border-[#d0d7de] bg-white",
      title: "text-[#1a56db]",
      subtitle: "text-[#4b5563]",
      assistantLabel: "text-[#1a56db]",
      aiBubble:
        "bg-white border border-[#d0d7de] text-[#1f2937] shadow-sm ring-0",
      userBubble: "bg-[#e8f0fe] border border-[#c5d9f7] text-[#1f2937]",
      detailsToggle:
        "border-[#d0d7de] bg-white text-[#374151] hover:bg-[#f9fafb]",
      detailsPanel: "border-[#d0d7de] bg-white shadow-sm",
      publishBtn: "bg-[#ea580c] text-white shadow-md hover:bg-[#c2410c]",
      publishBtnDisabled: "disabled:bg-[#fdba74]",
      cancelBtn: "text-[#6b7280] hover:bg-[#f3f4f6]",
    },
    panel: "rounded-lg border border-[#d0d7de] bg-white p-4 shadow-sm",
    published: {
      shell: "bg-[#f4f6f8]",
      card: "border-[#d0d7de] bg-white text-[#1f2937] shadow-md",
      title: "text-[#1f2937]",
    },
  },
  vinted: {
    id: "vinted",
    bodyClass: "chameleon-vinted",
    portalLabel: "Vinted stilius",
    classicLayout: false,
    promote: {
      modalTitle: "Skelbimo išskyrimas (Bump)",
      cardCta: "Skelbimo išskyrimas (Bump)",
      bumpLabel: "Spintos iškėlimas",
      successMessage: "Spintos iškėlimas aktyvuotas",
    },
    confirmation: {
      shell: "bg-[#faf8f5]",
      headerBar: "border-[#e8e4df] bg-[#fffdf9]",
      title: "text-[#09b1a8]",
      subtitle: "text-[#6b7280]",
      assistantLabel: "text-[#09b1a8] font-light tracking-wide",
      aiBubble:
        "bg-white border border-[#e8e4df] text-[#374151] shadow-sm font-light",
      userBubble: "bg-[#e6f7f6] border border-[#b8ebe8] text-[#374151]",
      detailsToggle:
        "border-[#e8e4df] bg-white text-[#4b5563] font-light",
      detailsPanel: "border-[#e8e4df] bg-white",
      publishBtn: "bg-[#09b1a8] text-white shadow-sm hover:bg-[#078f88]",
      publishBtnDisabled: "disabled:opacity-50",
      cancelBtn: "text-[#9ca3af] hover:bg-[#f3f4f6]",
    },
    panel: "rounded-2xl border border-[#e8e4df] bg-white p-4",
    published: {
      shell: "bg-[#faf8f5]",
      card: "border-[#e8e4df] bg-white text-[#374151]",
      title: "text-[#374151] font-light",
    },
  },
  skelbiu: {
    id: "skelbiu",
    bodyClass: "chameleon-skelbiu",
    portalLabel: "Skelbiu stilius",
    classicLayout: true,
    promote: {
      modalTitle: "Rodyti pirmame puslapyje",
      cardCta: "Rodyti pirmame puslapyje",
      bumpLabel: "Iškelti skelbimą",
      successMessage: "Skelbimas rodomas pirmame puslapyje",
    },
    confirmation: {
      shell: "bg-[#eceff1]",
      headerBar: "border-[#b0bec5] bg-[#cfd8dc]",
      title: "text-[#1565c0] font-bold",
      subtitle: "text-[#455a64]",
      assistantLabel: "text-[#1565c0] font-bold uppercase text-xs",
      aiBubble: "bg-white border-2 border-[#b0bec5] text-[#263238]",
      userBubble: "bg-[#e3f2fd] border-2 border-[#90caf9] text-[#263238]",
      detailsToggle:
        "border-2 border-[#b0bec5] bg-white text-[#37474f] font-semibold",
      detailsPanel: "border-2 border-[#b0bec5] bg-white",
      publishBtn: "bg-[#1565c0] text-white text-xl font-bold hover:bg-[#0d47a1]",
      publishBtnDisabled: "disabled:bg-[#90caf9]",
      cancelBtn: "text-[#546e7a] hover:bg-white",
    },
    panel: "rounded border-2 border-[#b0bec5] bg-white p-4",
    published: {
      shell: "bg-[#eceff1]",
      card: "border-2 border-[#b0bec5] bg-white text-[#263238]",
      title: "text-[#263238] font-bold",
    },
  },
  aruodas: {
    id: "aruodas",
    bodyClass: "chameleon-aruodas",
    portalLabel: "Aruodas.lt stilius",
    classicLayout: true,
    promote: {
      modalTitle: "Iškelti NT skelbimą",
      cardCta: "Iškelti NT skelbimą",
      bumpLabel: "VIP skelbimas",
      successMessage: "NT skelbimas iškeltas — matomas prioritetinėje zonoje",
    },
    confirmation: {
      shell: "bg-[#f5f5f5]",
      headerBar: "border-[#e0e0e0] bg-white shadow-sm",
      title: "text-[#c62828] font-bold",
      subtitle: "text-[#616161]",
      assistantLabel: "text-[#c62828] font-semibold uppercase text-xs",
      aiBubble:
        "bg-white border border-[#e0e0e0] text-[#212121] shadow-sm rounded-md",
      userBubble: "bg-[#ffebee] border border-[#ffcdd2] text-[#212121] rounded-md",
      detailsToggle:
        "border border-[#e0e0e0] bg-white text-[#424242] font-medium hover:bg-[#fafafa]",
      detailsPanel: "border border-[#e0e0e0] bg-white shadow-sm",
      publishBtn:
        "bg-[#c62828] text-white text-lg font-bold shadow-md hover:bg-[#b71c1c] rounded-md",
      publishBtnDisabled: "disabled:bg-[#ef9a9a]",
      cancelBtn: "text-[#757575] hover:bg-[#fafafa]",
    },
    panel: "rounded-md border border-[#e0e0e0] bg-white p-4 shadow-sm",
    published: {
      shell: "bg-[#f5f5f5]",
      card: "border border-[#e0e0e0] bg-white text-[#212121] shadow-md",
      title: "text-[#c62828] font-bold",
    },
  },
  paslaugos: {
    id: "paslaugos",
    bodyClass: "chameleon-paslaugos",
    portalLabel: "Paslaugos.lt stilius",
    classicLayout: true,
    promote: {
      modalTitle: "Iškelti paslaugą",
      cardCta: "Iškelti paslaugą",
      bumpLabel: "TOP meistras",
      successMessage: "Paslaugos skelbimas iškeltas paslaugų kataloge",
    },
    confirmation: {
      shell: "bg-[#f4f9ff]",
      headerBar: "border-[#cfe3ff] bg-white",
      title: "text-[#0f766e] font-bold",
      subtitle: "text-[#475569]",
      assistantLabel: "text-[#0f766e] font-bold uppercase text-xs",
      aiBubble: "bg-white border border-[#cfe3ff] text-[#0f172a] shadow-sm",
      userBubble: "bg-[#e6fffb] border border-[#99f6e4] text-[#0f172a]",
      detailsToggle:
        "border border-[#cfe3ff] bg-white text-[#334155] font-semibold hover:bg-[#f8fbff]",
      detailsPanel: "border border-[#cfe3ff] bg-white shadow-sm",
      publishBtn: "bg-[#0f766e] text-white text-lg font-bold hover:bg-[#115e59]",
      publishBtnDisabled: "disabled:bg-[#99f6e4]",
      cancelBtn: "text-[#64748b] hover:bg-[#f1f5f9]",
    },
    panel: "rounded-xl border border-[#cfe3ff] bg-white p-4 shadow-sm",
    published: {
      shell: "bg-[#f4f9ff]",
      card: "border border-[#cfe3ff] bg-white text-[#0f172a] shadow-md",
      title: "text-[#0f766e] font-bold",
    },
  },
};

export function adaptiveKeyToTheme(key: AdaptiveCategoryKey): ChameleonThemeId {
  switch (key) {
    case "vehicles":
      return "autoplius";
    case "clothing":
      return "vinted";
    case "real_estate":
      return "aruodas";
    case "services":
      return "paslaugos";
    default:
      return "skelbiu";
  }
}

export function categoryToTheme(category: ListingCategory): ChameleonThemeId {
  return adaptiveKeyToTheme(listingToAdaptiveKey(category));
}

export function getChameleonTheme(id: ChameleonThemeId): ChameleonThemeTokens {
  return THEMES[id];
}

export function getPromoteLabelsForCategory(
  category: ListingCategory
): ChameleonPromoteLabels {
  return getChameleonTheme(categoryToTheme(category)).promote;
}
