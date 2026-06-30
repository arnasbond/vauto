"use client";

import { useEffect, useState } from "react";
import { resolveAiModeLabel } from "@/lib/ai-mode";
import { isClientGeminiAvailable } from "@/lib/gemini-browser";
import { apiAiHealthCheck } from "@/lib/api/client";

export type AiModeKind = "live" | "demo" | "checking";

export async function resolveAiModeKind(): Promise<AiModeKind> {
  const health = await apiAiHealthCheck();
  if (health?.gemini) return "live";
  if (isClientGeminiAvailable()) return "live";
  return "demo";
}

const MODE_STYLES: Record<
  Exclude<AiModeKind, "checking">,
  { label: string; className: string }
> = {
  live: {
    label: "Gemini AI",
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  demo: {
    label: "Demo AI",
    className: "border-amber-200 bg-amber-50 text-amber-900",
  },
};

interface AiModeBadgeProps {
  className?: string;
  compact?: boolean;
}

export function AiModeBadge({ className = "", compact = false }: AiModeBadgeProps) {
  const [kind, setKind] = useState<AiModeKind>("checking");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      const [mode, label] = await Promise.all([resolveAiModeKind(), resolveAiModeLabel()]);
      if (!active) return;
      setKind(mode);
      setDetail(label);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (kind === "checking") return null;

  const style = MODE_STYLES[kind];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.className} ${className}`}
      title={detail || style.label}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden />
      {compact ? style.label : detail || style.label}
    </span>
  );
}
