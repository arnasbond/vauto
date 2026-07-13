"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { useVauto } from "@/context/VautoContext";

export type HomeQuickActionId = "search" | "spinta" | "browse";

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
    id: "spinta",
    emoji: "📦",
    label: "Mano skelbimai",
    sublabel: "Prekės ir paslaugos",
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
  const { isAuthenticated } = useVauto();

  const handleAction = (id: HomeQuickActionId) => {
    switch (id) {
      case "search":
        onSearchPrompt?.("Ieškau BMW iki 15 000 €");
        onSearchFocus?.();
        break;
      case "spinta":
        router.push(isAuthenticated ? "/fashion/mine/" : "/auth-gate/");
        break;
      case "browse":
        document
          .getElementById("listing-results")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
    }
  };

  return (
    <div className={cn("mt-5 grid grid-cols-3 gap-2.5", className)}>
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
