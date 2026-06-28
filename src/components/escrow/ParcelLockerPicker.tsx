"use client";

import type { ShippingProviderId } from "@/lib/shipping/shipping-provider";
import {
  lockersForProvider,
  type ParcelLocker,
} from "@/lib/shipping/parcel-lockers";

interface ParcelLockerPickerProps {
  providerId: ShippingProviderId;
  selectedId?: string;
  onSelect: (locker: ParcelLocker) => void;
}

export function ParcelLockerPicker({
  providerId,
  selectedId,
  onSelect,
}: ParcelLockerPickerProps) {
  const lockers = lockersForProvider(providerId);

  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-semibold text-slate-500">
        Pristatymo paštomatas (pirkėjo)
      </p>
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
    </div>
  );
}
