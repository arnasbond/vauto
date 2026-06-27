"use client";

import { useEffect, useState } from "react";
import type { AiExtractedListing } from "@/lib/types";
import {
  fetchBuyerPersonaDescriptions,
  type BuyerPersonaId,
  type BuyerPersonaVariants,
} from "@/lib/description-personas";

/** AI Chameleon — generuoja 3 pirkėjo personos aprašymus wizard step 6. */
export function useBuyerPersonaDescriptions(
  draft: AiExtractedListing,
  enabled: boolean
) {
  const [variants, setVariants] = useState<BuyerPersonaVariants | undefined>(
    draft.descriptionVariants
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (draft.descriptionVariants?.family && draft.descriptionVariants?.youth) {
      setVariants(draft.descriptionVariants);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchBuyerPersonaDescriptions(draft)
      .then((result) => {
        if (cancelled || !result) return;
        setVariants(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, draft]);

  return {
    variants,
    loading,
    selected: draft.selectedPersona as BuyerPersonaId | undefined,
  };
}
