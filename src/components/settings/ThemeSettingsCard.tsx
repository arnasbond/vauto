"use client";

import { Check, Palette } from "lucide-react";
import { useAppTheme } from "@/context/AppThemeContext";
import type { AppThemeId } from "@/lib/app-theme";
import { cn } from "@/lib/cn";
import { Panel } from "@/components/ui/surface";

const SWATCH: Record<AppThemeId, string> = {
  "vauto-original": "bg-gradient-to-br from-[#F4F7FC] via-white to-[#FFF4EC]",
  dark: "bg-gradient-to-br from-[#0B0F19] via-[#161C2A] to-[#1a2744]",
  "light-minimal": "bg-gradient-to-br from-[#FAFAFA] via-white to-[#F5F5F5]",
};

/**
 * Compact swatch strip — lives inside a settings group row so the theme
 * picker stays one tap away without occupying a full card.
 */
export function ThemeSwatchStrip() {
  const { theme, setTheme, themes } = useAppTheme();

  return (
    <div className="flex items-center gap-2" role="radiogroup" aria-label="Programėlės tema">
      {themes.map((item) => {
        const active = theme === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={active}
            title={item.label}
            onClick={() => setTheme(item.id)}
            className={cn(
              "relative h-9 w-9 rounded-full border transition",
              SWATCH[item.id],
              active
                ? "border-[var(--vauto-primary)] ring-2 ring-[color-mix(in_srgb,var(--vauto-primary)_28%,transparent)]"
                : "border-[var(--vauto-border)] hover:border-[color-mix(in_srgb,var(--vauto-primary)_45%,transparent)]"
            )}
          >
            <span className="sr-only">{item.label}</span>
            {active ? (
              <Check
                className="absolute inset-0 m-auto h-4 w-4 text-[var(--vauto-primary)]"
                aria-hidden
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Full theme picker with labels — used on the dedicated settings page. */
export function ThemeSettingsCard({ className }: { className?: string }) {
  const { theme, setTheme, themes } = useAppTheme();

  return (
    <Panel
      icon={<Palette className="h-4 w-4 text-[var(--vauto-primary)]" />}
      title="Programėlės tema"
      description="Pakeitimas pritaikomas visoje programėlėje akimirksniu."
      className={className}
    >
      <div className="grid gap-2 sm:grid-cols-3">
        {themes.map((item) => {
          const active = theme === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => setTheme(item.id)}
              className={cn(
                "rounded-xl border p-3 text-left transition",
                active
                  ? "border-[var(--vauto-primary)] ring-2 ring-[color-mix(in_srgb,var(--vauto-primary)_25%,transparent)]"
                  : "border-[var(--vauto-border)] hover:border-[color-mix(in_srgb,var(--vauto-primary)_40%,transparent)]"
              )}
            >
              <span
                className={cn(
                  "mb-2 block h-9 w-full rounded-lg border border-[var(--vauto-border)]",
                  SWATCH[item.id]
                )}
                aria-hidden
              />
              <span className="block text-xs font-semibold text-[var(--vauto-text-main)]">
                {item.label}
              </span>
              <span className="mt-0.5 block text-[10px] leading-snug text-[var(--vauto-text-muted)]">
                {item.description}
              </span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}
