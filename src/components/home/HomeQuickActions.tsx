"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { useVauto } from "@/context/VautoContext";

export type HomeQuickActionId = "search" | "sell" | "services" | "browse";

interface HomeQuickActionsProps {
  className?: string;
  onSearchFocus?: () => void;
  onSearchPrompt?: (prompt: string) => void;
}

const ACTIONS: {
  id: HomeQuickActionId;
  emoji: string;
  label: string;
  sublabel: string;
}[] = [
  {
    id: "search",
    emoji: "🔍",
    label: "Ieškau / Perku",
    sublabel: "AI paieška",
  },
  {
    id: "sell",
    emoji: "➕",
    label: "Parduodu prekę / auto",
    sublabel: "Išmanus skelbimas",
  },
  {
    id: "services",
    emoji: "🛠️",
    label: "Siūlau paslaugas",
    sublabel: "Verslo profilis",
  },
  {
    id: "browse",
    emoji: "📱",
    label: "Panaršyti skelbimus",
    sublabel: "Kategorijos",
  },
];

export function HomeQuickActions({
  className,
  onSearchFocus,
  onSearchPrompt,
}: HomeQuickActionsProps) {
  const router = useRouter();
  const { requireAuthForListing, setSearchQuery } = useVauto();

  const handleAction = (id: HomeQuickActionId) => {
    switch (id) {
      case "search":
        onSearchPrompt?.("Ieškau BMW iki 15 000 €");
        onSearchFocus?.();
        break;
      case "sell":
        if (requireAuthForListing("/add/")) {
          router.push("/add/");
        }
        break;
      case "services":
        if (requireAuthForListing("/add/")) {
          setSearchQuery("");
          router.push("/add/?intent=services");
        }
        break;
      case "browse":
        document
          .getElementById("browse-section")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
    }
  };

  return (
    <div className={cn("mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4", className)}>
      {ACTIONS.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => handleAction(action.id)}
          className="group home-quick-action-btn flex flex-col items-start rounded-2xl px-3.5 py-3 text-left transition hover:border-[var(--vauto-primary)]/40 active:scale-[0.98]"
        >
          <span className="text-lg leading-none" aria-hidden>
            {action.emoji}
          </span>
          <span className="home-quick-action-label mt-2 text-[13px] font-semibold leading-tight">
            {action.label}
          </span>
          <span className="home-quick-action-sublabel mt-0.5 text-[10px]">
            {action.sublabel}
          </span>
        </button>
      ))}
    </div>
  );
}
