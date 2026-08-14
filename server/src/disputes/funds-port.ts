/**
 * Stage 11H.1 — Wire 11F.4 FundsTransferService as dispute funds port.
 */

import type { TxQueryable } from "../transaction/index.js";
import { createFundsTransferService } from "../payments/transfer/index.js";
import type { DisputeFundsPort } from "./types.js";

export function createDisputeFundsPort(db: TxQueryable): DisputeFundsPort {
  const funds = createFundsTransferService(db);
  return {
    async releaseToSeller(input) {
      const r = await funds.releaseToSeller(input);
      return { transferStatus: r.transferStatus, status: r.status };
    },
    async refundToBuyer(input) {
      const r = await funds.refundToBuyer(input);
      return { transferStatus: r.transferStatus, status: r.status };
    },
  };
}
