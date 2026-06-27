"use client";

import { Bot } from "lucide-react";
import { useState } from "react";
import type { ChatThread } from "@/lib/types";

interface NegotiationTwinPanelProps {
  chat: ChatThread;
  listingPrice: number;
  onUpdate: (config: { enabled: boolean; minPrice: number }) => void;
}

export function NegotiationTwinPanel({
  chat,
  listingPrice,
  onUpdate,
}: NegotiationTwinPanelProps) {
  const twin = chat.negotiationTwin;
  const [minPrice, setMinPrice] = useState(
    twin?.minPrice ?? Math.max(1, Math.round(listingPrice * 0.85))
  );
  const enabled = twin?.enabled ?? false;

  return (
    <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
      <div className="flex items-start gap-2">
        <Bot className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
        <div className="flex-1">
          <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">
            Derybų dvynys (AI)
          </p>
          <p className="mt-0.5 text-[11px] text-emerald-800 dark:text-emerald-200">
            Nustatyk minimalią kainą — asistentas derasi fone, kol tu užsiėmusi.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-emerald-900">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => onUpdate({ enabled: e.target.checked, minPrice })}
                className="accent-emerald-600"
              />
              Aktyvuoti
            </label>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-emerald-700">Min.</span>
              <input
                type="number"
                min={1}
                max={listingPrice}
                value={minPrice}
                onChange={(e) => setMinPrice(Number(e.target.value) || 1)}
                className="w-16 rounded-lg border border-emerald-200 bg-white px-2 py-1 text-xs"
              />
              <span className="text-[11px] text-emerald-700">€</span>
            </div>
            <button
              type="button"
              onClick={() => onUpdate({ enabled: true, minPrice })}
              className="rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white"
            >
              Išsaugoti
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
