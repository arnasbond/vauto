"use client";

import { Camera, CheckCircle2, Database, Loader2, ScanLine } from "lucide-react";
import { useState } from "react";
import type { AiExtractedListing } from "@/lib/types";
import {
  lookupVehicle,
  vehicleLookupToDraftPatch,
  type VehicleLookupResult,
} from "@/lib/vehicle-intelligence/vehicle-lookup";

interface VehicleLookupCardProps {
  vin?: string;
  onApply: (patch: Partial<AiExtractedListing>) => void;
}

export function VehicleLookupCard({ vin, onApply }: VehicleLookupCardProps) {
  const [result, setResult] = useState<VehicleLookupResult | null>(null);
  const [loading, setLoading] = useState(false);

  const runLookup = async (identifier?: string) => {
    setLoading(true);
    try {
      const next = await lookupVehicle(identifier);
      setResult(next);
      onApply(vehicleLookupToDraftPatch(next));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-3 rounded-xl border border-[#bfdbfe] bg-[#eef6ff] p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#1167b1] shadow-sm">
          <Database className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-[#1167b1]">
            Regitra / VIN autofill
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[#4b5563]">
            VIN — NHTSA API. Valstybinis numeris — per serverį (Regitra plate API
            jei sukonfigūruota, kitaip demo).
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => void runLookup(vin)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#1167b1] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ScanLine className="h-3.5 w-3.5" />
              )}
              VIN lookup
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void runLookup("KAA 123")}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#1167b1] bg-white px-3 py-2 text-xs font-semibold text-[#1167b1] disabled:opacity-60"
            >
              <Camera className="h-3.5 w-3.5" />
              Numerio foto
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div className="mt-3 rounded-lg bg-white p-3 text-xs text-[#374151]">
          <p className="mb-2 flex items-center gap-1.5 font-semibold text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            Duomenys užpildyti iš {result.source}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <span>{result.make} {result.model}</span>
            <span>{result.year}</span>
            <span>{result.fuelType}</span>
            <span>{result.engine}</span>
            <span>TA iki {result.taExpiry}</span>
            <span>{result.taValid ? "TA galioja" : "TA nežinoma"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
