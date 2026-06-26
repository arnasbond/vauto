"use client";

import { Palette } from "lucide-react";
import { useAppTheme } from "@/context/AppThemeContext";
import type { AppThemeId } from "@/lib/app-theme";
import { cn } from "@/lib/cn";

const SWATCH: Record<AppThemeId, string> = {
  "vauto-original": "bg-gradient-to-br from-white via-[#eef4ff] to-[#fff4ec]",
  dark: "bg-gradient-to-br from-[#0b0f17] via-[#111827] to-[#1e3a5f]",
  "light-minimal": "bg-gradient-to-br from-[#f8fafc] via-[#f1f5f9] to-[#e2e8f0]",
};

export function ThemeSettingsCard() {
  const { theme, setTheme, themes } = useAppTheme();

  return (
    <div className="vauto-dashboard-card rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <Palette className="h-4 w-4 text-[var(--vauto-teal)]" />
        <h3 className="text-sm font-semibold text-slate-900">Programėlės tema</h3>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-slate-500">
        Pasirinkite vizualinį stilių — pakeitimas pritaikomas visoje programėlėje akimirksniu.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {themes.map((item) => {
          const active = theme === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTheme(item.id)}
              className={cn(
                "rounded-2xl border p-3 text-left transition",
                active
                  ? "border-[var(--vauto-teal)] ring-2 ring-[var(--vauto-teal)]/30"
                  : "border-slate-200 hover:border-slate-300"
              )}
            >
              <div
                className={cn(
                  "mb-2 h-10 w-full rounded-xl border border-black/5 shadow-inner",
                  SWATCH[item.id]
                )}
              />
              <p className="text-xs font-semibold text-slate-800">{item.label}</p>
              <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{item.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
