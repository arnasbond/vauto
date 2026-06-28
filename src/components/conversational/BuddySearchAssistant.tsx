"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BuddyAvatar } from "@/components/conversational/BuddyAvatar";
import { BuddyQuickActions } from "@/components/conversational/BuddyQuickActions";
import {
  buildSearchBuddyMessage,
  buildSearchQuickActions,
  isBuddySearchQuery,
  type BuddyActionId,
} from "@/lib/buddy-messages";
import {
  logBuddyState,
  speakBuddyMessage,
  stopBuddySpeech,
  type BuddyState,
} from "@/lib/buddy-voice";
import { resolveListingPhone } from "@/lib/listing-display";
import { getSearchMatchStatus } from "@/lib/search-match";
import { listingPath } from "@/lib/seo";
import { chatThreadPath } from "@/lib/chat-routes";
import { useVauto } from "@/context/VautoContext";

export function BuddySearchAssistant() {
  const router = useRouter();
  const {
    searchQuery,
    rankedListings,
    user,
    searchVoiceMode,
    searchInputMode,
    startChat,
    trackListingCall,
    listings,
    subscribeWishlist,
    isWishlistSubscribed,
    showToast,
    isAuthenticated,
    openAuthModal,
    setSearchInputMode,
  } = useVauto();

  const [buddyState, setBuddyState] = useState<BuddyState>("idle");
  const [showMessage, setShowMessage] = useState(false);
  const [message, setMessage] = useState("");
  const [targetListingId, setTargetListingId] = useState<string | null>(null);
  const spokenRef = useRef("");

  const query = searchQuery.trim();
  const active = isBuddySearchQuery(query);
  const matchStatus = getSearchMatchStatus(rankedListings);
  const weakOrNone = matchStatus !== "strong";
  const subscribed = isWishlistSubscribed(query);

  useEffect(() => {
    if (!active) {
      setShowMessage(false);
      setBuddyState("idle");
      return;
    }

    const { message: msg, listing } = buildSearchBuddyMessage(
      query,
      rankedListings,
      user.city || "Lietuvoje",
      { inputMode: searchInputMode, subscribed }
    );
    setMessage(msg);
    setTargetListingId(listing?.id ?? null);
    setBuddyState("typing");
    setShowMessage(false);
    logBuddyState("typing", { context: "search_assistant", query });

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = reducedMotion ? 0 : 600;
    const shouldSpeak =
      searchVoiceMode || searchInputMode === "voice";

    const timer = setTimeout(() => {
      setShowMessage(true);
      setBuddyState("speaking");
      if (spokenRef.current !== msg) {
        spokenRef.current = msg;
        speakBuddyMessage(msg, {
          enabled: shouldSpeak,
          onEnd: () => setBuddyState("idle"),
        });
        if (!shouldSpeak) {
          setTimeout(() => setBuddyState("idle"), 400);
        }
      }
    }, delay);

    return () => {
      clearTimeout(timer);
      stopBuddySpeech();
    };
  }, [
    active,
    query,
    rankedListings,
    user.city,
    searchVoiceMode,
    searchInputMode,
    subscribed,
  ]);

  if (!active) return null;

  const listing = targetListingId
    ? rankedListings.find((l) => l.id === targetListingId) ??
      listings.find((l) => l.id === targetListingId)
    : null;

  const actions = buildSearchQuickActions(listing ?? null, {
    matchWeakOrNone: weakOrNone,
    subscribed,
  });

  const handleAction = async (id: BuddyActionId) => {
    logBuddyState("idle", { context: "search_action", action: id, listingId: listing?.id });

    if (id === "wishlist") {
      if (!isAuthenticated) {
        openAuthModal();
        return;
      }
      const ok = await subscribeWishlist(query);
      showToast(
        ok
          ? `„${query}" įtraukta į pageidavimų sąrašą. Pranešime, kai atsiras.`
          : "Leiskite pranešimus naršyklėje, kad gautumėte žinutę apie naują skelbimą.",
        ok ? "success" : "info"
      );
      return;
    }

    if (id === "refine_search") {
      setSearchInputMode(searchInputMode === "voice" ? "voice" : "text");
      document.querySelector<HTMLInputElement>('input[name="q"]')?.focus();
      return;
    }

    if (!listing) {
      if (id === "see_listings") {
        document.getElementById("listing-results")?.scrollIntoView({ behavior: "smooth" });
      }
      return;
    }

    if (id === "call_provider") {
      trackListingCall(listing.id);
      const phone = resolveListingPhone(listing);
      window.location.href = `tel:${phone.replace(/\s/g, "")}`;
      return;
    }

    if (id === "chat_provider") {
      const chatId = startChat(listing.id);
      if (chatId) router.push(chatThreadPath(chatId));
      return;
    }

    if (id === "see_listings") {
      router.push(listingPath(listing));
      return;
    }
  };

  return (
    <section className="mb-5 rounded-2xl border border-[var(--vauto-teal)]/25 bg-gradient-to-br from-[var(--vauto-teal)]/10 to-[var(--flux-indigo)]/5 p-4">
      <div className="flex gap-3">
        <BuddyAvatar state={buddyState} />
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--vauto-teal)]">
            {buddyState === "typing" ? "Ieškoma" : buddyState === "speaking" ? "Rezultatas" : "Paieškos asistentas"}
          </p>
          <div className="rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
            {!showMessage ? (
              <p className="text-sm text-slate-500">Analizuojama užklausa…</p>
            ) : (
              <p className="text-base leading-relaxed text-slate-800">{message}</p>
            )}
          </div>
          {showMessage && (
            <BuddyQuickActions actions={actions} onAction={(id) => void handleAction(id)} />
          )}
        </div>
      </div>
    </section>
  );
}
