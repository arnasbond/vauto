/**
 * Stage 11H.2 — vauto_disputes repository (decision vs financial finality).
 */

import { randomUUID } from "node:crypto";
import type { TxQueryable } from "../transaction/index.js";
import { DISPUTE_ENGINE_VERSION } from "./version.js";
import type {
  DisputeEvidence,
  DisputeReason,
  DisputeStatus,
  VautoDispute,
} from "./types.js";

type DisputeRow = {
  id: string;
  transaction_id: string;
  opened_by_user_id: string;
  reason: string;
  description: string;
  evidence_json: DisputeEvidence | string | null;
  status: string;
  resolution_notes: string | null;
  resolved_by_user_id: string | null;
  dispute_engine_version: string;
  created_at: string | Date;
  resolved_at: string | Date | null;
};

function mapEvidence(
  raw: DisputeEvidence | string | null
): DisputeEvidence | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    return JSON.parse(raw) as DisputeEvidence;
  }
  return raw;
}

function mapRow(r: DisputeRow): VautoDispute {
  return {
    id: r.id,
    transactionId: r.transaction_id,
    openedByUserId: r.opened_by_user_id,
    reason: r.reason as DisputeReason,
    description: r.description,
    evidenceJson: mapEvidence(r.evidence_json),
    status: r.status as DisputeStatus,
    resolutionNotes: r.resolution_notes,
    resolvedByUserId: r.resolved_by_user_id,
    disputeEngineVersion: DISPUTE_ENGINE_VERSION,
    createdAt:
      typeof r.created_at === "string"
        ? r.created_at
        : r.created_at.toISOString(),
    resolvedAt:
      r.resolved_at == null
        ? null
        : typeof r.resolved_at === "string"
          ? r.resolved_at
          : r.resolved_at.toISOString(),
  };
}

export class DisputeRepository {
  constructor(private readonly db: TxQueryable) {}

  async getByTransactionId(
    transactionId: string
  ): Promise<VautoDispute | null> {
    const res = await this.db.query<DisputeRow>(
      `SELECT * FROM vauto_disputes WHERE transaction_id = $1 LIMIT 1`,
      [transactionId]
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  async getByTransactionIdForUpdate(
    transactionId: string
  ): Promise<VautoDispute | null> {
    const res = await this.db.query<DisputeRow>(
      `SELECT * FROM vauto_disputes WHERE transaction_id = $1 LIMIT 1 FOR UPDATE`,
      [transactionId]
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  async getById(id: string): Promise<VautoDispute | null> {
    const res = await this.db.query<DisputeRow>(
      `SELECT * FROM vauto_disputes WHERE id = $1 LIMIT 1`,
      [id]
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  async insert(input: {
    transactionId: string;
    openedByUserId: string;
    reason: DisputeReason;
    description: string;
    evidenceJson: DisputeEvidence;
    status?: DisputeStatus;
  }): Promise<VautoDispute> {
    const id = `dsp_${randomUUID().replace(/-/g, "")}`;
    const res = await this.db.query<DisputeRow>(
      `INSERT INTO vauto_disputes (
         id, transaction_id, opened_by_user_id, reason, description,
         evidence_json, status, dispute_engine_version
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
       RETURNING *`,
      [
        id,
        input.transactionId,
        input.openedByUserId,
        input.reason,
        input.description,
        JSON.stringify(input.evidenceJson),
        input.status ?? "OPEN",
        DISPUTE_ENGINE_VERSION,
      ]
    );
    return mapRow(res.rows[0]!);
  }

  /** C-01: record arbitration decision only (not financial finality). */
  async markDecided(input: {
    id: string;
    status: "DECIDED_BUYER_REFUND" | "DECIDED_SELLER_PAYOUT";
    resolvedByUserId: string;
    resolutionNotes: string | null;
  }): Promise<VautoDispute> {
    const res = await this.db.query<DisputeRow>(
      `UPDATE vauto_disputes
       SET status = $2,
           resolved_by_user_id = $3,
           resolution_notes = $4
       WHERE id = $1 AND status IN ('OPEN', 'UNDER_REVIEW')
       RETURNING *`,
      [
        input.id,
        input.status,
        input.resolvedByUserId,
        input.resolutionNotes,
      ]
    );
    if (!res.rows[0]) {
      throw new Error(`dispute_decide_race:${input.id}`);
    }
    return mapRow(res.rows[0]);
  }

  /** After 11F confirms success — permanent RESOLVED_* + resolved_at. */
  async markFinanciallyResolved(input: {
    id: string;
    status: "RESOLVED_BUYER_REFUND" | "RESOLVED_SELLER_PAYOUT";
  }): Promise<VautoDispute> {
    const res = await this.db.query<DisputeRow>(
      `UPDATE vauto_disputes
       SET status = $2,
           resolved_at = NOW()
       WHERE id = $1
         AND status IN ('DECIDED_BUYER_REFUND', 'DECIDED_SELLER_PAYOUT')
       RETURNING *`,
      [input.id, input.status]
    );
    if (!res.rows[0]) {
      throw new Error(`dispute_financial_resolve_race:${input.id}`);
    }
    return mapRow(res.rows[0]);
  }
}
