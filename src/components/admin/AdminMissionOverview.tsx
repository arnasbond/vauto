"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AiInsightCard,
  Badge,
  Card,
  StatCard,
} from "@/design-system";
import { apiFetchHealthDetails, type ApiHealthDetails } from "@/lib/api/client";
import { useVauto } from "@/context/VautoContext";
import { useAdminProjectContext } from "@/context/AdminProjectContext";
import { cn } from "@/lib/cn";

export type AdminMissionOverviewProps = {
  onOpenModeration?: () => void;
  onOpenListings?: () => void;
  onOpenAi?: () => void;
  className?: string;
};

type HealthTone = "ok" | "warn" | "danger";

function healthTone(ok: boolean, readiness: number): HealthTone {
  if (!ok || readiness < 50) return "danger";
  if (readiness < 80) return "warn";
  return "ok";
}

function StatusDot({ tone }: { tone: HealthTone }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        tone === "ok" && "bg-[var(--ds-success)]",
        tone === "warn" && "bg-[var(--ds-warning)]",
        tone === "danger" && "bg-[var(--ds-danger)]"
      )}
      aria-hidden
    />
  );
}

/**
 * Mission Control 2.0 — KPI juosta + sistemos statuso indikatoriai.
 * Tik UI; duomenys iš esamų useVauto / health endpointų.
 */
