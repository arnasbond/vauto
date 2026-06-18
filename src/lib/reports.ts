import type { ReportCategory, ReportUrgency } from "@/lib/types";

export const REPORT_CATEGORIES: {
  id: ReportCategory;
  label: string;
  description: string;
}[] = [
  {
    id: "fraud",
    label: "Sukčiavimas",
    description: "Įtartinas ar apgaulingas skelbimas",
  },
  {
    id: "bad_info",
    label: "Neteisinga informacija",
    description: "Klaidinga kaina, nuotrauka ar aprašymas",
  },
  {
    id: "chat_abuse",
    label: "Piktnaudžiavimas pokalbyje",
    description: "Įžeidimai, spamas ar grasinimai",
  },
  {
    id: "general_feedback",
    label: "Bendras atsiliepimas",
    description: "Pasiūlymai ar klausimai Vauto komandai",
  },
];

export function categoryToUrgency(category: ReportCategory): ReportUrgency {
  switch (category) {
    case "fraud":
    case "chat_abuse":
      return "critical";
    case "bad_info":
      return "feedback";
    default:
      return "general";
  }
}

export const URGENCY_META: Record<
  ReportUrgency,
  { label: string; className: string; dot: string }
> = {
  critical: {
    label: "Kritinis",
    className: "bg-red-500/15 text-red-300 border-red-500/30",
    dot: "bg-red-500",
  },
  feedback: {
    label: "Atsiliepimas",
    className: "bg-amber-500/15 text-amber-200 border-amber-500/30",
    dot: "bg-amber-400",
  },
  general: {
    label: "Bendras",
    className: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
    dot: "bg-emerald-400",
  },
};

export const ADMIN_EMAIL = "admin@vauto.com";
