"use client";

import { useCallback } from "react";
import { useVauto } from "@/context/VautoContext";
import type { ListingCategory } from "@/lib/types";
import {
  enrichBarcodeWithFashionCopy,
  lookupBarcode,
} from "@/lib/product-intelligence/barcode-lookup";
import { setPendingBarcodeOffer } from "@/lib/product-intelligence/barcode-intent-session";
import { createManualFallbackDraft } from "@/lib/ai-safeguards";

export function useBarcodeScanFlow() {
  const { applyAgentListingDraft, showToast, user } = useVauto();

  const applyScannedBarcode = useCallback(
    async (barcode: string, opts?: { category?: ListingCategory; fashion?: boolean }) => {
      const category: ListingCategory = opts?.category ?? (opts?.fashion ? "clothing" : "other");

      const result = await lookupBarcode(barcode);
      if (result?.notFoundInRegistry) {
        showToast(
          result.userMessage ??
            "Kodas atpažintas, bet nerastas viešame registre. Parašykite daikto pavadinimą patys, o aš sugeneruosiu aprašymą."
        );
      }

      const patch = result
        ? await enrichBarcodeWithFashionCopy(result, category)
        : {
            attributes: { barcode },
          };

      applyAgentListingDraft({
        ...createManualFallbackDraft({
          location: user.city || "Lietuva",
          contact: user.phone,
        }),
        category,
        title: patch.title || (opts?.fashion ? "Naujas drabužio skelbimas" : "Naujas skelbimas"),
        description: patch.description || "",
        attributes: {
          barcode,
          ...(patch.attributes ?? {}),
        },
        confidence: patch.confidence ?? 0.75,
      });

      setPendingBarcodeOffer(barcode);
    },
    [applyAgentListingDraft, showToast, user.city, user.phone]
  );

  return { applyScannedBarcode };
}
