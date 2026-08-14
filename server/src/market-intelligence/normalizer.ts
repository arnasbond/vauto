/**
 * Subject + observation normalization via Foundation Domain Normalizer.
 */

import { normalizeLithuanianDomainText } from "../ai/foundation/domain-normalizer/index.js";
import type { MarketObservation, MarketSubject } from "./types.js";

function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFC");
}

export function normalizeMarketSubject(subject: MarketSubject): MarketSubject {
  const blob = [subject.brand, subject.model, subject.location, subject.condition]
    .filter(Boolean)
    .join(" ");
  const domain = normalizeLithuanianDomainText(blob);
  const next: MarketSubject = { ...subject, attributes: { ...(subject.attributes ?? {}) } };

  for (const a of domain.attributes) {
    if (a.kind === "location" && !next.location) next.location = a.value;
    if (a.kind === "fuel") next.attributes!.fuel = a.value;
    if (a.kind === "transmission") next.attributes!.transmission = a.value;
    if (a.kind === "drivetrain") {
      next.attributes!.drivetrain = a.value;
      if (!next.brand && a.context) next.brand = a.context;
    }
    if (a.kind === "commerce") {
      next.attributes!.vatInvoice = true;
    }
  }

  if (next.brand) next.brand = next.brand.trim();
  if (next.model) next.model = next.model.trim();
  return next;
}

export function normalizeObservation(obs: MarketObservation): MarketObservation | null {
  if (!Number.isFinite(obs.price) || obs.price <= 0) return null;
  return {
    ...obs,
    brand: obs.brand?.trim() ?? null,
    model: obs.model?.trim() ?? null,
    location: obs.location?.trim() ?? null,
    dedupeKey:
      obs.dedupeKey ??
      [norm(obs.brand), norm(obs.model), obs.price, norm(obs.location), obs.priceSource].join(
        "|"
      ),
  };
}

export function sameBrandModel(
  a: { brand?: string | null; model?: string | null },
  b: { brand?: string | null; model?: string | null }
): boolean {
  return norm(a.brand) === norm(b.brand) && norm(a.model) === norm(b.model);
}
