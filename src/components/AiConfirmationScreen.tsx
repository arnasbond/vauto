"use client";

import { Check, Pencil, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { formatPrice } from "@/data/mockListings";
import { useVauto } from "@/context/VautoContext";
import { hasOpenAiKey } from "@/lib/openai-settings";

type EditableField = "title" | "price" | "location" | "contact" | null;

/**
 * AI Confirmation Screen — shows extracted fields with inline [Edit] for each.
 * Appears after the 1.5s processing delay.
 */
export function AiConfirmationScreen() {
  const {
    sellerStep,
    aiDraft,
    sellerPreviewImage,
    updateAiDraft,
    publishListing,
    cancelSellerFlow,
  } = useVauto();
  const [editing, setEditing] = useState<EditableField>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    if (
      sellerStep === "confirmation" &&
      aiDraft &&
      aiDraft.price <= 0 &&
      editing !== "price"
    ) {
      setEditing("price");
      setEditValue("");
    }
  }, [sellerStep, aiDraft, editing]);

  if (sellerStep === "published") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="mx-6 rounded-3xl bg-[#1e293b] p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
            <Check className="h-8 w-8 text-green-400" />
          </div>
          <h2 className="text-lg font-semibold text-white">Skelbimas paskelbtas!</h2>
        </div>
      </div>
    );
  }

  if (sellerStep !== "confirmation" || !aiDraft) return null;

  const needsPrice = aiDraft.price <= 0;

  const fields: {
    key: "title" | "price" | "location" | "contact";
    label: string;
    display: string;
    raw: string | number;
  }[] = [
    { key: "title", label: "Pavadinimas", display: aiDraft.title, raw: aiDraft.title },
    {
      key: "price",
      label: "Kaina",
      display: formatPrice(aiDraft.price),
      raw: aiDraft.price,
    },
    {
      key: "location",
      label: "Vieta",
      display: aiDraft.location,
      raw: aiDraft.location,
    },
    {
      key: "contact",
      label: "Kontaktai",
      display: aiDraft.contact,
      raw: aiDraft.contact,
    },
  ];

  const startEdit = (key: EditableField, raw: string | number) => {
    setEditing(key);
    setEditValue(String(raw));
  };

  const saveEdit = () => {
    if (!editing) return;
    if (editing === "price") {
      updateAiDraft({ price: Number(editValue) || 0 });
    } else {
      updateAiDraft({ [editing]: editValue });
    }
    setEditing(null);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-[#1e293b] p-6 shadow-2xl sm:rounded-3xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-white">AI patvirtinimas</h2>
              {hasOpenAiKey() && (
                <span className="flex items-center gap-1 rounded-full bg-[var(--vauto-teal)]/20 px-2 py-0.5 text-[10px] font-medium text-[var(--vauto-teal)]">
                  <Sparkles className="h-3 w-3" />
                  GPT-4o
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Patikrinkite ištrauktus duomenis · pasitikėjimas{" "}
              {Math.round(aiDraft.confidence * 100)}%
            </p>
            {needsPrice && (
              <p className="mt-1 text-xs text-amber-400">
                Matome prekę — įveskite kainą žemiau
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={cancelSellerFlow}
            className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="Atšaukti"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {sellerPreviewImage && (
          <div className="mb-4 overflow-hidden rounded-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sellerPreviewImage}
              alt="Jūsų nuotrauka"
              className="h-40 w-full object-cover"
            />
          </div>
        )}

        <div className="space-y-3">
          {fields.map((field) => (
            <div
              key={field.key}
              className="rounded-xl bg-white/5 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-400">{field.label}</p>
                  {editing === field.key ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                      className="mt-1 w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-[var(--vauto-teal)]"
                    />
                  ) : (
                    <p
                      className={`mt-0.5 font-medium ${
                        field.key === "price" && needsPrice
                          ? "text-amber-300"
                          : "text-white"
                      }`}
                    >
                      {field.key === "price" && needsPrice
                        ? "Įveskite kainą..."
                        : field.display}
                    </p>
                  )}
                </div>
                {editing === field.key ? (
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
                    onClick={() => startEdit(field.key, field.raw)}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/20"
                  >
                    <Pencil className="h-3 w-3" />
                    Redaguoti
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={publishListing}
          disabled={needsPrice}
          className="mt-6 w-full rounded-2xl bg-[var(--vauto-orange)] py-4 text-sm font-semibold text-white shadow-lg transition hover:bg-[var(--vauto-orange-light)] disabled:opacity-50"
        >
          {needsPrice ? "Įveskite kainą" : "Taip, viskas gerai — Publikuoti"}
        </button>
      </div>
    </div>
  );
}
