"use client";

import { useCallback } from "react";
import { useVauto } from "@/context/VautoContext";
import type { ListingCategory } from "@/lib/types";
import {
  enrichBarcodeWithFashionCopy,
  lookupBarcode,
} from "@/lib/product-intelligence/barcode-lookup";
import { setPendingBarcodeOffer } from "@/lib/product-intelligence/barcode-intent-session";
import {
  BARCODE_LOOKUP_TIMEOUT_MS,
  SCAN_NOT_RECOGNIZED_MSG,
  createManualFallbackDraft,
} from "@/lib/ai-safeguards";

export function useBarcodeScanFlow() {
  const { applyAgentListingDraft, showToast, user } = useVauto();

  const applyScannedBarcode = useCallback(
    async (barcode: string, opts?: { category?: ListingCategory; fashion?: boolean }) => {
      const category: ListingCategory = opts?.category ?? (opts?.fashion ? "clothing" : "other");

      const result = await Promise.race([
        lookupBarcode(barcode),
        new Promise<null>((resolve) =>
          window.setTimeout(() => resolve(null), BARCODE_LOOKUP_TIMEOUT_MS)
        ),
      ]);

      if (!result) {
        showToast(SCAN_NOT_RECOGNIZED_MSG, "info");
        applyAgentListingDraft({
          ...createManualFallbackDraft({
            location: user.city || "Lietuva",
            contact: user.phone,
          }),
          category,
          title: opts?.fashion ? "Naujas drabužio skelbimas" : "Naujas skelbimas",
          description: "",
          attributes: { barcode },
          confidence: 0.5,
        });
        return;
      }

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
