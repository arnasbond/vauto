"use client";

import { Bell, Sparkles } from "lucide-react";
import { useState } from "react";
import { useVauto } from "@/context/VautoContext";
import {
  buildEmptySearchWishlistMessage,
  EMPTY_SEARCH_WISHLIST_CHIP,
  registerWanted,
} from "@/lib/matching-service";

interface WantedEmptyStateProps {
  searchQuery: string;
  borderColor?: string;
  textMuted?: string;
  /** 21D-3 — zero-result recovery: clear restrictive criteria to broaden the search. */
  onBroaden?: () => void;
}

export function WantedEmptyState({
  searchQuery,
  borderColor = "var(--vauto-border-input)",
  textMuted = "var(--vauto-text-muted)",
  onBroaden,
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
      className="rounded-2xl border border-dashed bg-[var(--vauto-card-bg)] p-6 text-center"
      style={{ borderColor }}
    >
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ds-brand-soft)] text-[var(--ds-brand)]">
        <Sparkles className="h-6 w-6" />
      </div>
      <p className="mb-2 text-sm font-medium text-[var(--vauto-text-heading)]">VAUTO asistentas</p>
      <p className="mx-auto mb-4 max-w-md whitespace-pre-line text-sm leading-relaxed" style={{ color: textMuted }}>
        {buildEmptySearchWishlistMessage(searchQuery)}
      </p>
      <button
        type="button"
        onClick={() => void handleRegister()}
        disabled={busy || registered}
        className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[var(--ds-brand)] px-5 py-3 text-sm font-semibold text-[var(--ds-brand-contrast)] transition hover:bg-[var(--ds-brand-hover)] disabled:opacity-60"
      >
        <Bell className="h-4 w-4" />
        {registered
          ? "Laukiame šio daikto!"
          : busy
            ? "Išsaugoma…"
            : EMPTY_SEARCH_WISHLIST_CHIP}
      </button>
      {onBroaden && (
        <button
          type="button"
          onClick={onBroaden}
          className="mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--vauto-border-input)] px-4 py-2.5 text-sm font-medium text-[var(--vauto-text-heading)] transition hover:bg-[var(--vauto-surface-page)]"
        >
          Platesnė paieška
        </button>
      )}
    </div>
  );
}
