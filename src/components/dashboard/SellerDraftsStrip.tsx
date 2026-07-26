"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Trash2 } from "lucide-react";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import {
  listMultiListingDrafts,
  MAX_MULTI_LISTING_DRAFTS,
  removeMultiListingDraft,
  type MultiListingDraftEntry,
} from "@/lib/listing-draft-storage";
import { pushAgentGreeting } from "@/lib/vauto-agent-client";

export function SellerDraftsStrip() {
  const router = useRouter();
  const { applyAgentListingDraft } = useSellerFlow();
  const { revealPrePublishCard } = useVautoAgent();
  const [drafts, setDrafts] = useState<MultiListingDraftEntry[]>([]);

  const refresh = useCallback(() => {
    setDrafts(listMultiListingDrafts());
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  if (drafts.length === 0) return null;

  return (
    <section
      className="vauto-dashboard-card mb-4 rounded-2xl p-4"
      data-seller-drafts="1"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Juodraščiai ({drafts.length}/{MAX_MULTI_LISTING_DRAFTS})
        </h2>
        <p className="text-[11px] text-slate-400">Tęskite per agentą</p>
      </div>
      <ul className="space-y-2">
        {drafts.map((entry) => (
          <li
            key={entry.id}
            className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-200">
              {entry.previewImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={entry.previewImage}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <FileText className="h-4 w-4 text-slate-500" aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">
                {entry.draft.title || "Be pavadinimo"}
              </p>
              <p className="truncate text-[11px] text-slate-500">
                {entry.draft.price > 0
                  ? `${entry.draft.price} €`
                  : "Kaina nenurodyta"}
                {entry.draft.location ? ` · ${entry.draft.location}` : ""}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-full bg-[var(--vauto-teal)] px-3 py-1.5 text-[11px] font-bold text-white"
              onClick={() => {
                applyAgentListingDraft(
                  {
                    ...entry.draft,
                    listingFlowState: "AWAITING_CONFIRMATION",
                  },
                  entry.previewImage ?? undefined
                );
                revealPrePublishCard();
                pushAgentGreeting(
                  `Tęsiame juodraštį „${entry.draft.title || "skelbimas"}“. Patikrinkite PrePublish ir publikuokite.`,
                  { openSheet: true, replaceThread: false }
                );
                router.push("/");
              }}
            >
              Tęsti
            </button>
            <button
              type="button"
              className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              aria-label="Ištrinti juodraštį"
              onClick={() => {
                removeMultiListingDraft(entry.id);
                refresh();
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
