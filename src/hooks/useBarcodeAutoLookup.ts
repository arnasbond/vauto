"use client";

import { useEffect, useRef, useState } from "react";
import type { AiExtractedListing, CategoryAttributes, ListingCategory } from "@/lib/types";
import { BARCODE_LOOKUP_TIMEOUT_MS } from "@/lib/ai-safeguards";
import {
  buildUnregisteredBarcode,
  enrichBarcodeWithFashionCopy,
  isBarcodeLookupEligibleCategory,
  lookupBarcode,
  type BarcodeLookupResult,
} from "@/lib/product-intelligence/barcode-lookup";
import { resolveBarcodeFromAttributes } from "@/lib/product-intelligence/barcode-utils";

export function useBarcodeAutoLookup(
  category: ListingCategory,
  attributes: CategoryAttributes,
  draft: Pick<AiExtractedListing, "title" | "description">,
  enabled: boolean,
  onApply: (patch: Partial<AiExtractedListing>) => void,
  onNotFound?: (message: string) => void
) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BarcodeLookupResult | null>(null);
  const lastFetchedRef = useRef("");
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;
  const onNotFoundRef = useRef(onNotFound);
  onNotFoundRef.current = onNotFound;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const attributesRef = useRef(attributes);
  attributesRef.current = attributes;

  const eligible = enabled && isBarcodeLookupEligibleCategory(category);
  const barcode = eligible ? resolveBarcodeFromAttributes(attributes) : undefined;

  useEffect(() => {
    if (!eligible || !barcode) {
      if (!barcode && lastFetchedRef.current) {
        lastFetchedRef.current = "";
        setResult(null);
      }
      return;
    }

    if (lastFetchedRef.current === barcode) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void Promise.race([
        lookupBarcode(barcode),
        new Promise<null>((resolve) =>
          window.setTimeout(() => resolve(null), BARCODE_LOOKUP_TIMEOUT_MS)
        ),
      ])
        .then(async (next) => {
          if (cancelled) return;
          const resolved = next ?? buildUnregisteredBarcode(barcode);
          lastFetchedRef.current = barcode;
          setResult(resolved);
          if (resolved.notFoundInRegistry) {
            onNotFoundRef.current?.(
              resolved.userMessage ??
                "Kodas atpažintas, bet nerastas viešame registre. Parašykite daikto pavadinimą patys, o aš sugeneruosiu aprašymą."
            );
          }
          const patch = await enrichBarcodeWithFashionCopy(resolved, category);
          onApplyRef.current(
            patch.title || patch.description
              ? patch
              : {
                  ...patch,
                  title: draftRef.current.title,
                  description: draftRef.current.description,
                  attributes: {
                    ...attributesRef.current,
                    ...patch.attributes,
                  },
                }
          );
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [eligible, barcode, category]);

  return { loading, result, barcode };
}
