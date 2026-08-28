"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Moon, Monitor, Sun } from "lucide-react";
import { useAppTheme } from "@/context/AppThemeContext";
import type { AppThemePreference } from "@/lib/app-theme";
import { cn } from "@/lib/cn";

const ICON: Record<AppThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

/**
 * Restrained global header quick control for LIGHT / DARK / AUTO. This is
 * the ONLY new UI surface — it does not create a second theme state. It
 * reads and writes the exact same `useAppTheme()` context that already
 * backs Profile → Settings → Theme (`ThemeSettingsCard`/`ThemeSwatchStrip`),
 * so switching here is reflected there instantly and vice versa, and works
 * for anonymous users (the provider is mounted app-wide, not gated by auth).
 *
 * Visual geometry intentionally mirrors the adjacent `NotificationBell`
 * trigger (h-10 w-10, rounded-[14px], `.vauto-surface-panel`) so it reads as
 * part of the same header control family rather than a new decorative
 * element.
 */
export function ThemeQuickControl() {
  const { preference, setTheme, themes } = useAppTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSelect = useCallback(
    (next: AppThemePreference) => {
      setTheme(next);
      setOpen(false);
    },
    [setTheme]
  );

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const focusIndex = itemRefs.current.findIndex((el) => el === document.activeElement);
    const currentIndex = focusIndex >= 0 ? focusIndex : themes.findIndex((t) => t.id === preference);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (currentIndex + delta + themes.length) % themes.length;
    itemRefs.current[nextIndex]?.focus();
  };

  const ActiveIcon = ICON[preference];
  const activeMeta = themes.find((t) => t.id === preference);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="ds-focusable vauto-surface-panel relative flex h-10 w-10 items-center justify-center rounded-[14px] border shadow-sm transition hover:opacity-90"
        aria-label={`Tema: ${activeMeta?.label ?? "Šviesi tema"}. Pakeisti temą`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-theme-quick-control
      >
        <ActiveIcon className="h-[17px] w-[17px]" strokeWidth={1.75} aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Pasirinkite temą"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 top-12 z-50 w-44 overflow-hidden rounded-2xl border border-[var(--vauto-border)] bg-[var(--vauto-card-bg)] py-1.5 shadow-xl"
          data-theme-quick-menu
        >
          {themes.map((item, index) => {
            const Icon = ICON[item.id];
            const active = preference === item.id;
            return (
              <button
                key={item.id}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => handleSelect(item.id)}
                className={cn(
                  "ds-focusable flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm font-medium transition",
                  active
                    ? "bg-[var(--ds-brand-soft)] text-[var(--ds-brand)]"
                    : "text-[var(--vauto-text-main)] hover:bg-[var(--vauto-surface-muted)]"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="flex-1">{item.label}</span>
                {active ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
