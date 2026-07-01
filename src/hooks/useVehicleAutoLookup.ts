"use client";

import { useEffect, useRef, useState } from "react";
import type { AiExtractedListing, CategoryAttributes } from "@/lib/types";
import { isValidVin, normalizeVin } from "@/lib/trust";
import { isLtPlate } from "@/lib/vehicle-intelligence/vehicle-attribute-mappers";
import {
  lookupVehicle,
  vehicleLookupToDraftPatch,
  type VehicleLookupResult,
} from "@/lib/vehicle-intelligence/vehicle-lookup";

function resolveLookupIdentifier(attributes: CategoryAttributes): string | undefined {
  const vin = typeof attributes.vin === "string" ? attributes.vin : "";
  if (vin && isValidVin(normalizeVin(vin))) return normalizeVin(vin);

  const plate = typeof attributes.plateNumber === "string" ? attributes.plateNumber : "";
  if (plate && isLtPlate(plate)) return plate.trim().toUpperCase();

  return undefined;
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

  const identifier = enabled ? resolveLookupIdentifier(attributes) : undefined;

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
    const timer = window.setTimeout(() => {
      setLoading(true);
      void lookupVehicle(identifier)
        .then((next) => {
          if (cancelled) return;
          lastFetchedRef.current = identifier;
          setResult(next);
          onApplyRef.current(vehicleLookupToDraftPatch(next));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, identifier]);

  return { loading, result, identifier };
}
