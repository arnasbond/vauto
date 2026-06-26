"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { wizardInvalidClass } from "@/lib/listing-field-validation";

export interface CreatableComboboxProps {
  label?: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  highlight?: boolean;
  createLabel?: (query: string) => string;
  emptyHint?: string;
  className?: string;
  hideLabel?: boolean;
}

function normalize(value: string): string {
  return value.trim();
}

export function CreatableCombobox({
  label,
  value,
  options,
  onChange,
  required,
  placeholder = "Ieškoti arba įrašyti…",
  disabled,
  invalid,
  highlight,
  createLabel = (q) => `Sukurti / įrašyti naują: „${q}"`,
  emptyHint = "Pradėkite rašyti pavadinimą",
  className,
  hideLabel,
}: CreatableComboboxProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const mergedOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const opt of [...options, value]) {
      const t = normalize(opt);
      if (!t) continue;
      const key = t.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
    return out.sort((a, b) => a.localeCompare(b, "lt"));
  }, [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mergedOptions.slice(0, 40);
    return mergedOptions.filter((o) => o.toLowerCase().includes(q)).slice(0, 40);
  }, [mergedOptions, query]);

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return false;
    return mergedOptions.some((o) => o.toLowerCase() === q);
  }, [mergedOptions, query]);

  const showCreate =
    query.trim().length > 0 && !exactMatch;

  const listItems = showCreate
    ? [{ type: "create" as const, label: createLabel(query.trim()) }, ...filtered.map((o) => ({ type: "option" as const, label: o }))]
    : filtered.map((o) => ({ type: "option" as const, label: o }));

  const commit = (next: string) => {
    const trimmed = normalize(next);
    setQuery(trimmed);
    onChange(trimmed);
    setOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div ref={rootRef} className={cn("relative mb-3", className, wizardInvalidClass(Boolean(invalid)))}>
      {!hideLabel && label && (
        <label className="nt-wizard-label mb-1.5 block text-sm font-medium">
          {label}
          {required && <span className="text-red-600"> *</span>}
        </label>
      )}
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        className={cn(
          "nt-wizard-input w-full rounded-md border px-3 py-3 text-sm outline-none focus:border-[var(--vauto-primary)] focus:ring-1 focus:ring-[var(--vauto-primary)]",
          highlight && !value && "border-[#ffe082] bg-[#fffde7]",
          disabled && "opacity-50"
        )}
        onFocus={() => !disabled && setOpen(true)}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          onChange(normalize(next));
          setOpen(true);
          setActiveIndex(-1);
        }}
        onBlur={() => {
          window.setTimeout(() => commit(query), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((i) => Math.min(i + 1, listItems.length - 1));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (open && activeIndex >= 0 && listItems[activeIndex]) {
              const item = listItems[activeIndex]!;
              commit(item.type === "create" ? query.trim() : item.label);
              return;
            }
            commit(query);
            return;
          }
          if (e.key === "Escape") {
            setOpen(false);
            setActiveIndex(-1);
          }
        }}
      />
      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          className="nt-wizard-panel absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-md border shadow-lg"
        >
          {listItems.length === 0 && (
            <li className="nt-wizard-muted px-3 py-2 text-sm">{emptyHint}</li>
          )}
          {listItems.map((item, index) => (
            <li key={`${item.type}-${item.label}`} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                className={cn(
                  "w-full px-3 py-2.5 text-left text-sm",
                  item.type === "create"
                    ? "font-semibold text-[var(--vauto-primary)]"
                    : "nt-wizard-heading",
                  index === activeIndex && "bg-[color-mix(in_srgb,var(--vauto-primary)_12%,transparent)]"
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (item.type === "create") commit(query.trim());
                  else commit(item.label);
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
