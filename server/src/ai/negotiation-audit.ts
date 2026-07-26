import { pool } from "../db.js";

export interface NegotiationAuditEntry {
  threadId?: string;
  listingId?: string;
  sellerUserId?: string;
  buyerMessage: string;
  autoReply?: string;
  offeredPrice?: number;
  counterPrice?: number;
  dealReady?: boolean;
  escalated?: boolean;
  escalateReason?: string;
  ruleApplied?: string;
  templateId?: string;
}

let auditMissingWarned = false;

export async function logNegotiationAudit(
  entry: NegotiationAuditEntry
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO negotiation_audit_log (
        thread_id, listing_id, seller_user_id, buyer_message, auto_reply,
        offered_price, counter_price, deal_ready, escalated, escalate_reason,
        rule_applied, template_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        entry.threadId ?? null,
        entry.listingId ?? null,
        entry.sellerUserId ?? null,
        entry.buyerMessage.slice(0, 4000),
        entry.autoReply?.slice(0, 4000) ?? null,
        entry.offeredPrice ?? null,
        entry.counterPrice ?? null,
        entry.dealReady ?? false,
        entry.escalated ?? false,
        entry.escalateReason ?? null,
        entry.ruleApplied ?? null,
        entry.templateId ?? null,
      ]
    );
  } catch (err) {
    if (!auditMissingWarned) {
      auditMissingWarned = true;
      console.warn(
        "[negotiation-audit] insert failed (migration 021/027 applied?):",
        err instanceof Error ? err.message : String(err)
      );
    }
  }
}

export interface TwinEscalateRate {
  twinSessions: number;
  escalatedSessions: number;
  rate: number;
  windowHours: number;
}

/**
 * Constitution KPI #5 — twin escalate rate over distinct threads
 * that produced at least one audited twin action.
 */
export async function computeTwinEscalateRate(
  windowHours = 24 * 7
): Promise<TwinEscalateRate> {
  const hours = Math.max(1, Math.min(24 * 90, Math.round(windowHours)));
  try {
    const { rows } = await pool.query<{
      twin_sessions: string;
      escalated_sessions: string;
    }>(
      `SELECT
         COUNT(DISTINCT thread_id)::text AS twin_sessions,
         COUNT(DISTINCT thread_id) FILTER (
           WHERE escalated = TRUE
         )::text AS escalated_sessions
       FROM negotiation_audit_log
       WHERE created_at >= NOW() - ($1::text || ' hours')::interval
         AND thread_id IS NOT NULL
         AND (
           auto_reply IS NOT NULL
           OR escalated = TRUE
           OR rule_applied LIKE 'template_%'
         )`,
      [String(hours)]
    );
    const twinSessions = Number(rows[0]?.twin_sessions ?? 0) || 0;
    const escalatedSessions = Number(rows[0]?.escalated_sessions ?? 0) || 0;
    const rate = twinSessions > 0 ? escalatedSessions / twinSessions : 0;
    return { twinSessions, escalatedSessions, rate, windowHours: hours };
  } catch {
    return {
      twinSessions: 0,
      escalatedSessions: 0,
      rate: 0,
      windowHours: hours,
    };
  }
}
