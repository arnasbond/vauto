"use client";

import { BellRing, Radar, SendHorizonal, Sparkles } from "lucide-react";
import Link from "next/link";
import { useVauto } from "@/context/VautoContext";
import type { SmartBrokerSignal } from "@/lib/smart-broker";

interface SmartBrokerCardProps {
  signal: SmartBrokerSignal;
}

export function SmartBrokerCard({ signal }: SmartBrokerCardProps) {
  const {
    subscribeWishlist,
    isWishlistSubscribed,
    showToast,
    isAuthenticated,
    openAuthModal,
    setSearchQuery,
  } = useVauto();

  const subscribed = isWishlistSubscribed(signal.query);

  const addToWishlist = async () => {
    if (!isAuthenticated) {
      openAuthModal();
      return;
    }
    const ok = await subscribeWishlist(signal.query);
    showToast(
      ok
        ? `„${signal.query}" į pageidavimų sąrašą. Pranešime realiu laiku — paspaudę atidarysite prekę.`
        : "Leiskite pranešimus, kad gautumėte žinutę, kai atsiras skelbimas.",
      ok ? "success" : "info"
    );
  };

  return (
    <section
      id="search-empty-assistant"
      className="mb-5 rounded-2xl border border-slate-700 bg-[#1e293b] p-4 text-white shadow-lg shadow-black/20"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-600 bg-[#0f172a] text-sky-400">
          <Radar className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-400">
            Pageidavimų sąrašas
          </p>
          <h2 className="mt-1 text-base font-extrabold text-white">
            {signal.mode === "empty"
              ? "Tokios prekės dar nėra"
              : "Radome tik panašius skelbimus"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            {signal.message}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void addToWishlist()}
              disabled={subscribed}
              className="inline-flex items-center gap-1.5 rounded-full border border-sky-500 bg-[#1167b1] px-3.5 py-2 text-xs font-bold text-white disabled:opacity-70"
            >
              <BellRing className="h-3.5 w-3.5" />
              {subscribed ? "Jau stebime" : "Pranešk, kai atsiras"}
            </button>
            <Link
              href="/add"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-500 bg-[#0f172a] px-3.5 py-2 text-xs font-bold text-white hover:border-sky-500"
            >
              <SendHorizonal className="h-3.5 w-3.5" />
              Turiu tokį — įdėti
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-400">
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          Patikslinkite paiešką
        </p>
        <div className="flex flex-wrap gap-2">
          {signal.suggestedQueries.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setSearchQuery(q)}
              className="rounded-full border border-slate-600 bg-[#0f172a] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-sky-500 hover:text-white"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {signal.relatedListings.length > 0 && (
        <p className="mt-3 text-xs text-slate-400">
          Žemiau — artimiausi panašūs skelbimai.
        </p>
      )}
    </section>
  );
}
