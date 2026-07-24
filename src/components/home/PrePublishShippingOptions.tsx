"use client";

import { Package, Truck } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  OMNIVA_LOCKER_OVERSIZE_NOTE,
  resolveOmnivaLockerEligibility,
  type OmnivaLockerEligibility,
} from "@vauto/shared/omniva-locker-eligibility";
import type { ListingCategory } from "@/lib/types";

export type PrePublishShippingMode = "omniva_locker" | "pickup_or_courier";

export interface PrePublishShippingOptionsProps {
  title?: string;
  description?: string;
  category?: ListingCategory | string;
  attributes?: Record<string, string | string[] | undefined>;
  allowPastomatas?: boolean;
  /** Selected mode — when lockers blocked, always pickup_or_courier. */
  value: PrePublishShippingMode;
  disabled?: boolean;
  onChange?: (mode: PrePublishShippingMode, eligibility: OmnivaLockerEligibility) => void;
}

export function resolvePrePublishShippingEligibility(input: {
  title?: string;
  description?: string;
  category?: ListingCategory | string;
  attributes?: Record<string, string | string[] | undefined>;
  allowPastomatas?: boolean;
}): OmnivaLockerEligibility {
  return resolveOmnivaLockerEligibility({
    title: input.title,
    description: input.description,
    category: input.category,
    attributes: input.attributes as Record<string, unknown> | undefined,
    allowPastomatas: input.allowPastomatas,
  });
}

/**
 * PrePublish shipping fence — show Omniva lockers only when fitsOmnivaLocker.
 * Otherwise hide lockers and default to pickup / courier with the Omniva note.
 */
export function PrePublishShippingOptions({
  title,
  description,
  category,
  attributes,
  allowPastomatas,
  value,
  disabled,
  onChange,
}: PrePublishShippingOptionsProps) {
  const eligibility = resolvePrePublishShippingEligibility({
    title,
    description,
    category,
    attributes,
    allowPastomatas,
  });
  const showOmniva = eligibility.eligible && eligibility.fitsOmnivaLocker;
  const active: PrePublishShippingMode = showOmniva
    ? value
    : "pickup_or_courier";

  return (
    <section
      className="space-y-2 rounded-xl border border-[var(--vauto-border)]/70 bg-[var(--vauto-surface-muted)]/25 p-3"
      data-omniva-eligible={showOmniva ? "true" : "false"}
      data-estimated-size={eligibility.estimatedSize}
    >
      <p className="text-sm font-semibold text-[var(--vauto-text)]">
        Pristatymas
      </p>
      <p className="text-[11px] text-[var(--vauto-text-muted)]">
        Omniva L max 39×38×64 cm · ≤30 kg
      </p>

      <div className="grid gap-1.5" role="radiogroup" aria-label="Pristatymo būdas">
        {showOmniva ? (
          <label
            className={cn(
              "flex cursor-pointer touch-manipulation items-start gap-2.5 rounded-lg border px-2.5 py-2.5 transition",
              active === "omniva_locker"
                ? "border-[var(--vauto-primary)] bg-[var(--vauto-primary)]/8 ring-1 ring-[var(--vauto-primary)]/25"
                : "border-[var(--vauto-border)]/80 bg-[var(--vauto-card-bg)] hover:border-[var(--vauto-primary)]/30"
            )}
          >
            <input
              type="radio"
              name="pre-publish-shipping"
              value="omniva_locker"
              checked={active === "omniva_locker"}
              disabled={disabled}
              onChange={() => onChange?.("omniva_locker", eligibility)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--vauto-primary)]"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[13px] font-semibold text-[var(--vauto-text)]">
                <Package
                  className="h-3.5 w-3.5 shrink-0 text-[var(--vauto-primary)]"
                  aria-hidden
                />
                Omniva paštomatas
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-[var(--vauto-text-muted)]">
                Prekė telpa (dydis {eligibility.estimatedSize})
              </span>
            </span>
          </label>
        ) : null}

        <label
          className={cn(
            "flex cursor-pointer touch-manipulation items-start gap-2.5 rounded-lg border px-2.5 py-2.5 transition",
            active === "pickup_or_courier"
              ? "border-[var(--vauto-primary)] bg-[var(--vauto-primary)]/8 ring-1 ring-[var(--vauto-primary)]/25"
              : "border-[var(--vauto-border)]/80 bg-[var(--vauto-card-bg)] hover:border-[var(--vauto-primary)]/30"
          )}
        >
          <input
            type="radio"
            name="pre-publish-shipping"
            value="pickup_or_courier"
            checked={active === "pickup_or_courier"}
            disabled={disabled}
            onChange={() => onChange?.("pickup_or_courier", eligibility)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--vauto-primary)]"
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-[13px] font-semibold text-[var(--vauto-text)]">
              <Truck
                className="h-3.5 w-3.5 shrink-0 text-[var(--vauto-primary)]"
                aria-hidden
              />
              Atsiėmimas vietoje / Kurjeris
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-[var(--vauto-text-muted)]">
              Be paštomato — gyvai arba kurjeriu
            </span>
          </span>
        </label>
      </div>

      {!showOmniva ? (
        <p
          className="rounded-lg border border-amber-500/25 bg-amber-500/8 px-2.5 py-2 text-[12px] leading-snug text-[var(--vauto-text)]"
          role="status"
        >
          {eligibility.noteLt || OMNIVA_LOCKER_OVERSIZE_NOTE}
        </p>
      ) : null}
    </section>
  );
}
