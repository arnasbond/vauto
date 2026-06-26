"use client";

import { Palette } from "lucide-react";
import { useAppTheme } from "@/context/AppThemeContext";
import type { AppThemeId } from "@/lib/app-theme";
import { cn } from "@/lib/cn";

const SWATCH: Record<AppThemeId, string> = {
  "vauto-original": "bg-gradient-to-br from-[#F4F7FC] via-white to-[#FFF4EC]",
  dark: "bg-gradient-to-br from-[#0B0F19] via-[#161C2A] to-[#1a2744]",
  "light-minimal": "bg-gradient-to-br from-[#FAFAFA] via-white to-[#F5F5F5]",
};

export function ThemeSettingsCard({ embedded = false }: { embedded?: boolean }) {
  const { theme, setTheme, themes } = useAppTheme();

  const content = (
    <>
      {!embedded && (
        <div className="mb-3 flex items-center gap-2">
          <Palette className="h-4 w-4 text-[var(--vauto-primary)]" />
          <h3 className="text-sm font-semibold text-[var(--vauto-text-main)]">Programėlės tema</h3>
        </div>
      )}
      {embedded ? (
        <p className="mb-3 text-xs leading-relaxed text-[var(--vauto-text-muted)]">
          Pasirinkite vizualinį stilių — pakeitimas pritaikomas visoje programėlėje akimirksniu.
        </p>
      ) : (
        <p className="mb-4 text-xs leading-relaxed text-[var(--vauto-text-muted)]">
          Pasirinkite vizualinį stilių — pakeitimas pritaikomas visoje programėlėje akimirksniu.
        </p>
      )}
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
                  ? "border-[var(--vauto-primary)] ring-2 ring-[color-mix(in_srgb,var(--vauto-primary)_30%,transparent)]"
                  : "border-[var(--vauto-border)] hover:border-[color-mix(in_srgb,var(--vauto-primary)_40%,transparent)]"
              )}
            >
              <div
                className={cn(
                  "mb-2 h-10 w-full rounded-xl border border-[var(--vauto-border)] shadow-inner",
                  SWATCH[item.id]
                )}
              />
              <p className="text-xs font-semibold text-[var(--vauto-text-main)]">{item.label}</p>
              <p className="mt-0.5 text-[10px] leading-snug text-[var(--vauto-text-muted)]">
                {item.description}
              </p>
            </button>
          );
        })}
      </div>
    </>
  );

  if (embedded) return <div>{content}</div>;

  return <div className="vauto-dashboard-card rounded-2xl p-4">{content}</div>;
}
