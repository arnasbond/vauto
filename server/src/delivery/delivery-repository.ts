/**
 * Stage 11G — Delivery repository (vauto_deliveries) + M-01 monotonic updates.
 */

import { randomUUID } from "node:crypto";
import type { TxQueryable } from "../transaction/index.js";
import { DELIVERY_INTEGRATION_VERSION } from "./version.js";
import { assertMonotonicDeliveryTransition } from "./status-monotonic.js";
import type {
  DeliveryCarrier,
  DeliveryStatus,
  VautoDelivery,
} from "./types.js";
import { DeliveryStateError } from "./types.js";

type DeliveryRow = {
  id: string;
  transaction_id: string;
  carrier: string;
  tracking_code: string;
  terminal_id: string | null;
  shipping_fee_cents: number | string;
  status: string;
  carrier_label_id: string | null;
  tracking_url: string | null;
  delivery_integration_version: string;
  created_at: string | Date;
  updated_at: string | Date;
};

function mapRow(r: DeliveryRow): VautoDelivery {
  return {
    id: r.id,
    transactionId: r.transaction_id,
    carrier: r.carrier as DeliveryCarrier,
    trackingCode: r.tracking_code,
    terminalId: r.terminal_id,
    shippingFeeCents: Number(r.shipping_fee_cents),
    status: r.status as DeliveryStatus,
    carrierLabelId: r.carrier_label_id,
    trackingUrl: r.tracking_url,
    deliveryIntegrationVersion: DELIVERY_INTEGRATION_VERSION,
    createdAt:
      typeof r.created_at === "string"
        ? r.created_at
        : r.created_at.toISOString(),
    updatedAt:
      typeof r.updated_at === "string"
        ? r.updated_at
        : r.updated_at.toISOString(),
  };
}

export class DeliveryRepository {
  constructor(private readonly db: TxQueryable) {}

  async getByTransactionId(
    transactionId: string
  ): Promise<VautoDelivery | null> {
    const res = await this.db.query<DeliveryRow>(
      `SELECT * FROM vauto_deliveries WHERE transaction_id = $1 LIMIT 1`,
      [transactionId]
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  async getByTransactionIdForUpdate(
    transactionId: string
  ): Promise<VautoDelivery | null> {
    const res = await this.db.query<DeliveryRow>(
      `SELECT * FROM vauto_deliveries WHERE transaction_id = $1 LIMIT 1 FOR UPDATE`,
      [transactionId]
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  async insert(input: {
    transactionId: string;
    carrier: DeliveryCarrier;
    trackingCode: string;
    terminalId: string | null;
    shippingFeeCents: number;
    status: DeliveryStatus;
    carrierLabelId: string | null;
    trackingUrl: string | null;
  }): Promise<VautoDelivery> {
    const id = `dlv_${randomUUID().replace(/-/g, "")}`;
    const res = await this.db.query<DeliveryRow>(
      `INSERT INTO vauto_deliveries (
         id, transaction_id, carrier, tracking_code, terminal_id,
         shipping_fee_cents, status, carrier_label_id, tracking_url,
         delivery_integration_version
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        id,
        input.transactionId,
        input.carrier,
        input.trackingCode,
        input.terminalId,
        input.shippingFeeCents,
        input.status,
        input.carrierLabelId,
        input.trackingUrl,
        DELIVERY_INTEGRATION_VERSION,
      ]
    );
    return mapRow(res.rows[0]!);
  }

  async updateStatus(
    id: string,
    status: DeliveryStatus,
    expectedCurrent?: DeliveryStatus
  ): Promise<VautoDelivery> {
    const current = await this.db.query<DeliveryRow>(
      `SELECT * FROM vauto_deliveries WHERE id = $1 FOR UPDATE`,
      [id]
    );
    const row = current.rows[0];
    if (!row) throw new Error(`delivery_missing:${id}`);
    const from = row.status as DeliveryStatus;
    if (expectedCurrent && from !== expectedCurrent) {
      throw new DeliveryStateError(
        `Delivery status race: expected ${expectedCurrent}, got ${from}`
      );
    }
    assertMonotonicDeliveryTransition(from, status);
    if (from === status) return mapRow(row);

    const res = await this.db.query<DeliveryRow>(
      `UPDATE vauto_deliveries SET status = $1, updated_at = NOW()
       WHERE id = $2 AND status = $3 RETURNING *`,
      [status, id, from]
    );
    if (!res.rows[0]) {
      throw new DeliveryStateError(
        `Delivery status update race: ${from} → ${status}`
      );
    }
    return mapRow(res.rows[0]);
  }
}