export function AdminMissionOverview({
  onOpenModeration,
  onOpenListings,
  onOpenAi,
  className,
}: AdminMissionOverviewProps) {
  const { listings, reports } = useVauto();
  const geminiCtx = useAdminProjectContext();
  const [health, setHealth] = useState<ApiHealthDetails | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const refreshHealth = useCallback(async () => {
    const t0 = performance.now();
    const res = await apiFetchHealthDetails();
    const t1 = performance.now();
    setLatencyMs(Math.round(t1 - t0));
    if (res.ok) setHealth(res.data);
  }, []);

  useEffect(() => {
    void refreshHealth();
    const id = window.setInterval(() => void refreshHealth(), 15_000);
    return () => window.clearInterval(id);
  }, [refreshHealth]);

  const metrics = useMemo(() => {
    const activeUsers = new Set(
      listings.map((l) => l.sellerId).filter(Boolean)
    ).size;
    const openReports = reports.filter((r) => r.status === "open");
    const critical = openReports.filter((r) => r.urgency === "critical").length;
    const moderationQueue =
      openReports.length +
      listings.filter((l) => l.requiresReview && !l.banned).length;
    const pendingListings = listings.filter(
      (l) => l.requiresReview && !l.banned
    ).length;
    const geminiOk = Boolean(
      health?.features?.gemini || health?.infra?.geminiConfigured
    );
    const readiness = health?.readiness?.score ?? 0;
    const systemOk = Boolean(health?.ok);
    const tone = healthTone(systemOk && geminiOk, readiness);
    const checkoutBlocked = Boolean(health?.infra?.disableCheckout);
    const stripeOk = Boolean(health?.features?.stripe);
    const escrowLabel = checkoutBlocked
      ? "Blokuota"
      : stripeOk
        ? "Operatyvi"
        : "Neįjungta";
    const systemAlerts =
      (health?.infra?.warnings?.length ?? 0) + critical;
    const geminiChars = geminiCtx?.contextText.length ?? 0;

    return {
      activeUsers,
      moderationQueue,
      pendingListings,
      openReports: openReports.length,
      critical,
      geminiOk,
      readiness,
      tone,
      latencyMs,
      escrowLabel,
      systemAlerts,
      geminiChars,
      checkoutBlocked,
    };
  }, [listings, reports, health, latencyMs, geminiCtx?.contextText.length]);

  const geminiStatusLabel = metrics.geminiOk
    ? metrics.latencyMs != null
      ? `Operatyvus · ${metrics.latencyMs} ms`
      : "Operatyvus"
    : "Sutrikimas";

  const systemToneBadge =
    metrics.tone === "ok"
      ? { tone: "success" as const, label: "Operatyvus" }
      : metrics.tone === "warn"
        ? { tone: "warning" as const, label: "Įspėjimas" }
        : { tone: "danger" as const, label: "Sutrikimas" };

  return (
    <div
      data-cc-mission-8="kpi"
      className={cn("space-y-3", className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={systemToneBadge.tone} className="gap-1.5">
          <StatusDot tone={metrics.tone} />
          Sistema: {systemToneBadge.label}
        </Badge>
        <Badge tone={metrics.geminiOk ? "success" : "danger"} className="gap-1.5">
          <StatusDot tone={metrics.geminiOk ? "ok" : "danger"} />
          Gemini: {metrics.geminiOk ? "Operatyvus" : "Sutrikimas"}
        </Badge>
        <Badge
          tone={
            metrics.checkoutBlocked
              ? "danger"
              : metrics.escrowLabel === "Operatyvi"
                ? "success"
                : "warning"
          }
          className="gap-1.5"
        >
          <StatusDot
            tone={
              metrics.checkoutBlocked
                ? "danger"
                : metrics.escrowLabel === "Operatyvi"
                  ? "ok"
                  : "warn"
            }
          />
          Escrow: {metrics.escrowLabel}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Aktyvūs vartotojai"
          value={String(metrics.activeUsers)}
          hint="Unikalūs pardavėjai / paskyros"
        />
        <StatCard
          label="Moderacijos eilė"
          value={String(metrics.moderationQueue)}
          hint={`${metrics.pendingListings} skelb. · ${metrics.openReports} praneš.`}
          trend={metrics.moderationQueue > 0 ? "up" : "flat"}
        />
        <StatCard
          label="AI Gemini"
          value={geminiStatusLabel}
          hint={
            metrics.latencyMs != null
              ? `Health latency ${metrics.latencyMs} ms`
              : "Health poll"
          }
          trend={metrics.geminiOk ? "up" : "down"}
        />
        <StatCard
          label="Escrow apyvarta"
          value={metrics.escrowLabel}
          hint={
            metrics.checkoutBlocked
              ? "Checkout kill-switch įjungtas"
              : "Stripe checkout būsena"
          }
        />
        <StatCard
          label="Sistemos pranešimai"
          value={String(metrics.systemAlerts)}
          hint={`${metrics.critical} kritiniai · readiness ${metrics.readiness} %`}
          trend={metrics.systemAlerts > 0 ? "down" : "flat"}
        />
      </div>

      <AiInsightCard
        title="Mission Control įžvalga"
        body={
          metrics.moderationQueue > 0
            ? `Eilėje ${metrics.moderationQueue} elementai (${metrics.critical} kritiniai pranešimai, ${metrics.pendingListings} skelbimai). Gemini kontekstas: ${metrics.geminiChars.toLocaleString("lt-LT")} simb.`
            : `Sistema ${systemToneBadge.label.toLowerCase()}. Moderacijos eilė tuščia. Gemini kontekstas: ${metrics.geminiChars.toLocaleString("lt-LT")} simb.`
        }
        ctaLabel={
          metrics.pendingListings > 0
            ? "Atidaryti skelbimų eilę"
            : metrics.openReports > 0
              ? "Atidaryti pranešimus"
              : "AI kontekstas"
        }
        onCta={
          metrics.pendingListings > 0
            ? onOpenListings
            : metrics.openReports > 0
              ? onOpenModeration
              : onOpenAi
        }
      />
    </div>
  );
}

/** Optional compact status card for ops tab reuse. */
export function AdminHealthLegend() {
  return (
    <Card variant="muted" className="flex flex-wrap gap-3 py-3 text-xs">
      <span className="inline-flex items-center gap-1.5 text-[var(--ds-text-secondary)]">
        <StatusDot tone="ok" /> Emerald = Operatyvus
      </span>
      <span className="inline-flex items-center gap-1.5 text-[var(--ds-text-secondary)]">
        <StatusDot tone="warn" /> Amber = Įspėjimas
      </span>
      <span className="inline-flex items-center gap-1.5 text-[var(--ds-text-secondary)]">
        <StatusDot tone="danger" /> Danger = Sutrikimas
      </span>
    </Card>
  );
}
