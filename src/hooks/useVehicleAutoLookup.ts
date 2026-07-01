"use client";

import { useEffect, useRef, useState } from "react";
import type { AiExtractedListing, CategoryAttributes } from "@/lib/types";
import { isValidVinForLookup, normalizeVin } from "@/lib/trust";
import { isLtPlate } from "@/lib/vehicle-intelligence/vehicle-attribute-mappers";
import { BARCODE_LOOKUP_TIMEOUT_MS } from "@/lib/ai-safeguards";
import {
  commitConductorDraft,
  conductorShouldDelegateLegacy,
  conductorVehicleLookupSource,
  executeConductorRoute,
  getConductorDraft,
  isConductorEnabled,
  mergeVehicleLookupDraft,
} from "@/lib/vauto-conductor";
import {
  lookupVehicle,
  vehicleLookupFallback,
  vehicleLookupToDraftPatch,
  type VehicleLookupResult,
} from "@/lib/vehicle-intelligence/vehicle-lookup";

function resolveLookupIdentifier(attributes: CategoryAttributes): {
  identifier?: string;
  vin?: string;
  plate?: string;
} {
  const vin = typeof attributes.vin === "string" ? attributes.vin : "";
  const plate = typeof attributes.plateNumber === "string" ? attributes.plateNumber : "";

  if (vin && isValidVinForLookup(normalizeVin(vin))) {
    return {
      identifier: normalizeVin(vin),
      vin: normalizeVin(vin),
      plate: plate && isLtPlate(plate) ? plate.trim().toUpperCase() : undefined,
    };
  }

  if (plate && isLtPlate(plate)) {
    return {
      identifier: plate.trim().toUpperCase(),
      plate: plate.trim().toUpperCase(),
      vin: vin && isValidVinForLookup(normalizeVin(vin)) ? normalizeVin(vin) : undefined,
    };
  }

  return {};
}

export function useVehicleAutoLookup(
  attributes: CategoryAttributes,
  enabled: boolean,
  onApply: (patch: Partial<AiExtractedListing>) => void
) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VehicleLookupResult | null>(null);
  const lastFetchedRef = useRef("");
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;

  const { identifier, vin, plate } = enabled ? resolveLookupIdentifier(attributes) : {};

  useEffect(() => {
    if (!enabled || !identifier) {
      if (!identifier && lastFetchedRef.current) {
        lastFetchedRef.current = "";
        setResult(null);
        onApplyRef.current({ isVinVerified: false });
      }
      return;
    }

    if (lastFetchedRef.current === identifier) return;

    let cancelled = false;
    void (async () => {
      const route = await executeConductorRoute({
        ...conductorVehicleLookupSource("useVehicleAutoLookup"),
        payload: { identifier, vin, plate },
      });
      if (!conductorShouldDelegateLegacy(route) || cancelled) return;

      setLoading(true);
      const next = await Promise.race([
        lookupVehicle(identifier, { vin, plate }),
        new Promise<VehicleLookupResult>((resolve) =>
          window.setTimeout(
            () => resolve(vehicleLookupFallback(identifier)),
            BARCODE_LOOKUP_TIMEOUT_MS
          )
        ),
      ]);
      if (cancelled) return;
      lastFetchedRef.current = identifier;
      setResult(next);
      const patch = vehicleLookupToDraftPatch(next);
      if (isConductorEnabled()) {
        const mergedDraft = mergeVehicleLookupDraft(
          getConductorDraft()?.draft,
          next,
          getConductorDraft()?.sources ?? []
        ).draft;
        commitConductorDraft(mergedDraft, "vehicle");
      }
      onApplyRef.current(patch);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, identifier, vin, plate]);

  return { loading, result, identifier };
}
