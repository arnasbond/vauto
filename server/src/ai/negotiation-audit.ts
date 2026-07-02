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
}

export async function logNegotiationAudit(entry: NegotiationAuditEntry): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO negotiation_audit_log (
        thread_id, listing_id, seller_user_id, buyer_message, auto_reply,
        offered_price, counter_price, deal_ready, escalated, escalate_reason, rule_applied
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
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
      ]
    );
  } catch {
    /* table may not exist in dev — best effort */
  }
}
