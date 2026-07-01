"use client";

import { useEffect, useRef, useState } from "react";
import type { AiExtractedListing, CategoryAttributes, ListingCategory } from "@/lib/types";
import {
  barcodeLookupToDraftPatch,
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
  onApply: (patch: Partial<AiExtractedListing>) => void
) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BarcodeLookupResult | null>(null);
  const lastFetchedRef = useRef("");
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;
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
      void lookupBarcode(barcode)
        .then((next) => {
          if (cancelled || !next) return;
          lastFetchedRef.current = barcode;
          setResult(next);
          onApplyRef.current(
            barcodeLookupToDraftPatch(next, {
              title: draftRef.current.title,
              description: draftRef.current.description,
              attributes: attributesRef.current,
            })
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
  }, [eligible, barcode]);

  return { loading, result, barcode };
}
