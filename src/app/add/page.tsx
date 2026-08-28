"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Barcode, Camera, MessageCircle, Sparkles } from "lucide-react";
import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";
import { Header } from "@/components/Header";
import { HeroSection } from "@/components/HeroSection";
import { BarcodeScanSheet } from "@/components/product/BarcodeScanSheet";
import { PrePublishListingCard } from "@/components/home/PrePublishListingCard";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import { useLayoutMode } from "@/context/LayoutModeContext";
import { useBarcodeScanFlow } from "@/hooks/useBarcodeScanFlow";
import {
  MAX_CHAT_COMPOSER_ATTACHMENTS,
} from "@/lib/chat-composer-media";
import { compressForAiVision } from "@/lib/native-media";
import { applyProfileToListingDraft } from "@/lib/profile-listing-sync";
import { createManualFallbackDraft } from "@/lib/ai-safeguards";
import { transitionListingFlow } from "@/lib/listing-conversational-flow";
import type { PrePublishCardPayload } from "@/lib/pre-publish-validation";
import type { AiExtractedListing } from "@/lib/types";
import { useSellerFlow } from "@/context/SellerFlowContext";

async function filesToPendingImageUrls(files: File[]): Promise<string[]> {
  const limited = files.slice(0, MAX_CHAT_COMPOSER_ATTACHMENTS);
  const urls: string[] = [];
  for (const file of limited) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () =>
        reject(reader.error ?? new Error("FileReader failed"));
      reader.readAsDataURL(file);
    });
    const compressed = await compressForAiVision(dataUrl);
    if (compressed) urls.push(compressed);
  }
  return urls;
}

/**
 * Constitution: /add is a thin shell into the agent listing organism.
 * Fashion vertical (?vertical=fashion) only seeds clothing category — same agent SM, no dual form.
 */
function AddPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isFashion = searchParams.get("vertical") === "fashion";
  const e2eParam = searchParams.get("e2ePrepublish") ?? searchParams.get("e2e");
  const e2ePrepublish = e2eParam === "1" || e2eParam === "seed";
  const e2eSeedMode = e2eParam === "seed";
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
  const { publishListing, isPublishingListing } = useSellerFlow();
  const { applyScannedBarcode } = useBarcodeScanFlow();
  const { isDesktop } = useLayoutMode();
  const [busy, setBusy] = useState(false);
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [e2eCard, setE2eCard] = useState<PrePublishCardPayload | null>(null);
  const [e2eDraftMeta, setE2eDraftMeta] = useState<AiExtractedListing | null>(null);
  const bootstrappedRef = useRef(false);
  const e2eRanRef = useRef(false);

  useEffect(() => {
    if (!authHydrated) return;
    if (!isAuthenticated) {
      requireAuthForListing(
        isFashion
          ? "/add?vertical=fashion"
            : e2ePrepublish
            ? e2eSeedMode
              ? "/add?e2e=seed"
              : "/add?e2e=1"
            : "/add"
      );
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
        category: isFashion ? "clothing" : e2ePrepublish ? "vehicles" : base.category,
        listingFlowState: "DRAFTING_TEXT",
        ...(e2ePrepublish
          ? {
              price: 2250,
              location: "Prienai",
              attributes: { ...(base.attributes ?? {}), year: "2007", seats: "7" },
            }
          : {}),
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

    if (e2ePrepublish) {
      // Real Vision path: load public/e2e-citroen PNGs → pendingImageUrls → agent scan.
      // Or apply pre-computed seed from scripts/e2e-citroen-vision-seed.mjs
      if (e2eRanRef.current) return;
      e2eRanRef.current = true;
      setBusy(true);
      void (async () => {
        try {
          const seedMode = e2eSeedMode;
          if (seedMode) {
            const res = await fetch("/e2e-citroen/prepublish-seed.json", {
              cache: "no-store",
            });
            if (!res.ok) throw new Error(`seed missing (${res.status}) — run vision script first`);
            const seed = (await res.json()) as {
              draft: AiExtractedListing;
              reply?: string;
              coverUrl?: string;
              techPasasExcluded?: boolean;
            };
            const draft: AiExtractedListing = {
              ...seed.draft,
              listingFlowState: "AWAITING_CONFIRMATION",
            };
            applyAgentListingDraft(draft);
            setE2eDraftMeta(draft);
            setE2eCard({
              title: draft.title,
              description: draft.description,
              price: draft.price ?? 2250,
              location: draft.location || "Prienai",
              phone: draft.contact || user.phone,
              imageUrl: draft.orderedImageUrls?.[0] || seed.coverUrl || null,
              imageUrls: draft.orderedImageUrls ?? [],
              category: draft.category || "vehicles",
            });
            setOpen(true);
            showToast("E2E seed: PrePublish kortelė ant /add (Vision paleidimas).", "info");
            return;
          }

          const {
            loadE2eCitroenPendingImageUrls,
            E2E_CITROEN_LISTING_MESSAGE,
          } = await import("@/lib/e2e-citroen-prepublish-run");
          const pendingImageUrls = await loadE2eCitroenPendingImageUrls();
          router.replace("/");
          await sendAgentMessage(E2E_CITROEN_LISTING_MESSAGE, {
            pendingImageUrls,
          });
          showToast(
            `E2E: išsiųsta ${pendingImageUrls.length} nuotraukų Vision (tech pasas + auto).`,
            "info"
          );
        } catch (err) {
          showToast(
            `E2E Vision nepavyko: ${err instanceof Error ? err.message : String(err)}`,
            "error"
          );
        } finally {
          setBusy(false);
        }
      })();
      return;
    }

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
    e2ePrepublish,
    e2eSeedMode,
    requireAuthForListing,
    activateWardrobeSpinta,
    applyAgentListingDraft,
    sendAgentMessage,
    setOpen,
    user,
    router,
    showToast,
  ]);

  const photoInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (!files.length || busy) return;

      requestMediaConsent(() => {
        setBusy(true);
        void (async () => {
          try {
            const pendingImageUrls = await filesToPendingImageUrls(files);
            if (!pendingImageUrls.length) return;
            router.replace(isFashion ? "/fashion" : "/");
            setOpen(true);
            await sendAgentMessage("", { pendingImageUrls });
          } catch (err) {
            showToast(
              `Nuotraukų įkėlimas nepavyko: ${err instanceof Error ? err.message : String(err)}`,
              "error"
            );
          } finally {
            setBusy(false);
          }
        })();
      });
    },
    [
      busy,
      isFashion,
      requestMediaConsent,
      router,
      sendAgentMessage,
      setOpen,
      showToast,
    ]
  );

  const startWithPhotos = () => {
    if (busy) return;
    photoInputRef.current?.click();
  };

  const startWithText = () => {
    setOpen(true);
    router.replace(isFashion ? "/fashion" : "/");
    showToast("Tęskite skelbimą pokalbyje su asistentu.", "info");
  };

  const startWithBarcode = () => {
    if (busy) return;
    if (!requireAuthForListing(isFashion ? "/add?vertical=fashion" : "/add")) return;
    setBarcodeOpen(true);
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
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                data-vauto-photo-upload="1"
                data-vauto-photo-upload-v="2"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={handlePhotoInputChange}
              />
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
                disabled={busy}
                onClick={startWithBarcode}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--vauto-primary)]/30 bg-[var(--vauto-surface-muted)]/30 px-4 py-2.5 text-sm font-semibold text-[var(--vauto-text)] disabled:opacity-60"
              >
                <Barcode className="h-4 w-4" aria-hidden />
                Skenuoti brūkšninį kodą
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
