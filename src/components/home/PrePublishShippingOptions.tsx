"use client";

import { useEffect, useState } from "react";
import { Package, Truck } from "lucide-react";
import { cn } from "@/lib/cn";
import { apiFetchHealthDetails } from "@/lib/api/client";
import { isDataApiEnabled } from "@/lib/api/config";
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
 * Live vs sim badge follows /api/health shippingCarrierLive (Omniva keys on API).
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
  const [omnivaLive, setOmnivaLive] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isDataApiEnabled()) {
      setOmnivaLive(false);
      return;
    }
    let cancelled = false;
    void apiFetchHealthDetails().then((r) => {
      if (cancelled) return;
      const provider = String(
        r.data.infra?.shippingCarrierProvider ?? ""
      ).toLowerCase();
      setOmnivaLive(
        Boolean(r.ok && r.data.infra?.shippingCarrierLive) &&
          (provider === "omniva" || provider.includes("omniva"))
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const showLive = omnivaLive === true;
  const showSim = omnivaLive === false;

  return (
    <section
      className="space-y-2 rounded-xl border border-[var(--vauto-border)]/70 bg-[var(--vauto-surface-muted)]/25 p-3"
      data-omniva-eligible={showOmniva ? "true" : "false"}
      data-omniva-live={showLive ? "true" : showSim ? "false" : "unknown"}
      data-estimated-size={eligibility.estimatedSize}
    >
      <p className="text-sm font-semibold text-[var(--vauto-text)]">
        Pristatymas
      </p>
      <p className="text-[11px] text-[var(--vauto-text-muted)]">
        Omniva L max 39×38×64 cm · ≤30 kg
      </p>
      {showOmniva && showLive ? (
        <p
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-emerald-800 dark:text-emerald-200"
          data-omniva-live-banner="1"
          role="status"
        >
          Omniva live — lipdukai generuojami per oficialų OMX API.
        </p>
      ) : null}
      {showOmniva && showSim ? (
        <p
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-semibold leading-snug text-amber-800 dark:text-amber-200"
          data-omniva-sim="1"
          role="status"
        >
          Simuliacija — Omniva raktai serveryje neaktyvūs.
        </p>
      ) : null}

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
              <span className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-[var(--vauto-text)]">
                <Package
                  className="h-3.5 w-3.5 shrink-0 text-[var(--vauto-primary)]"
                  aria-hidden
                />
                Omniva paštomatas
                {showLive ? (
                  <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                    Live
                  </span>
                ) : null}
                {showSim ? (
                  <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                    Simuliacija
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-[var(--vauto-text-muted)]">
                {showLive
                  ? `Prekė telpa (dydis ${eligibility.estimatedSize}) — oficialus Omniva paštomatas`
                  : `Prekė telpa (dydis ${eligibility.estimatedSize})`}
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
