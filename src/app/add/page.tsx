"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Barcode, Camera, Loader2, MessageCircle, Sparkles } from "lucide-react";
import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";
import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { BarcodeScanSheet } from "@/components/product/BarcodeScanSheet";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { useBarcodeScanFlow } from "@/hooks/useBarcodeScanFlow";
import { pickAndSendChatPhotos } from "@/lib/chat-photo-upload-flow";
import { applyProfileToListingDraft } from "@/lib/profile-listing-sync";
import { createManualFallbackDraft } from "@/lib/ai-safeguards";
import { transitionListingFlow } from "@/lib/listing-conversational-flow";

/**
 * Constitution: /add is a thin shell into the agent listing organism.
 * Fashion vertical (?vertical=fashion) only seeds clothing category — same agent SM, no dual form.
 *
 * Auth hydrate must never blank the page into an unstyled "Kraunama…" freeze —
 * always paint the full VAUTO shell; gate actions until auth is ready.
 * Avoid viewport-gated branches here — they hydrate-mismatch against SSR.
 */
function AddSellerShell({
  isFashion,
  busy,
  actionsDisabled,
  statusHint,
  onPhotos,
  onBarcode,
  onText,
}: {
  isFashion: boolean;
  busy: boolean;
  actionsDisabled: boolean;
  statusHint?: string | null;
  onPhotos: () => void;
  onBarcode: () => void;
  onText: () => void;
}) {
  const disabled = busy || actionsDisabled;

  return (
    <VautoAdaptiveLayout>
      <div className="seller-flow-page mx-auto min-h-full w-full max-w-lg">
        <HeroSection>
          <div className="md:hidden">
            <Header />
          </div>
          <div className="mt-6 flex flex-col items-center gap-3 px-4 text-center">
            <Sparkles className="h-8 w-8 text-[var(--vauto-primary)]" aria-hidden />
            <h2 className="font-display text-2xl font-bold text-[var(--vauto-text-main)]">
              {isFashion ? "Kelkite drabužį pokalbyje" : "Kelkite skelbimą pokalbyje"}
            </h2>
            <p className="max-w-md text-sm text-[var(--vauto-text-muted)]">
              Miestas ir telefonas paimami iš jūsų profilio. Įkelkite iki 6 nuotraukų —
              asistentas nuskenuos vaizdą, papildys aprašymą ir parodys patvirtinimo kortelę.
            </p>
            {statusHint ? (
              <p
                className="flex items-center gap-2 text-xs font-medium text-[var(--vauto-text-muted)]"
                role="status"
                aria-live="polite"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--vauto-primary)]" aria-hidden />
                {statusHint}
              </p>
            ) : null}
            <div className="mt-4 flex w-full max-w-sm flex-col gap-2">
              <button
                type="button"
                disabled={disabled}
                onClick={onPhotos}
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[var(--vauto-primary)] px-4 py-3 text-sm font-bold text-[var(--vauto-primary-contrast,#fff)] disabled:opacity-60"
              >
                <Camera className="h-4 w-4" aria-hidden />
                Įkelti nuotraukas (iki 6)
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={onBarcode}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--vauto-primary)]/30 bg-[var(--vauto-surface-muted)]/30 px-4 py-2.5 text-sm font-semibold text-[var(--vauto-text)] disabled:opacity-60"
              >
                <Barcode className="h-4 w-4" aria-hidden />
                Skenuoti brūkšninį kodą
              </button>
              <button
                type="button"
                disabled={actionsDisabled}
                onClick={onText}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--vauto-primary)]/25 bg-[var(--vauto-surface-muted)]/40 px-4 py-2.5 text-sm font-semibold text-[var(--vauto-text)] disabled:opacity-60"
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
  const { sendAgentMessage, setOpen, beginFreshListingChatSession } = useVautoAgent();
  const { applyScannedBarcode } = useBarcodeScanFlow();
  const [busy, setBusy] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (!authHydrated) return;
    if (!isAuthenticated) {
      requireAuthForListing(isFashion ? "/add?vertical=fashion" : "/add");
      return;
    }
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    beginFreshListingChatSession();
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
        orderedImageUrls: [],
        attributes: {},
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
      orderedImageUrls: [],
    });
    setOpen(true);
    void sendAgentMessage(
      isFashion
        ? "Noriu kelti drabužių skelbimą Spintoje — naudoju profilio kontaktus. Prašau paprašyti nuotraukų."
        : "Noriu kelti skelbimą — naudoju profilio kontaktus. Prašau paprašyti nuotraukų.",
      { skipUserBubble: true, omitPriorListingDraft: true, freshListingSession: true }
    );
  }, [
    authHydrated,
    isAuthenticated,
    isFashion,
    requireAuthForListing,
    activateWardrobeSpinta,
    applyAgentListingDraft,
    beginFreshListingChatSession,
    sendAgentMessage,
    setOpen,
    user,
  ]);

  const startWithPhotos = () => {
    if (busy) return;
    if (!authHydrated) return;
    if (!requireAuthForListing(isFashion ? "/add?vertical=fashion" : "/add")) return;
    beginFreshListingChatSession();
    pickAndSendChatPhotos({
      requestMediaConsent,
      sendAgentMessage,
      setOpen,
      freshListingSession: true,
      // Vision OCR instructions live server-side — never show them as a user bubble.
      skipUserBubble: true,
      navigateBeforeSend: () => {
        router.replace(isFashion ? "/fashion" : "/");
      },
      onBusyChange: setBusy,
      text: "",
    });
  };

  const startWithText = () => {
    if (!authHydrated) return;
    if (!requireAuthForListing(isFashion ? "/add?vertical=fashion" : "/add")) return;
    beginFreshListingChatSession();
    setOpen(true);
    router.replace(isFashion ? "/fashion" : "/");
    showToast("Tęskite skelbimą pokalbyje su asistentu.", "info");
  };

  const startWithBarcode = () => {
    if (busy) return;
    if (!authHydrated) return;
    if (!requireAuthForListing(isFashion ? "/add?vertical=fashion" : "/add")) return;
    setBarcodeOpen(true);
  };

  // Always paint the full styled shell — never a blank "Kraunama…" body.
  if (!authHydrated) {
    return (
      <AddSellerShell
        isFashion={isFashion}
        busy={false}
        actionsDisabled
        statusHint="Jungiamasi…"
        onPhotos={startWithPhotos}
        onBarcode={startWithBarcode}
        onText={startWithText}
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <VautoAdaptiveLayout>
        <div className="seller-flow-page mx-auto min-h-full w-full max-w-lg">
          <HeroSection>
            <Header />
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
    <>
      <AddSellerShell
        isFashion={isFashion}
        busy={busy}
        actionsDisabled={false}
        onPhotos={startWithPhotos}
        onBarcode={startWithBarcode}
        onText={startWithText}
      />
      <BarcodeScanSheet
        open={barcodeOpen}
        onClose={() => setBarcodeOpen(false)}
        onBarcodeResolved={(code) =>
          void applyScannedBarcode(code, {
            fashion: isFashion,
            category: isFashion ? "clothing" : "other",
          })
        }
        title="Skenuoti brūkšninį kodą"
        subtitle="Nufotografuokite kodą arba įveskite EAN/UPC ranka — asistentas tęs skelbimą pokalbyje."
      />
    </>
  );
}

export default function AddPage() {
  return (
    <Suspense
      fallback={
        <AddSellerShell
          isFashion={false}
          busy={false}
          actionsDisabled
          statusHint="Jungiamasi…"
          onPhotos={() => undefined}
          onBarcode={() => undefined}
          onText={() => undefined}
        />
      }
    >
      <AddPageInner />
    </Suspense>
  );
}
