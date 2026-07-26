/**
 * Constitution §4 — hero KPIs (Phase A).
 * Console via logAnalytics; callers also `trackEvent` → `/api/user/behavior-events`.
 * Doc aliases: listing_flow_started, time_to_publish_ms, profile_reask,
 * buyer_message_notified_ms — see docs/PHASE_A_CLOSEOUT.md.
 */
import { logAnalytics, type AnalyticsEvent } from "@/lib/analytics";

const FLOW_START_KEY = "vauto_hero_listing_flow_start_ms";

export type HeroKpiEvent =
  | "kpi_listing_flow_start"
  | "kpi_listing_published"
  | "kpi_contact_reask"
  | "kpi_first_response_signal"
  | "twin_escalate";

function emit(
  event: HeroKpiEvent,
  payload: Record<string, string | number | boolean | undefined>
): void {
  logAnalytics(event as AnalyticsEvent, payload);
}

/** KPI 1+2: mark sell flow start (chat open / first processing). */
export function markHeroListingFlowStart(source: string): void {
  if (typeof window === "undefined") return;
  try {
    if (!sessionStorage.getItem(FLOW_START_KEY)) {
      sessionStorage.setItem(FLOW_START_KEY, String(Date.now()));
      emit("kpi_listing_flow_start", { source, alias: "listing_flow_started" });
    }
  } catch {
    emit("kpi_listing_flow_start", { source, alias: "listing_flow_started" });
  }
}

/** KPI 1 (duration) + KPI 2 (completion numerator). Returns time_to_publish_ms. */
export function completeHeroListingFlow(opts: {
  listingId: string;
  pendingReview?: boolean;
}): { time_to_publish_ms?: number } {
  let durationMs: number | undefined;
  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(FLOW_START_KEY);
      if (raw) {
        const start = Number(raw);
        if (Number.isFinite(start) && start > 0) {
          durationMs = Math.max(0, Date.now() - start);
        }
        sessionStorage.removeItem(FLOW_START_KEY);
      }
    } catch {
      /* ignore */
    }
  }
  emit("kpi_listing_published", {
    listingId: opts.listingId,
    durationMs,
    time_to_publish_ms: durationMs,
    pendingReview: Boolean(opts.pendingReview),
    alias: "listing_published",
  });
  return { time_to_publish_ms: durationMs };
}

/**
 * KPI 3: agent asked for phone/city though profile already has it.
 * Call only when surfacing a contact prompt while profileHad=true.
 */
export function logHeroContactReask(field: "phone" | "city", source: string): void {
  emit("kpi_contact_reask", {
    field,
    source,
    profileHad: true,
    alias: "profile_reask",
  });
}

/** KPI 4: buyer message timestamp → seller signal (toast/push). */
export function logHeroFirstResponseSignal(opts: {
  chatId: string;
  messageSentAt?: string;
  channel: "incoming_alert" | "local_push";
}): { latencyMs?: number } {
  let latencyMs: number | undefined;
  if (opts.messageSentAt) {
    const sent = Date.parse(opts.messageSentAt);
    if (Number.isFinite(sent)) {
      latencyMs = Math.max(0, Date.now() - sent);
    }
  }
  emit("kpi_first_response_signal", {
    chatId: opts.chatId,
    latencyMs,
    buyer_message_notified_ms: latencyMs,
    channel: opts.channel,
  });
  return { latencyMs };
}
