/**
 * Stage 11G.1 — Wire 11F.4 FundsTransferService as release port for delivery confirm.
 */

import type { TxQueryable } from "../transaction/index.js";
import { createFundsTransferService } from "../payments/transfer/index.js";
import type { ReleaseFundsPort } from "./types.js";

export function createFundsReleasePort(db: TxQueryable): ReleaseFundsPort {
  const funds = createFundsTransferService(db);
  return {
    async releaseToSeller(input) {
      const res = await funds.releaseToSeller(input);
      return {
        transferStatus: res.transferStatus,
        status: res.status,
      };
    },
  };
}
