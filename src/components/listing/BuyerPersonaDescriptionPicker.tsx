"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  BUYER_PERSONA_CARDS,
  type BuyerPersonaId,
  type BuyerPersonaVariants,
} from "@/lib/description-personas";

export function BuyerPersonaDescriptionPicker({
  variants,
  selected,
  loading,
  onSelect,
}: {
  variants?: BuyerPersonaVariants;
  selected?: BuyerPersonaId;
  loading?: boolean;
  onSelect: (persona: BuyerPersonaId, text: string) => void;
}) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#111827]">AI Chameleon — pirkėjo profiliai</p>
        {loading && (
          <span className="inline-flex items-center gap-1 text-xs text-[#6b7280]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Generuoju…
          </span>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {BUYER_PERSONA_CARDS.map((card) => {
          const text = variants?.[card.id]?.trim();
          const active = selected === card.id;
          return (
            <button
              key={card.id}
              type="button"
              disabled={!text || loading}
              onClick={() => text && onSelect(card.id, text)}
              className={cn(
                "rounded-lg border p-3 text-left transition",
                active
                  ? "border-[#111827] bg-[#f9fafb] ring-2 ring-[#111827]/10"
                  : "border-[#e5e7eb] bg-white hover:border-[#9ca3af]",
                !text && "opacity-60"
              )}
            >
              <span
                className="mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                style={{ backgroundColor: card.accent }}
              >
                {card.title}
              </span>
              <p className="text-xs text-[#6b7280]">{card.subtitle}</p>
              {text ? (
                <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-[#374151]">{text}</p>
              ) : (
                <p className="mt-2 text-xs text-[#9ca3af]">
                  {loading ? "Ruošiama…" : "Variantas dar negeneruotas"}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
