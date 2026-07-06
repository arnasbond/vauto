"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin, Search, Truck } from "lucide-react";
import { apiSearchParcelLockers } from "@/lib/api/client";
import { isDataApiEnabled } from "@/lib/api/config";
import type { ShippingProviderId } from "@/lib/shipping/shipping-provider";
import {
  estimateNationalShippingRoute,
  searchParcelLockers,
  NATIONAL_COVERAGE_LABEL,
  type ParcelLocker,
} from "@/lib/shipping/shipping-routing";

interface ParcelLockerPickerProps {
  providerId: ShippingProviderId;
  selectedId?: string;
  originLocation?: string;
  onSelect: (locker: ParcelLocker) => void;
}

export function ParcelLockerPicker({
  providerId,
  selectedId,
  originLocation,
  onSelect,
}: ParcelLockerPickerProps) {
  const [query, setQuery] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [remoteLockers, setRemoteLockers] = useState<ParcelLocker[] | null>(null);
  const [liveSource, setLiveSource] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const useApi = isDataApiEnabled() && providerId === "omniva";

  useEffect(() => {
    if (!useApi) {
      setRemoteLockers(null);
      setLiveSource(false);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setLoadError(null);
      void apiSearchParcelLockers({
        providerId,
        city: cityFilter || undefined,
        q: query || undefined,
        limit: 60,
      }).then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setRemoteLockers(res.data.lockers);
          setLiveSource(true);
          setLoadError(null);
        } else {
          setRemoteLockers(null);
          setLiveSource(false);
          setLoadError(res.error || "Nepavyko gauti paštomatų sąrašo");
        }
      }).catch(() => {
        if (cancelled) return;
        setRemoteLockers(null);
        setLiveSource(false);
        setLoadError("Nepavyko prisijungti prie VAUTO API");
      }).finally(() => {
        if (!cancelled) setLoading(false);
      });
    }, query || cityFilter ? 280 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [useApi, providerId, query, cityFilter]);

  const lockers = useMemo(() => {
    if (remoteLockers) return remoteLockers;
    return searchParcelLockers({
      providerId,
      query: query || undefined,
      city: cityFilter || undefined,
      limit: 40,
    });
  }, [remoteLockers, providerId, query, cityFilter]);

  const selectedLocker = lockers.find((l) => l.id === selectedId);

  const routeEstimate = useMemo(() => {
    if (!originLocation || !selectedLocker) return null;
    return estimateNationalShippingRoute(
      originLocation,
      selectedLocker.city,
      providerId
    );
  }, [originLocation, selectedLocker, providerId]);

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-500">
          Pristatymo paštomatas (pirkėjo)
        </p>
        <span className="text-[10px] font-medium text-emerald-600">
          {liveSource ? "Omniva · gyvas sąrašas" : NATIONAL_COVERAGE_LABEL}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ieškoti paštomato…"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-800"
          />
        </label>
        <label className="relative block">
          <MapPin className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="search"
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            placeholder="Miestas / rajonas (nebūtina)"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-800"
          />
        </label>
      </div>

      {loading && (
        <p className="text-xs text-slate-500">Kraunami Omniva paštomatai…</p>
      )}
      {loadError && !loading && !remoteLockers && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          {loadError} — rodomas atsarginis sąrašas.
        </p>
      )}

      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
        {lockers.map((locker) => {
          const active = selectedId === locker.id;
          return (
            <button
              key={locker.id}
              type="button"
              onClick={() => onSelect(locker)}
              className={`w-full rounded-xl border p-3 text-left transition ${
                active
                  ? "border-[#1167b1] bg-[#eef6ff]"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <span className="block text-sm font-semibold text-slate-900">
                {locker.name}
              </span>
              <span className="mt-0.5 block text-xs text-slate-500">
                {locker.city} · {locker.address}
              </span>
            </button>
          );
        })}
        {!loading && lockers.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-500">
            Paštomatų nerasta — pabandykite kitą miestą ar paiešką.
          </p>
        )}
      </div>

      {routeEstimate && (
        <div className="flex gap-2 rounded-xl border border-[#bfdbfe] bg-[#eef6ff] p-3">
          <Truck className="mt-0.5 h-4 w-4 shrink-0 text-[#1167b1]" />
          <p className="text-xs leading-relaxed text-slate-700">
            {routeEstimate.summaryLt}
          </p>
        </div>
      )}
    </div>
  );
}
