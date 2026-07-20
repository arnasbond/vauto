"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, MessageCircle, Sparkles } from "lucide-react";
import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";
import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { useLayoutMode } from "@/context/LayoutModeContext";
import { pickAndSendChatPhotos } from "@/lib/chat-photo-upload-flow";
import { applyProfileToListingDraft } from "@/lib/profile-listing-sync";
import { createManualFallbackDraft } from "@/lib/ai-safeguards";
import { transitionListingFlow } from "@/lib/listing-conversational-flow";

/**
 * Constitution: /add is a thin shell into the agent listing organism.
 * Fashion vertical (?vertical=fashion) only seeds clothing category — same agent SM, no dual form.
 */
function AddPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isFashion = searchParams.get("vertical") === "fashion";
  const {
    isAuthenticated,
    authHydrated,
    requireAuthForListing,
    requestMediaConsent,
    applyAgentListingDraft,
    activateWardrobeSpinta,
    user,
    showToast,
  } = useVauto();
  const { sendAgentMessage, setOpen } = useVautoAgent();
  const { isDesktop } = useLayoutMode();
  const [busy, setBusy] = useState(false);
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (!authHydrated) return;
    if (!isAuthenticated) {
      requireAuthForListing(isFashion ? "/add?vertical=fashion" : "/add");
      return;
    }
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    if (isFashion) activateWardrobeSpinta();

    const base = createManualFallbackDraft({
      location: user.city || "",
      contact: user.phone || "",
    });
    const seeded = applyProfileToListingDraft(
      {
        ...base,
        title: isFashion ? "Drabužių skelbimas" : "Naujas skelbimas",
        description: "",
        category: isFashion ? "clothing" : base.category,
        listingFlowState: "DRAFTING_TEXT",
      },
      user,
      true,
      { onlyIfEmpty: true }
    );
    const nextState =
      transitionListingFlow("DRAFTING_TEXT", "DRAFT_SAVED") ?? "AWAITING_PHOTOS";
    applyAgentListingDraft({
      ...seeded,
      category: isFashion ? "clothing" : seeded.category,
      listingFlowState: nextState,
    });
    setOpen(true);
    void sendAgentMessage(
      isFashion
        ? "Noriu kelti drabužių skelbimą Spintoje — naudoju profilio kontaktus. Prašau paprašyti nuotraukų."
        : "Noriu kelti skelbimą — naudoju profilio kontaktus. Prašau paprašyti nuotraukų.",
      { skipUserBubble: true }
    );
  }, [
    authHydrated,
    isAuthenticated,
    isFashion,
    requireAuthForListing,
    activateWardrobeSpinta,
    applyAgentListingDraft,
    sendAgentMessage,
    setOpen,
    user,
  ]);

  const startWithPhotos = () => {
    if (busy) return;
    pickAndSendChatPhotos({
      requestMediaConsent,
      sendAgentMessage,
      setOpen,
      navigateBeforeSend: () => {
        router.replace(isFashion ? "/fashion" : "/");
      },
      onBusyChange: setBusy,
    });
  };

  const startWithText = () => {
    setOpen(true);
    router.replace(isFashion ? "/fashion" : "/");
    showToast("Tęskite skelbimą pokalbyje su asistentu.", "info");
  };

  if (!authHydrated) {
    return (
      <VautoAdaptiveLayout>
        <div className="seller-flow-page mx-auto min-h-full w-full max-w-lg">
          <HeroSection>
            {!isDesktop && <Header />}
            <p className="mt-10 text-center text-sm text-[var(--vauto-text-muted)]">
              Kraunama…
            </p>
          </HeroSection>
        </div>
      </VautoAdaptiveLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <VautoAdaptiveLayout>
        <div className="seller-flow-page mx-auto min-h-full w-full max-w-lg">
          <HeroSection>
            {!isDesktop && <Header />}
            <h2 className="mt-6 text-center text-xl font-bold text-[var(--vauto-text-main)]">
              {isFashion ? "Spinta — naujas drabužis" : "Naujas skelbimas"}
            </h2>
            <p className="mt-3 px-6 text-center text-sm text-[var(--vauto-text-muted)]">
              Prisijunkite, kad galėtumėte kelti skelbimą per asistentą.
            </p>
          </HeroSection>
        </div>
      </VautoAdaptiveLayout>
    );
  }

  return (
    <VautoAdaptiveLayout>
      <div className="seller-flow-page mx-auto min-h-full w-full max-w-lg">
        <HeroSection>
          {!isDesktop && <Header />}
          <div className="mt-6 flex flex-col items-center gap-3 px-4 text-center">
            <Sparkles className="h-8 w-8 text-[var(--vauto-primary)]" aria-hidden />
            <h2 className="font-display text-2xl font-bold text-[var(--vauto-text-main)]">
              {isFashion ? "Kelkite drabužį pokalbyje" : "Kelkite skelbimą pokalbyje"}
            </h2>
            <p className="max-w-md text-sm text-[var(--vauto-text-muted)]">
              Miestas ir telefonas paimami iš jūsų profilio. Įkelkite iki 6 nuotraukų —
              asistentas nuskenuos vaizdą, papildys aprašymą ir parodys patvirtinimo kortelę.
            </p>
            <div className="mt-4 flex w-full max-w-sm flex-col gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={startWithPhotos}
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[var(--vauto-primary)] px-4 py-3 text-sm font-bold text-[var(--vauto-primary-contrast,#fff)] disabled:opacity-60"
              >
                <Camera className="h-4 w-4" aria-hidden />
                Įkelti nuotraukas (iki 6)
              </button>
              <button
                type="button"
                onClick={startWithText}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--vauto-primary)]/25 bg-[var(--vauto-surface-muted)]/40 px-4 py-2.5 text-sm font-semibold text-[var(--vauto-text)]"
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                Rašyti asistentui
              </button>
            </div>
          </div>
        </HeroSection>
      </div>
    </VautoAdaptiveLayout>
  );
}

export default function AddPage() {
  return (
    <Suspense
      fallback={
        <VautoAdaptiveLayout>
          <div className="seller-flow-page mx-auto min-h-full w-full max-w-lg">
            <HeroSection>
              <p className="mt-10 text-center text-sm text-[var(--vauto-text-muted)]">
                Kraunama…
              </p>
            </HeroSection>
          </div>
        </VautoAdaptiveLayout>
      }
    >
      <AddPageInner />
    </Suspense>
  );
}
