"use client";

import { Check, Monitor, Palette } from "lucide-react";
import { useAppTheme } from "@/context/AppThemeContext";
import type { AppThemePreference } from "@/lib/app-theme";
import { cn } from "@/lib/cn";
import { Panel } from "@/components/ui/surface";

const SWATCH: Record<AppThemePreference, string> = {
  system: "bg-gradient-to-br from-[#F7F8FB] via-white to-[#0B1220]",
  light: "bg-gradient-to-br from-[#F7F8FB] via-white to-[#ECFDF5]",
  dark: "bg-gradient-to-br from-[#0B1220] via-[#121A2B] to-[#182235]",
};

/**
 * Compact swatch strip — lives inside a settings group row so the theme
 * picker stays one tap away without occupying a full card.
 */
export function ThemeSwatchStrip() {
  const { preference, setTheme, themes } = useAppTheme();

  return (
    <div className="flex items-center gap-2" role="radiogroup" aria-label="Programėlės tema">
      {themes.map((item) => {
        const active = preference === item.id;
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
            {item.id === "system" ? (
              <Monitor
                className={cn(
                  "absolute inset-0 m-auto h-3.5 w-3.5",
                  active ? "text-[var(--vauto-primary)]" : "text-[var(--vauto-text-muted)]"
                )}
                aria-hidden
              />
            ) : null}
            {active && item.id !== "system" ? (
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
  const { preference, setTheme, themes } = useAppTheme();

  return (
    <Panel
      icon={<Palette className="h-4 w-4 text-[var(--vauto-primary)]" />}
      title="Programėlės tema"
      description="Pakeitimas pritaikomas visoje programėlėje akimirksniu. „Sistemos nustatymas“ automatiškai seka jūsų įrenginio šviesią arba tamsią temą."
      className={className}
    >
      <div className="grid gap-2 sm:grid-cols-3">
        {themes.map((item) => {
          const active = preference === item.id;
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
                  "relative mb-2 flex h-9 w-full items-center justify-center rounded-lg border border-[var(--vauto-border)]",
                  SWATCH[item.id]
                )}
                aria-hidden
              >
                {item.id === "system" ? (
                  <Monitor className="h-4 w-4 text-[var(--vauto-text-muted)]" aria-hidden />
                ) : null}
              </span>
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
