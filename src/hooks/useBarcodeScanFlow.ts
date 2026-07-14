"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useVauto } from "@/context/VautoContext";
import { useVautoAgent } from "@/context/VautoAgentContext";
import type { AiExtractedListing, ListingCategory } from "@/lib/types";
import {
  barcodeLookupToDraftPatch,
  buildUnregisteredBarcode,
  enrichBarcodeWithFashionCopy,
  lookupBarcode,
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
  conductorBarcodeSource,
  conductorShouldDelegateLegacy,
  executeConductorRoute,
  readConductorBarcodeExecute,
} from "@/lib/vauto-conductor";

export function useBarcodeScanFlow() {
  const { applyAgentListingDraft, user } = useVauto();
  const { openWithGreeting } = useVautoAgent();
  const router = useRouter();
  const pathname = usePathname();

  const showUnregisteredProductPrompt = useCallback(
    (pendingImageUrls?: string[]) => {
      if (pendingImageUrls?.length) {
        notifyAgentPendingImages(pendingImageUrls);
      }
      openWithGreeting(
        UNREGISTERED_PRODUCT_AGENT_PROMPT,
        unregisteredProductAgentGreetingOptions()
      );
      const normalized = (pathname || "/").replace(/\/$/, "") || "/";
      if (normalized === "/add") {
        router.push("/");
      }
    },
    [openWithGreeting, pathname, router]
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

      const route = await executeConductorRoute({
        ...conductorBarcodeSource("useBarcodeScanFlow"),
        payload: { barcode, category },
      });

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

      if (!conductorShouldDelegateLegacy(route)) {
        const exec = readConductorBarcodeExecute(route);
        if (!exec) return;
        if (exec.notFoundInRegistry) {
          const patch = barcodeLookupToDraftPatch(exec.lookupResult, {
            title: draftBase.title ?? "",
            description: draftBase.description,
            attributes: draftBase.attributes,
          });
          applyAgentListingDraft(
            { ...draftBase, ...patch } as AiExtractedListing,
            undefined,
            "barcode"
          );
          if (exec.lookupResult.notFoundInRegistry) {
            setPendingBarcodeOffer(barcode);
          }
          queueMicrotask(() => {
            showUnregisteredProductPrompt(opts?.pendingImageUrls);
          });
          return;
        }
        applyAgentListingDraft(
          {
            ...draftBase,
            title: exec.patch.title || draftBase.title,
            description: exec.patch.description || "",
            attributes: {
              barcode,
              ...(exec.patch.attributes ?? {}),
            },
            confidence: exec.patch.confidence ?? 0.75,
          } as AiExtractedListing,
          undefined,
          "barcode"
        );
        setPendingBarcodeOffer(barcode);
        return;
      }

      const result = await Promise.race([
        lookupBarcode(barcode),
        new Promise<null>((resolve) =>
          window.setTimeout(() => resolve(null), BARCODE_LOOKUP_TIMEOUT_MS)
        ),
      ]);

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
