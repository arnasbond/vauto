"use client";

import { CheckCircle2, Database, Loader2 } from "lucide-react";
import type { VehicleLookupResult } from "@/lib/vehicle-intelligence/vehicle-lookup";
import { isOfficialVehicleSource } from "@/lib/vehicle-intelligence/vehicle-attribute-mappers";

interface VehicleLookupCardProps {
  loading: boolean;
  result: VehicleLookupResult | null;
  isVinVerified: boolean;
}

function sourceBadgeLabel(source: VehicleLookupResult["source"]): string | null {
  if (source === "vin-decoder-nhtsa") return "Oficialūs NHTSA duomenys";
  if (source === "regitra-plate-api") return "Oficialūs Regitros duomenys";
  return null;
}

export function VehicleLookupCard({
  loading,
  result,
  isVinVerified,
}: VehicleLookupCardProps) {
  const badge = result ? sourceBadgeLabel(result.source) : null;
  const showOfficialBadge = isVinVerified && badge !== null;

  return (
    <div className="mb-3 rounded-xl border border-[#bfdbfe] bg-[#eef6ff] p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#1167b1] shadow-sm">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Database className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-[#1167b1]">
            Regitra / VIN autofill
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[#4b5563]">
            {loading
              ? "Tikriname duomenis fone…"
              : "VIN arba valstybinis numeris automatiškai užpildo techninius laukus."}
          </p>
          {showOfficialBadge && (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#dcfce7] px-2.5 py-1 text-xs font-semibold text-[#15803d]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {badge}
            </span>
          )}
        </div>
      </div>

      {result && !loading && (
        <div className="mt-3 rounded-lg bg-white p-3 text-xs text-[#374151]">
          <div className="grid grid-cols-2 gap-2">
            <span>
              {result.make} {result.model}
            </span>
            <span>{result.year}</span>
            <span>{result.fuelType}</span>
            <span>{result.gearbox ?? "—"}</span>
            <span>{result.bodyType}</span>
            <span>{result.powerKw ? `${result.powerKw} kW` : result.engine}</span>
            {result.mileage && <span className="col-span-2">Rida: {result.mileage}</span>}
            {result.source && isOfficialVehicleSource(result.source) && (
              <span className="col-span-2 text-[#6b7280]">
                Šaltinis: {result.source === "regitra-plate-api" ? "Regitra" : "NHTSA"}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
