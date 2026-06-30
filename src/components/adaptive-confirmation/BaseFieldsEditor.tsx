"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { AiFilledBadge } from "@/components/buddy/AiFilledBadge";
import { formatPrice } from "@/data/mockListings";
import type { AiExtractedListing } from "@/lib/types";

type BaseKey = "title" | "price" | "location" | "contact" | "description";

interface BaseFieldsEditorProps {
  draft: AiExtractedListing;
  fields: BaseKey[];
  needsPrice: boolean;
  onUpdate: (patch: Partial<AiExtractedListing>) => void;
  variant?: "default" | "compact" | "inline";
  appearance?: "dark" | "light";
  showAiFilled?: boolean;
  aiFilledKeys?: ReadonlySet<string>;
}

export function BaseFieldsEditor({
  draft,
  fields,
  needsPrice,
  onUpdate,
  variant = "default",
  appearance = "dark",
  showAiFilled = false,
  aiFilledKeys,
}: BaseFieldsEditorProps) {
  const [editing, setEditing] = useState<BaseKey | null>(null);
  const [editValue, setEditValue] = useState("");

  const labels: Record<BaseKey, string> = {
    title: "Pavadinimas",
    price: "Kaina",
    location: "Vieta",
    contact: "Kontaktai",
    description: "Aprašymas",
  };

  const display = (key: BaseKey): string => {
    if (key === "price") return formatPrice(draft.price);
    if (key === "description") return draft.description ?? "";
    return String(draft[key] ?? "");
  };

  const startEdit = (key: BaseKey) => {
    setEditing(key);
    if (key === "price") setEditValue(draft.price > 0 ? String(draft.price) : "");
    else if (key === "description") setEditValue(draft.description ?? "");
    else setEditValue(String(draft[key] ?? ""));
  };

  const saveEdit = () => {
    if (!editing) return;
    if (editing === "price") onUpdate({ price: Number(editValue) || 0 });
    else if (editing === "description") onUpdate({ description: editValue });
    else onUpdate({ [editing]: editValue });
    setEditing(null);
  };

  const inputClass =
    appearance === "light"
      ? "mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900 outline-none placeholder:text-slate-500 focus:border-[var(--vauto-primary)]"
      : "mt-1 w-full rounded-xl border border-white/5 bg-white/5 p-3 text-sm text-white outline-none focus:border-[var(--vauto-teal)]";

  const inlineLabelClass =
    appearance === "light"
      ? "text-xs font-semibold text-slate-800"
      : "text-xs text-white/60";

  if (variant === "inline") {
    return (
      <div className="flex flex-col gap-4">
        {fields.map((key) => {
          if (key === "description") {
            return (
              <div key={key}>
                <label className={inlineLabelClass}>
                  {labels[key]}
                  {showAiFilled && aiFilledKeys?.has(key) && (
                    <AiFilledBadge visible />
                  )}
                </label>
                <textarea
                  value={draft.description ?? ""}
                  onChange={(e) => onUpdate({ description: e.target.value })}
                  rows={3}
                  className={inputClass}
                />
              </div>
            );
          }

          if (key === "price") {
            return (
              <div key={key}>
                <label className={inlineLabelClass}>
                  Kaina (€){draft.priceLabel ? ` · ${draft.priceLabel}` : ""}
                  {showAiFilled && aiFilledKeys?.has("price") && (
                    <AiFilledBadge visible />
                  )}
                </label>
                <input
                  type="number"
                  value={draft.price > 0 ? draft.price : ""}
                  onChange={(e) =>
                    onUpdate({ price: parseInt(e.target.value, 10) || 0 })
                  }
                  placeholder={needsPrice ? "Įveskite kainą" : undefined}
                  className={`${inputClass} ${needsPrice ? "border-amber-400/40" : ""}`}
                />
              </div>
            );
          }

          return (
            <div key={key}>
              <label className={inlineLabelClass}>
                {labels[key]}
                {showAiFilled && aiFilledKeys?.has(key) && (
                  <AiFilledBadge visible />
                )}
              </label>
              <input
                type="text"
                value={String(draft[key] ?? "")}
                onChange={(e) => onUpdate({ [key]: e.target.value })}
                className={inputClass}
              />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={variant === "compact" ? "space-y-2" : "space-y-3"}>
      {fields.map((key) => (
        <div
          key={key}
          className="rounded-xl bg-white/5 p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-400">{labels[key]}</p>
              {editing === key ? (
                key === "description" ? (
                  <textarea
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white outline-none"
                  />
                ) : (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                    className="mt-1 w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white outline-none"
                  />
                )
              ) : (
                <p
                  className={`mt-0.5 font-medium ${
                    key === "price" && needsPrice ? "text-amber-300" : "text-white"
                  }`}
                >
                  {key === "price" && needsPrice
                    ? "Įveskite kainą..."
                    : display(key) || "—"}
                </p>
              )}
            </div>
            {editing === key ? (
              <button
                type="button"
                onClick={saveEdit}
                className="shrink-0 rounded-lg bg-[var(--vauto-teal)] px-3 py-1.5 text-xs font-medium text-white"
              >
                OK
              </button>
            ) : (
              <button
                type="button"
                onClick={() => startEdit(key)}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-slate-300"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
