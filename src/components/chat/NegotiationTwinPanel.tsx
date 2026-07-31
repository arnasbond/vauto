"use client";

import { Bot, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import type { ChatThread } from "@/lib/types";
import {
  TWIN_TEMPLATE_CHIPS,
  twinTemplateText,
  type TwinTemplateId,
} from "@/lib/twin-templates";
import { cn } from "@/lib/cn";

const COLLAPSE_KEY = "vauto_twin_panel_collapsed_v1";

interface NegotiationTwinPanelProps {
  chat: ChatThread;
  listingPrice: number;
  listingMinNegotiationPrice?: number;
  onUpdate: (config: {
    enabled: boolean;
    minPrice: number;
    sellerApproved: boolean;
    sellerConsentAt?: string;
    maxDiscountPercent?: number;
  }) => void;
  onSendTemplate?: (templateId: TwinTemplateId, text: string) => void;
}

function readCollapsedPreference(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = sessionStorage.getItem(COLLAPSE_KEY);
    if (raw === "0") return false;
    if (raw === "1") return true;
  } catch {
    /* ignore */
  }
  // Mobile-first: start collapsed so the message list keeps the viewport.
  return window.matchMedia("(max-width: 767px)").matches;
}

export function NegotiationTwinPanel({
  chat,
  listingPrice,
  listingMinNegotiationPrice,
  onUpdate,
  onSendTemplate,
}: NegotiationTwinPanelProps) {
  const twin = chat.negotiationTwin;
  const defaultMin =
    twin?.minPrice ??
    listingMinNegotiationPrice ??
    Math.max(1, Math.round(listingPrice * 0.85));
  const [minPrice, setMinPrice] = useState(defaultMin);
  const [sellerApproved, setSellerApproved] = useState(twin?.sellerApproved ?? false);
  const [sellerConsent, setSellerConsent] = useState(Boolean(twin?.sellerConsentAt));
  const [collapsed, setCollapsed] = useState(true);
  const enabled = twin?.enabled ?? false;

  useEffect(() => {
    setCollapsed(readCollapsedPreference());
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const save = (nextEnabled: boolean) => {
    onUpdate({
      enabled: nextEnabled,
      minPrice,
      sellerApproved: nextEnabled ? sellerApproved : false,
      sellerConsentAt:
        nextEnabled && sellerConsent && sellerApproved
          ? twin?.sellerConsentAt ?? new Date().toISOString()
          : undefined,
    });
  };

  return (
    <div className="mb-2 shrink-0 overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/30">
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-emerald-100/60 dark:hover:bg-emerald-900/40"
      >
        <Bot className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-emerald-900 dark:text-emerald-100">
            AI dvynys
          </span>
          <span className="block truncate text-[11px] text-emerald-800 dark:text-emerald-200">
            {enabled ? "Aktyvus · šabloniniai atsakymai" : "Išjungtas · bakstelėkite nustatymams"}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-emerald-700 transition-transform dark:text-emerald-300",
            !collapsed && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {!collapsed ? (
        <div className="max-h-[40dvh] space-y-2 overflow-y-auto border-t border-emerald-200/80 px-3 pb-3 pt-2 dark:border-emerald-800/80">
          <p className="text-[11px] leading-relaxed text-emerald-800 dark:text-emerald-200">
            Tik trys atsakymai: ar dar aktualu, kainos riba, arba perdavimas žmogui.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-emerald-900 dark:text-emerald-100">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => save(e.target.checked)}
                className="accent-emerald-600"
              />
              Aktyvuoti
            </label>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
                Min.
              </span>
              <input
                type="number"
                min={1}
                max={listingPrice}
                value={minPrice}
                onChange={(e) => setMinPrice(Number(e.target.value) || 1)}
                className="w-16 rounded-lg border border-emerald-200 bg-[var(--vauto-surface)] px-2 py-1 text-xs text-[var(--vauto-text)] dark:border-emerald-700"
              />
              <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
                €
              </span>
            </div>
          </div>
          <label className="flex items-start gap-1.5 text-[11px] text-emerald-900 dark:text-emerald-100">
            <input
              type="checkbox"
              checked={sellerApproved}
              onChange={(e) => setSellerApproved(e.target.checked)}
              className="mt-0.5 accent-emerald-600"
            />
            Leidžiu šabloninius atsakymus šiame pokalbyje
          </label>
          <label className="flex items-start gap-1.5 text-[11px] text-emerald-900 dark:text-emerald-100">
            <input
              type="checkbox"
              checked={sellerConsent}
              onChange={(e) => setSellerConsent(e.target.checked)}
              className="mt-0.5 accent-emerald-600"
            />
            Sutinku, kad AI dvynys atsakytų pirkėjams mano vardu tik šiais šablonais
          </label>
          <button
            type="button"
            onClick={() => save(true)}
            disabled={!sellerApproved || !sellerConsent}
            className="rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
          >
            Išsaugoti
          </button>
          {onSendTemplate ? (
            <div className="flex flex-wrap gap-1.5">
              {TWIN_TEMPLATE_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() =>
                    onSendTemplate(chip.id, twinTemplateText(chip.id, minPrice))
                  }
                  className="rounded-full border border-emerald-300 bg-[var(--vauto-surface)] px-2.5 py-1 text-[11px] font-medium text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-100"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
