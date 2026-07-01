"use client";

import { useCallback } from "react";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import type { AiExtractedListing, ListingCategory } from "@/lib/types";
import {
  enrichBarcodeWithFashionCopy,
  buildUnregisteredBarcode,
  lookupBarcode,
  barcodeLookupToDraftPatch,
} from "@/lib/product-intelligence/barcode-lookup";
import { setPendingBarcodeOffer } from "@/lib/product-intelligence/barcode-intent-session";
import {
  BARCODE_LOOKUP_TIMEOUT_MS,
  createManualFallbackDraft,
  UNREGISTERED_PRODUCT_AGENT_PROMPT,
} from "@/lib/ai-safeguards";
import { unregisteredProductAgentGreetingOptions } from "@/lib/photo-intent-resolution";
import { notifyAgentPendingImages } from "@/lib/vauto-agent-client";
import {
  commitConductorDraft,
  conductorBarcodeSource,
  executeConductorRoute,
  getConductorDraft,
  isConductorEnabled,
  mergeBarcodeLookupDraft,
} from "@/lib/vauto-conductor";

export function useBarcodeScanFlow() {
  const { applyAgentListingDraft, user } = useVauto();
  const { openWithGreeting } = useVautoAgent();

  const showUnregisteredProductPrompt = useCallback(
    (pendingImageUrls?: string[]) => {
      if (pendingImageUrls?.length) {
        notifyAgentPendingImages(pendingImageUrls);
      }
      openWithGreeting(
        UNREGISTERED_PRODUCT_AGENT_PROMPT,
        unregisteredProductAgentGreetingOptions()
      );
    },
    [openWithGreeting]
  );

  const applyScannedBarcode = useCallback(
    async (
      barcode: string,
      opts?: {
        category?: ListingCategory;
        fashion?: boolean;
        pendingImageUrls?: string[];
      }
    ) => {
      const category: ListingCategory = opts?.category ?? (opts?.fashion ? "clothing" : "other");

      void executeConductorRoute({
        ...conductorBarcodeSource("useBarcodeScanFlow"),
        payload: { barcode, category },
      });

      const result = await Promise.race([
        lookupBarcode(barcode),
        new Promise<null>((resolve) =>
          window.setTimeout(() => resolve(null), BARCODE_LOOKUP_TIMEOUT_MS)
        ),
      ]);

      const draftBase: Partial<AiExtractedListing> = {
        ...createManualFallbackDraft({
          location: user.city || "Lietuva",
          contact: user.phone,
        }),
        category,
        title: opts?.fashion ? "Naujas drabužio skelbimas" : "Naujas skelbimas",
        description: "",
        attributes: { barcode },
        confidence: 0.5,
      };

      if (!result || result.notFoundInRegistry) {
        const lookupResult = result ?? buildUnregisteredBarcode(barcode);
        const patch = barcodeLookupToDraftPatch(lookupResult, {
          title: draftBase.title ?? "",
          description: draftBase.description,
          attributes: draftBase.attributes,
        });
        applyAgentListingDraft(
          { ...draftBase, ...patch } as AiExtractedListing,
          undefined,
          "barcode"
        );
        if (result?.notFoundInRegistry) {
          setPendingBarcodeOffer(barcode);
        }
        queueMicrotask(() => {
          showUnregisteredProductPrompt(opts?.pendingImageUrls);
        });
        return;
      }

      const patch = await enrichBarcodeWithFashionCopy(result, category);
      const mergedDraft = isConductorEnabled()
        ? mergeBarcodeLookupDraft(
            getConductorDraft()?.draft ?? draftBase,
            result,
            getConductorDraft()?.sources ?? []
          ).draft
        : null;
      if (isConductorEnabled() && mergedDraft) {
        commitConductorDraft(mergedDraft, "barcode", draftBase);
      }
      applyAgentListingDraft(
        {
          ...draftBase,
          title: patch.title || draftBase.title,
          description: patch.description || "",
          attributes: {
            barcode,
            ...(patch.attributes ?? {}),
          },
          confidence: patch.confidence ?? 0.75,
        } as AiExtractedListing,
        undefined,
        "barcode"
      );

      setPendingBarcodeOffer(barcode);
    },
    [applyAgentListingDraft, showUnregisteredProductPrompt, user.city, user.phone]
  );

  return { applyScannedBarcode };
}
