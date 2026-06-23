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
    <section className="mb-5 rounded-2xl border border-[#bfdbfe] bg-[#eef6ff] p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#1167b1] shadow-sm">
          <Radar className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#1167b1]">
            Pageidavimų sąrašas
          </p>
          <h2 className="mt-1 text-base font-extrabold text-[#111827]">
            {signal.mode === "empty"
              ? "Tokios prekės dar nėra"
              : "Radome tik panašius skelbimus"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[#4b5563]">
            {signal.message}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void addToWishlist()}
              disabled={subscribed}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#1167b1] px-3.5 py-2 text-xs font-bold text-white disabled:opacity-70"
            >
              <BellRing className="h-3.5 w-3.5" />
              {subscribed ? "Jau stebime" : "Pranešk, kai atsiras"}
            </button>
            <Link
              href="/add"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#f97316] bg-white px-3.5 py-2 text-xs font-bold text-[#f97316]"
            >
              <SendHorizonal className="h-3.5 w-3.5" />
              Turiu tokį — įdėti
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#6b7280]">
          <Sparkles className="h-3.5 w-3.5 text-[#f97316]" />
          Patikslinkite paiešką
        </p>
        <div className="flex flex-wrap gap-2">
          {signal.suggestedQueries.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setSearchQuery(q)}
              className="rounded-full border border-[#d7dde5] bg-white px-3 py-1.5 text-xs font-semibold text-[#374151] hover:border-[#1167b1]/40"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {signal.relatedListings.length > 0 && (
        <p className="mt-3 text-xs text-[#6b7280]">
          Žemiau — artimiausi panašūs skelbimai.
        </p>
      )}
    </section>
  );
}
