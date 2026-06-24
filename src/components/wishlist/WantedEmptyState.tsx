"use client";

import { Bell, Sparkles } from "lucide-react";
import { useState } from "react";
import { useVauto } from "@/context/VautoContext";
import {
  registerWanted,
  WANTED_EMPTY_MESSAGE,
} from "@/lib/matching-service";

interface WantedEmptyStateProps {
  searchQuery: string;
  borderColor?: string;
  textMuted?: string;
}

export function WantedEmptyState({
  searchQuery,
  borderColor = "#d1d5db",
  textMuted = "#6b7280",
}: WantedEmptyStateProps) {
  const { isAuthenticated, openAuthModal, subscribeWishlist, showToast } =
    useVauto();
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState(false);

  const handleRegister = async () => {
    if (busy || registered) return;
    setBusy(true);
    const ok = await registerWanted({
      query: searchQuery,
      isAuthenticated,
      openAuthModal,
      subscribeWishlist,
      onSuccess: (msg) => {
        setRegistered(true);
        showToast(msg, "success");
      },
      onError: (msg) => showToast(msg, "error"),
    });
    if (ok) setRegistered(true);
    setBusy(false);
  };

  return (
    <div
      className="rounded-2xl border border-dashed bg-white p-6 text-center"
      style={{ borderColor }}
    >
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#eef2ff] text-[#1a56db]">
        <Sparkles className="h-6 w-6" />
      </div>
      <p className="mb-2 text-sm font-medium text-[#111827]">VAUTO asistentas</p>
      <p className="mx-auto mb-4 max-w-md text-sm leading-relaxed" style={{ color: textMuted }}>
        {WANTED_EMPTY_MESSAGE}
      </p>
      <button
        type="button"
        onClick={() => void handleRegister()}
        disabled={busy || registered}
        className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#1a56db] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#1648c4] disabled:opacity-60"
      >
        <Bell className="h-4 w-4" />
        {registered
          ? "Pageidavimas įrašytas"
          : busy
            ? "Registruojama…"
            : "Įtraukti į pageidavimų sąrašą"}
      </button>
    </div>
  );
}
