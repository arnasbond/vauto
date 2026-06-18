"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { formatPrice } from "@/data/mockListings";
import type { AiExtractedListing } from "@/lib/types";

type BaseKey = "title" | "price" | "location" | "contact" | "description";

interface BaseFieldsEditorProps {
  draft: AiExtractedListing;
  fields: BaseKey[];
  needsPrice: boolean;
  onUpdate: (patch: Partial<AiExtractedListing>) => void;
  variant?: "default" | "compact";
}

export function BaseFieldsEditor({
  draft,
  fields,
  needsPrice,
  onUpdate,
  variant = "default",
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
