"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, PartyPopper, Plus, Sparkles } from "lucide-react";
import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";
import { HeroSection } from "@/components/HeroSection";
import { SellerListingSteps } from "@/components/home/SellerListingSteps";
import { HomeCategoryGrid } from "@/components/home/HomeCategoryGrid";
import { CategorySchemaPreview } from "@/components/marketplace/CategorySchemaPreview";
import { PrePublishModal, type PrePublishFieldPatch } from "@/components/home/PrePublishModal";
import { useVauto } from "@/context/VautoContext";
import { useAuth } from "@/context/AuthContext";
import { useSellerFlow } from "@/context/SellerFlowContext";
import { buildManualEditCardPayload, evaluatePrePublishReadiness } from "@/lib/pre-publish-validation";
import { buildAiSellerListingSeed } from "@/lib/start-ai-seller-listing";
import { buildPublishValidationToast } from "@/lib/listing-conversational-flow";
import { capListingGalleryUrls } from "@vauto/shared/listing-photo-policy";
import { filterSessionListingImages } from "@/lib/listing-image";
import { parseDocumentUrlsFromAttributes } from "@/lib/listing-gallery-roles";
import { listingPath } from "@/lib/seo";
import type { Listing, ListingCategory } from "@/lib/types";
import type { PrePublishVisibilityId } from "@/lib/listing-publish-visibility";
import {
  addListingReturnPath,
  getVertical,
  parseAddListingSearch,
  resolveVerticalId,
} from "@vauto/shared/marketplace-domain";

/**
 * R5 final — /add is a STANDALONE manual listing path. Signed-in users get a
 * simple manual form (photos/title/price+negotiable/location/description/
 * contact) published through the shared `publishListing` pipeline — no LLM, no
 * agent chat. Guests see a login-gated entry; the AI assistant remains an
 * optional helper reachable from the home command bar, never a mandatory step.
 */

function AddShell({ children }: { children: React.ReactNode }) {
  return (
    <VautoAdaptiveLayout>
      <div className="seller-flow-page mx-auto min-h-full w-full max-w-lg px-4 py-6">
        {children}
      </div>
    </VautoAdaptiveLayout>
  );
}

function LoadingShell() {
  return (
    <AddShell>
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--vauto-primary)]" aria-hidden />
        <p className="text-sm text-[var(--vauto-text-muted)]">Ruošiame formą…</p>
      </div>
    </AddShell>
  );
}

function PublishedView({
  listing,
  onOpen,
  onPublishAnother,
}: {
  listing: Listing;
  onOpen: () => void;
  onPublishAnother: () => void;
}) {
  return (
    <AddShell>
      <div className="flex flex-col items-center gap-4 py-12 text-center" data-manual-add-published="1">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--vauto-primary)]/12">
          <PartyPopper className="h-8 w-8 text-[var(--vauto-primary)]" aria-hidden />
        </span>
        <h1 className="font-display text-2xl font-bold text-[var(--vauto-text-main)]">
          Skelbimas publikuotas!
        </h1>
        <p className="max-w-sm text-sm leading-relaxed text-[var(--vauto-text-muted)]">
          „{listing.title}“ jau matomas prekyvietėje ir randamas paieškoje.
        </p>
        <div className="flex w-full max-w-xs flex-col gap-2">
          <button
            type="button"
            data-manual-add-open-listing
            onClick={onOpen}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-[var(--vauto-primary,#10b981)] px-5 text-sm font-bold text-white"
          >
            Atidaryti skelbimą
          </button>
          <button
            type="button"
            onClick={onPublishAnother}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--ds-border-strong)] bg-[var(--ds-surface-card)] px-5 text-sm font-bold text-[var(--ds-text-primary)]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Paskelbti kitą skelbimą
          </button>
        </div>
      </div>
    </AddShell>
  );
}

