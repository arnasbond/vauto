"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

interface LithuanianCityFieldProps {
  location: string;
  cityOptions: readonly string[];
  onLocationChange: (city: string) => void;
  selectClassName?: string;
  inputClassName?: string;
  placeholder?: string;
  createLabel?: (query: string) => string;
}

function normalizeCityInput(value: string): string {
  return value.split(",")[0]?.trim() ?? "";
}

export function LithuanianCityField({
  location,
  cityOptions,
  onLocationChange,
  selectClassName,
  inputClassName,
  placeholder = "Pradėkite rašyti miestą ar gyvenvietę…",
  createLabel = (q) => `Sukurti / įrašyti naują: „${q}"`,
}: LithuanianCityFieldProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(() => normalizeCityInput(location));
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const presetCities = useMemo(
    () => cityOptions.filter((c) => c !== "Kita" && c !== "Visoje Lietuvoje" && c !== "Visa Lietuva"),
    [cityOptions]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return presetCities.slice(0, 20);
    return presetCities.filter((c) => c.toLowerCase().includes(q)).slice(0, 20);
  }, [presetCities, query]);

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return false;
    return presetCities.some((c) => c.toLowerCase() === q);
  }, [presetCities, query]);

  const showCreate = query.trim().length > 0 && !exactMatch;

  const listItems = showCreate
    ? [{ type: "create" as const, label: createLabel(query.trim()) }, ...filtered.map((o) => ({ type: "option" as const, label: o }))]
    : filtered.map((o) => ({ type: "option" as const, label: o }));

  useEffect(() => {
    setQuery(normalizeCityInput(location));
  }, [location]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const inputClass =
    inputClassName ??
    selectClassName ??
    "listing-form-input w-full max-w-xs border-0 border-b bg-transparent py-2 text-sm outline-none";

  const commitQuery = (value: string) => {
    const trimmed = value.trim();
    setQuery(trimmed);
    onLocationChange(trimmed);
    setOpen(false);
    setActiveIndex(-1);
  };

  const pickSuggestion = (city: string) => {
    setQuery(city);
    onLocationChange(city);
    setOpen(false);
    setActiveIndex(-1);
  };

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        placeholder={placeholder}
        className={inputClass}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          onLocationChange(next.trim());
          setOpen(true);
          setActiveIndex(-1);
        }}
        onBlur={() => {
          window.setTimeout(() => {
            commitQuery(query);
          }, 120);
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
              pickSuggestion(item.type === "create" ? query.trim() : item.label);
              return;
            }
            commitQuery(query);
            return;
          }
          if (e.key === "Escape") {
            setOpen(false);
            setActiveIndex(-1);
          }
        }}
      />
      {open && listItems.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="listing-form-suggestions absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border shadow-md"
        >
          {listItems.map((item, index) => (
            <li key={`${item.type}-${item.label}`} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                className={`listing-form-suggestion w-full px-3 py-2 text-left text-sm ${
                  item.type === "create" ? "font-semibold text-[var(--vauto-primary,#0f766e)]" : ""
                } ${index === activeIndex ? "is-active" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickSuggestion(item.type === "create" ? query.trim() : item.label)}
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
