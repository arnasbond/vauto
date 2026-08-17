import { randomUUID } from "node:crypto";
import type { TxQueryable } from "../../transaction/repository.js";
import type {
  FinancialObligation,
  FinancialObligationStatus,
  FinancialObligationType,
} from "./financial-obligation-types.js";

type Row = {
  id: string;
  transaction_id: string;
  type: string;
  amount_cents: string | number;
  currency: string;
  payer_id: string;
  beneficiary_id: string;
  status: string;
  payment_provider_ref: string | null;
  created_at: Date | string;
  idempotency_key?: string | null;
  source_obligation_id?: string | null;
  payment_provider?: string | null;
  provider_event_id?: string | null;
  provider_verified_at?: Date | string | null;
};

function iso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

function mapRow(r: Row): FinancialObligation {
  return {
    id: r.id,
    transactionId: r.transaction_id,
    type: r.type as FinancialObligationType,
    amountCents: Number(r.amount_cents),
    currency: r.currency,
    payerId: r.payer_id,
    beneficiaryId: r.beneficiary_id,
    status: r.status as FinancialObligationStatus,
    paymentProviderRef: r.payment_provider_ref,
    createdAt:
      r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    idempotencyKey: r.idempotency_key ?? null,
    sourceObligationId: r.source_obligation_id ?? null,
    paymentProvider: r.payment_provider ?? null,
    providerEventId: r.provider_event_id ?? null,
    providerVerifiedAt: iso(r.provider_verified_at ?? null),
  };
}

export class FinancialObligationRepository {
  constructor(private readonly db: TxQueryable) {}

  async insert(input: {
    transactionId: string;
    type: FinancialObligationType;
    amountCents: number;
    currency?: string;
    payerId: string;
    beneficiaryId: string;
    status?: FinancialObligationStatus;
    idempotencyKey?: string | null;
    sourceObligationId?: string | null;
  }): Promise<FinancialObligation> {
    const id = `obl_${randomUUID().replace(/-/g, "")}`;
    const res = await this.db.query<Row>(
      `INSERT INTO vauto_financial_obligations (
         id, transaction_id, type, amount_cents, currency,
         payer_id, beneficiary_id, status, payment_provider_ref,
         idempotency_key, source_obligation_id,
         payment_provider, provider_event_id, provider_verified_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        id,
        input.transactionId,
        input.type,
        input.amountCents,
        input.currency ?? "EUR",
        input.payerId,
        input.beneficiaryId,
        input.status ?? "CREATED",
        null,
        input.idempotencyKey ?? null,
        input.sourceObligationId ?? null,
        null,
        null,
        null,
      ]
    );
    return mapRow(res.rows[0]!);
  }

  async listByTransaction(transactionId: string): Promise<FinancialObligation[]> {
    const res = await this.db.query<Row>(
      `SELECT * FROM vauto_financial_obligations
       WHERE transaction_id = $1
       ORDER BY created_at ASC, id ASC`,
      [transactionId]
    );
    return res.rows.map(mapRow);
  }

  async listByTransactionForUpdate(
    transactionId: string
  ): Promise<FinancialObligation[]> {
    const res = await this.db.query<Row>(
      `SELECT * FROM vauto_financial_obligations
       WHERE transaction_id = $1
       ORDER BY created_at ASC, id ASC
       FOR UPDATE`,
      [transactionId]
    );
    return res.rows.map(mapRow);
  }

  async getById(id: string): Promise<FinancialObligation | null> {
    const res = await this.db.query<Row>(
      `SELECT * FROM vauto_financial_obligations WHERE id = $1`,
      [id]
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  async getByIdForUpdate(id: string): Promise<FinancialObligation | null> {
    const res = await this.db.query<Row>(
      `SELECT * FROM vauto_financial_obligations WHERE id = $1 FOR UPDATE`,
      [id]
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  async updateStatus(
    id: string,
    status: FinancialObligationStatus
  ): Promise<FinancialObligation> {
    const res = await this.db.query<Row>(
      `UPDATE vauto_financial_obligations SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );
    return mapRow(res.rows[0]!);
  }

  async findUnverifiedPrimaryForUpdate(input: {
    transactionId: string;
    amountCents?: number;
  }): Promise<FinancialObligation | null> {
    const res =
      input.amountCents != null
        ? await this.db.query<Row>(
            `SELECT * FROM vauto_financial_obligations
             WHERE transaction_id = $1
               AND type IN ('PURCHASE_PRICE', 'RESERVATION_DEPOSIT', 'SERVICE_DEPOSIT')
               AND provider_verified_at IS NULL
               AND amount_cents = $2
             ORDER BY created_at ASC, id ASC
             LIMIT 1
             FOR UPDATE`,
            [input.transactionId, input.amountCents]
          )
        : await this.db.query<Row>(
            `SELECT * FROM vauto_financial_obligations
             WHERE transaction_id = $1
               AND type IN ('PURCHASE_PRICE', 'RESERVATION_DEPOSIT', 'SERVICE_DEPOSIT')
               AND provider_verified_at IS NULL
             ORDER BY created_at ASC, id ASC
             LIMIT 1
             FOR UPDATE`,
            [input.transactionId]
          );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }
}
