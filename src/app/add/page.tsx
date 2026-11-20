"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PartyPopper, Plus } from "lucide-react";
import { VautoAdaptiveLayout } from "@/components/layout/VautoAdaptiveLayout";
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

/**
 * R5 final — /add is a STANDALONE manual listing path. It is fully decoupled
 * from the AI assistant / chat lifecycle: no LLM, no SSE, no agent chat. The
 * user fills a simple form (photos, title, description, price or negotiable,
 * location, contact) and publishes through the shared authoritative
 * `publishListing` pipeline (POST /api/listings).
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

function GuestShell({ onContinue }: { onContinue: () => void }) {
  return (
    <AddShell>
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <h1 className="font-display text-2xl font-bold text-[var(--vauto-text-main)]">
          Įkelkite skelbimą
        </h1>
        <p className="max-w-sm text-sm leading-relaxed text-[var(--vauto-text-muted)]">
          Nufotografuokite prekę, įrašykite antraštę, kainą ir vietą — publikuosite patys,
          be AI asistento.
        </p>
        <button
          type="button"
          data-manual-add-auth
          onClick={onContinue}
          className="inline-flex min-h-12 w-full max-w-xs items-center justify-center rounded-2xl bg-[var(--vauto-primary,#10b981)] px-5 text-sm font-bold text-white"
        >
          Prisijungti ir įkelti
        </button>
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
      <div
        className="flex flex-col items-center gap-4 py-12 text-center"
        data-manual-add-published="1"
      >
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
  const { user, openAuthModal } = useAuth();
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

  const seededRef = useRef(false);
  const [publishedListing, setPublishedListing] = useState<Listing | null>(null);

  // Seed a deterministic empty draft exactly once per authenticated visit.
  useEffect(() => {
    if (!authHydrated || !isAuthenticated) return;
    if (seededRef.current) return;
    seededRef.current = true;
    if (!aiDraft) {
      applyAgentListingDraft(buildAiSellerListingSeed(user, { fashion: false }), undefined, "manual", {
        replaceSession: true,
      });
    }
  }, [authHydrated, isAuthenticated, aiDraft, user, applyAgentListingDraft]);

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
    applyAgentListingDraft(buildAiSellerListingSeed(user, { fashion: false }), undefined, "manual", {
      replaceSession: true,
    });
  }, [finishPublishedFlow, user, applyAgentListingDraft]);

  if (!authHydrated) return <LoadingShell />;

  if (!isAuthenticated) {
    return (
      <GuestShell
        onContinue={() => {
          if (requireAuthForListing("/add")) router.push("/add");
        }}
      />
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
    <div data-manual-add="1">
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
    </div>
  );
}
