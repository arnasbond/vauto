"use client";

import {
  claimBadgeClass,
  featureClaimStateLabel,
  type FeatureClaim,
} from "@/lib/feature-readiness";

export function FeatureClaimsPanel({
  claims,
  compact = false,
}: {
  claims: FeatureClaim[];
  compact?: boolean;
}) {
  if (!claims.length) return null;

  return (
    <div
      className="rounded-2xl border border-border bg-card/70 p-3"
      data-testid="feature-claims-panel"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        Pažadų būsena
      </p>
      <ul className={`mt-2 ${compact ? "space-y-1.5" : "space-y-2"}`}>
        {claims.map((claim) => (
          <li
            key={claim.id}
            className={`flex flex-wrap items-center justify-between gap-2 ${
              compact ? "text-[10px]" : "text-xs"
            }`}
          >
            <span className="font-medium text-foreground">{claim.label}</span>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${claimBadgeClass(claim.state)}`}
              title={claim.hint}
            >
              {featureClaimStateLabel(claim.state)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
