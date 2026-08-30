import type {
  VinReviewSideEffectPayload,
  VinReviewStructuredAction,
} from "@vauto/shared/vin-review";

function normalizeChip(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[!?.,…]+$/g, "");
}

const VIN_CHIP_PATTERNS: RegExp[] = [
  /^patvirtinti\s+vin$/i,
  /^pasirinkti\s+vin$/i,
  /^įvesti\s+kitą\s+vin$/i,
  /^ivesti\s+kita\s+vin$/i,
  /^nežinau\s+vin$/i,
  /^nezinau\s+vin$/i,
];

export function isVinReviewChipLabel(text: string): boolean {
  const n = normalizeChip(text);
  return VIN_CHIP_PATTERNS.some((re) => re.test(n));
}

/**
 * Phase 2C — quick-reply chip labels are display-only. Tapping one routes to the
 * TRUSTED `vin_review` payload (the only authority channel): confirm uses the
 * payload's exact value + reviewId; reject uses the payload's reviewId; the
 * selection/correction chips simply keep the review card visible. Returns true
 * when the chip was consumed — the text must never be sent to the agent.
 */
export function routeVinReviewChip(
  chip: string,
  review: VinReviewSideEffectPayload | null | undefined,
  emit: (action: VinReviewStructuredAction) => void
): boolean {
  if (!review) return false;
  const n = normalizeChip(chip);

  if (/^patvirtinti\s+vin$/i.test(n)) {
    const value =
      review.candidate ??
      review.choices[0]?.value ??
      "";
    if (value) {
      emit({ type: "confirm", value, reviewId: review.reviewId });
      return true;
    }
    return true;
  }
  if (/^nežinau\s+vin$/i.test(n) || /^nezinau\s+vin$/i.test(n)) {
    emit({ type: "reject", reviewId: review.reviewId });
    return true;
  }
  if (/^pasirinkti\s+vin$/i.test(n) || /^įvesti\s+kitą\s+vin$/i.test(n) || /^ivesti\s+kita\s+vin$/i.test(n)) {
    // The review card above already exposes the choices / correction input.
    return true;
  }
  return false;
}