export default function AddPage() {
  const router = useRouter();
  const { isAuthenticated, authHydrated, requireAuthForListing, showToast, buyerCoords } =
    useVauto();
  const { user } = useAuth();
  const {
    aiDraft,
    sellerPreviewImage,
    publishListing,
    isPublishingListing,
    updateAiDraft,
    updateSellerMedia,
    applyAgentListingDraft,
    finishPublishedFlow,
  } = useSellerFlow();

  const [isFashion, setIsFashion] = useState(false);
  const [selectedVertical, setSelectedVertical] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [queryVertical, setQueryVertical] = useState<string | null>(null);
  const [describeText, setDescribeText] = useState("");
  const seededRef = useRef(false);
  const [publishedListing, setPublishedListing] = useState<Listing | null>(null);
  const selectedVerticalId = resolveVerticalId(selectedSlug || queryVertical);

  useEffect(() => {
    try {
      const parsed = parseAddListingSearch(window.location.search);
      setIsFashion(parsed.isFashion);
      setQueryVertical(parsed.uiSlug);
      if (parsed.verticalId && parsed.uiSlug) {
        setSelectedSlug(parsed.uiSlug);
        setSelectedVertical(getVertical(parsed.verticalId).label);
      }
    } catch {
      setIsFashion(false);
    }
  }, []);

  // Seed a deterministic empty draft exactly once per authenticated visit.
  useEffect(() => {
    if (!authHydrated || !isAuthenticated) return;
    if (seededRef.current) return;
    seededRef.current = true;
    if (!aiDraft) {
      applyAgentListingDraft(
        buildAiSellerListingSeed(user, { fashion: isFashion }),
        undefined,
        "manual",
        { replaceSession: true }
      );
    }
  }, [authHydrated, isAuthenticated, aiDraft, user, isFashion, applyAgentListingDraft]);

  const readiness = useMemo(() => {
    if (!authHydrated || !aiDraft) return null;
    return evaluatePrePublishReadiness({
      isAuthenticated,
      user,
      draft: aiDraft,
      previewImage: sellerPreviewImage,
      pendingImageUrls: [],
      orderedImageUrls: aiDraft.orderedImageUrls,
      geoCoords: buyerCoords,
    });
  }, [authHydrated, aiDraft, isAuthenticated, user, sellerPreviewImage, buyerCoords]);

  const card = useMemo(() => {
    if (!readiness || !aiDraft) return null;
    return buildManualEditCardPayload(readiness, sellerPreviewImage, { vatCode: user.vatCode });
  }, [readiness, aiDraft, sellerPreviewImage, user.vatCode]);

  const handleFieldsChange = useCallback(
    (patch: PrePublishFieldPatch) => {
      const nextAttrs =
        patch.attributes && aiDraft
          ? { ...(aiDraft.attributes ?? {}), ...patch.attributes }
          : undefined;
      updateAiDraft({
        ...(patch.title != null ? { title: patch.title } : {}),
        ...(patch.price != null ? { price: patch.price } : {}),
        ...(patch.description != null ? { description: patch.description } : {}),
        ...(patch.category != null ? { category: patch.category as ListingCategory } : {}),
        ...(patch.location != null ? { location: patch.location } : {}),
        ...(patch.editedByUser != null ? { editedByUser: patch.editedByUser } : {}),
        ...(patch.allowPastomatas != null ? { allowPastomatas: patch.allowPastomatas } : {}),
        ...(nextAttrs ? { attributes: nextAttrs } : {}),
      });
    },
    [aiDraft, updateAiDraft]
  );

  const handleGalleryChange = useCallback(
    (imageUrls: string[]) => {
      const next = capListingGalleryUrls(
        filterSessionListingImages(
          imageUrls.map((u) => u.trim()).filter(Boolean),
          {
            attributes: aiDraft?.attributes,
            documentUrls: parseDocumentUrlsFromAttributes(aiDraft?.attributes),
          }
        ),
        aiDraft?.category
      );
      updateAiDraft({ orderedImageUrls: next });
      updateSellerMedia({ imageDataUrls: next, imageDataUrl: next[0] ?? null });
    },
    [aiDraft, updateAiDraft, updateSellerMedia]
  );

  const handlePublish = useCallback(
    async (sourceRect: DOMRect, visibilityId: PrePublishVisibilityId) => {
      void sourceRect;
      if (!readiness || !aiDraft) return;
      if (!readiness.ok) {
        const toast = buildPublishValidationToast(readiness);
        showToast(toast.message, toast.type);
        return;
      }
      const formPrice = card && card.price > 0 ? card.price : aiDraft.price > 0 ? aiDraft.price : 0;
      if (formPrice > 0 && !(aiDraft.price > 0)) {
        updateAiDraft({ price: formPrice });
      }
      const cardGallery = (card?.imageUrls ?? [])
        .map((u) => String(u ?? "").trim())
        .filter(Boolean);
      if (cardGallery.length) {
        updateAiDraft({ orderedImageUrls: cardGallery });
        updateSellerMedia({ imageDataUrls: cardGallery, imageDataUrl: cardGallery[0] ?? null });
      }
      const result = await publishListing({
        visibilityId,
        pendingImageUrls: cardGallery.length > 0 ? cardGallery : [],
        ...(formPrice > 0 ? { priceOverride: formPrice } : {}),
      });
      if (result.ok) {
        setPublishedListing(result.listing);
      }
    },
    [readiness, aiDraft, card, publishListing, updateAiDraft, updateSellerMedia, showToast]
  );

  const handlePublishAnother = useCallback(() => {
    finishPublishedFlow();
    setPublishedListing(null);
    seededRef.current = true;
    applyAgentListingDraft(
      buildAiSellerListingSeed(user, { fashion: false }),
      undefined,
      "manual",
      { replaceSession: true }
    );
  }, [finishPublishedFlow, user, applyAgentListingDraft]);

  if (!authHydrated) return <LoadingShell />;

  if (!isAuthenticated) {
    const returnPath = "/add";
    return (
      <VautoAdaptiveLayout>
        <div className="seller-flow-page mx-auto min-h-full w-full max-w-lg" data-seller-funnel>
          <HeroSection>
            <h1 className="mt-6 text-left text-2xl font-bold text-[var(--vauto-text-main)]">
              {isFashion ? "Spinta — naujas drabužis" : "Ką parduodate?"}
            </h1>
            <p className="mt-2 text-left text-sm leading-relaxed text-[var(--vauto-text-muted)]">
              Nufotografuokite prekę arba trumpai aprašykite. VAUTO padės paruošti skelbimą.
            </p>
            <div className="mx-auto mt-5 flex w-full max-w-lg flex-col gap-3">
              <button
                type="button"
                data-seller-start-photo
                onClick={() => requireAuthForListing(returnPath)}
                className="flex min-h-[11rem] w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-[var(--ds-border-strong)] bg-[var(--ds-surface-card)] px-5 text-[var(--ds-text-primary)] transition hover:border-[var(--ds-brand)]/50 hover:bg-[var(--ds-brand-soft)]"
              >
                <Camera className="h-11 w-11 text-[var(--ds-brand)]" aria-hidden />
                <span className="text-base font-bold">Nufotografuokite prekę</span>
                <span className="text-xs font-medium text-[var(--ds-text-muted)]">
                  Galite pridėti daugiau nuotraukų
                </span>
              </button>

              <p className="flex items-center gap-3 text-xs font-medium text-[var(--ds-text-muted)]">
                <span className="h-px flex-1 bg-[var(--ds-border-subtle)]" aria-hidden />
                arba
                <span className="h-px flex-1 bg-[var(--ds-border-subtle)]" aria-hidden />
              </p>

              <input
                type="text"
                data-seller-describe
                value={describeText}
                onChange={(e) => setDescribeText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") requireAuthForListing(returnPath);
                }}
                placeholder="Aprašykite, ką parduodate…"
                className="min-h-12 w-full rounded-2xl border border-[var(--ds-border-strong)] bg-[var(--ds-surface-card)] px-4 text-sm font-medium text-[var(--ds-text-primary)] outline-none placeholder:text-[var(--ds-text-muted)] focus:border-[var(--ds-brand)]"
              />

              <button
                type="button"
                data-seller-start-auth
                onClick={() => requireAuthForListing(returnPath)}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[var(--ds-brand,#10b981)] px-5 text-sm font-bold text-white"
              >
                Prisijungti ir įkelti
              </button>
              <button
                type="button"
                data-seller-start-manual
                data-manual-add-auth
                onClick={() => requireAuthForListing("/add")}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-[var(--ds-border-strong)] bg-[var(--ds-surface-card)] px-5 text-sm font-bold text-[var(--ds-text-primary)]"
              >
                Užpildyti viską pačiam
              </button>
            </div>
            <HomeCategoryGrid
              className="mx-auto mt-8 max-w-lg"
              onSelect={(_query, label, slug) => {
                setSelectedVertical(label);
                setSelectedSlug(slug);
                requireAuthForListing(addListingReturnPath({ uiSlug: slug }));
              }}
            />
            {selectedVertical ? (
              <div className="mt-3 px-2">
                <p
                  className="text-center text-sm font-medium text-[var(--vauto-text-main)]"
                  data-selected-vertical={selectedVertical}
                >
                  Pasirinkote: {selectedVertical}. Po prisijungimo aprašykite
                  objektą laisvai
                  {selectedVertical === "Elektronika"
                    ? " (pvz. MacBook) — transporto laukai nebus rodomi."
                    : "."}
                </p>
                {selectedVerticalId ? (
                  <CategorySchemaPreview verticalId={selectedVerticalId} />
                ) : null}
              </div>
            ) : null}
            <SellerListingSteps className="mt-5" />
            <p className="mt-4 text-center text-sm text-[var(--vauto-text-muted)]">
              Prisijunkite, kad galėtumėte įkelti skelbimą.
            </p>
          </HeroSection>
        </div>
      </VautoAdaptiveLayout>
    );
  }

  if (publishedListing) {
    return (
      <PublishedView
        listing={publishedListing}
        onOpen={() => router.push(listingPath(publishedListing))}
        onPublishAnother={handlePublishAnother}
      />
    );
  }

  if (!card) return <LoadingShell />;

  return (
    <PrePublishModal
      open
      card={card}
      variant="manual"
      publishing={isPublishingListing}
      attributes={aiDraft?.attributes}
      onClose={() => router.push("/")}
      onPublish={handlePublish}
      onGalleryChange={handleGalleryChange}
      onFieldsChange={handleFieldsChange}
    />
  );
}
