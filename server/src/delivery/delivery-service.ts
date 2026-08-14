/**
 * Stage 11G — Delivery service (11G.3 durable release + skip-state).
 * 11G.2: label ≠ SHIPPED; eligibility locks; production carrier boundary; monotonic statuses.
 * 11G.3 H-01: seller_release_jobs outbox on DELIVERED.
 * 11G.3 H-02: carrier DELIVERED from SHIPPING_PENDING → atomic SHIPPED → DELIVERED.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TransactionRepository,
  runQueryableTransaction,
  type TxQueryable,
} from "../transaction/index.js";
import {
  FakeCarrierAdapter,
  assertCarrierUsableInEnvironment,
  resolveDefaultCarrierAdapter,
  toPersistedDeliveryStatus,
} from "./carrier-adapter.js";
import { DeliveryRepository } from "./delivery-repository.js";
import {
  assertPayoutSafetyGates,
  assertReleaseEligibility,
} from "./release-eligibility.js";
import {
  ConfirmDeliveryBodySchema,
  CreateDeliveryLabelBodySchema,
  SyncCarrierStatusBodySchema,
} from "./schema.js";
import {
  SellerReleaseJobRepository,
  processSellerReleaseJobs,
} from "./seller-release-jobs.js";
import { isPhysicalScanStatus } from "./status-monotonic.js";
import { DELIVERY_INTEGRATION_VERSION } from "./version.js";
import {
  DeliveryAuthError,
  DeliveryCarrierUnavailableError,
  DeliveryNotFoundError,
  DeliveryStateError,
  type CarrierAdapter,
  type DeliveryResult,
  type ReleaseFundsPort,
  type VautoDelivery,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DELIVERY_MIGRATION_ID = "049_delivery_shipping_1.0";
export const DELIVERY_MIGRATION_SQL = readFileSync(
  path.resolve(__dirname, "../../migrations/049_delivery_shipping_1.0.sql"),
  "utf8"
);

export const DELIVERY_HARDENING_MIGRATION_ID =
  "050_delivery_authority_hardening_1.1";
export const DELIVERY_HARDENING_MIGRATION_SQL = readFileSync(
  path.resolve(
    __dirname,
    "../../migrations/050_delivery_authority_hardening_1.1.sql"
  ),
  "utf8"
);

export const DURABLE_RELEASE_MIGRATION_ID = "051_durable_release_jobs_1.0";
export const DURABLE_RELEASE_MIGRATION_SQL = readFileSync(
  path.resolve(
    __dirname,
    "../../migrations/051_durable_release_jobs_1.0.sql"
  ),
  "utf8"
);

export const STALE_RELEASE_RECOVERY_MIGRATION_ID =
  "052_stale_release_job_recovery_1.0";
export const STALE_RELEASE_RECOVERY_MIGRATION_SQL = readFileSync(
  path.resolve(
    __dirname,
    "../../migrations/052_stale_release_job_recovery_1.0.sql"
  ),
  "utf8"
);

function toResult(
  delivery: VautoDelivery,
  txn: { status: string; version: number },
  opts: {
    releaseTriggered: boolean;
    releaseTransferStatus: string | null;
    messageLt: string | null;
    idempotentReplay: boolean;
  }
): DeliveryResult {
  return {
    delivery,
    transactionStatus: txn.status,
    transactionVersion: txn.version,
    releaseTriggered: opts.releaseTriggered,
    releaseTransferStatus: opts.releaseTransferStatus,
    messageLt: opts.messageLt,
    idempotentReplay: opts.idempotentReplay,
    deliveryIntegrationVersion: DELIVERY_INTEGRATION_VERSION,
  };
}

export class DeliveryService {
  constructor(
    private readonly db: TxQueryable,
    private readonly carrier: CarrierAdapter,
    private readonly releasePort: ReleaseFundsPort | null
  ) {}

  private assertCarrierBoundary(): void {
    try {
      assertCarrierUsableInEnvironment(this.carrier);
    } catch (e) {
      if (e instanceof DeliveryCarrierUnavailableError) throw e;
      throw new DeliveryCarrierUnavailableError();
    }
  }

  private assertSystemTransitionAllowed(
    authoritySource: "user_poll" | "carrier_webhook" | "trusted_server"
  ): void {
    this.assertCarrierBoundary();
    if (this.carrier.authoritative) return;
    if (
      authoritySource === "carrier_webhook" ||
      authoritySource === "trusted_server"
    ) {
      return;
    }
    throw new DeliveryCarrierUnavailableError(
      "SYSTEM delivery transitions require authoritative carrier confirmation"
    );
  }

  /**
   * C-01: Seller creates label → PAID → SHIPPING_PENDING + LABEL_CREATED.
   * Never SHIPPED — physical scan (or skip-state DELIVERED) required.
   */
  async createLabel(input: {
    transactionId: string;
    actorUserId: string;
    body: unknown;
  }): Promise<DeliveryResult> {
    this.assertCarrierBoundary();
    const body = CreateDeliveryLabelBodySchema.parse(input.body);

    const label = await this.carrier.createLabel({
      transactionId: input.transactionId,
      carrier: body.carrier,
      terminalId: body.terminalId ?? null,
      shippingFeeCents: body.shippingFeeCents ?? 0,
      trackingCode: body.trackingCode ?? null,
    });

    return runQueryableTransaction(this.db, async (tx) => {
      const txRepo = new TransactionRepository(tx);
      const deliveries = new DeliveryRepository(tx);
      const txn = await txRepo.getById(input.transactionId);
      if (!txn) throw new DeliveryAuthError();
      if (txn.sellerId !== input.actorUserId) throw new DeliveryAuthError();

      const existing = await deliveries.getByTransactionId(input.transactionId);
      if (
        existing &&
        (txn.status === "SHIPPING_PENDING" ||
          txn.status === "SHIPPED" ||
          txn.status === "DELIVERED" ||
          txn.status === "COMPLETED")
      ) {
        return toResult(existing, txn, {
          releaseTriggered: false,
          releaseTransferStatus: null,
          messageLt: "Siuntos lipdukas jau sukurtas",
          idempotentReplay: true,
        });
      }
      if (existing) {
        throw new DeliveryStateError(
          `Delivery already exists in status ${existing.status}`
        );
      }

      let live = txn;
      if (live.status === "PAID") {
        live = (
          await txRepo.executeTransitionInTx(tx, {
            transactionId: live.id,
            toStatus: "SHIPPING_PENDING",
            actorType: "SELLER",
            actorId: input.actorUserId,
            reasonCode: "SHIPMENT_READY",
            expectedVersion: live.version,
            idempotencyKey: `dlv-ship-ready-${body.idempotencyKey}`,
            metadata: {
              carrier: body.carrier,
              trackingCode: label.trackingCode,
              deliveryIntegrationVersion: DELIVERY_INTEGRATION_VERSION,
            },
          })
        ).transaction;
      }

      if (live.status !== "SHIPPING_PENDING") {
        throw new DeliveryStateError(
          `Label requires PAID → SHIPPING_PENDING; got ${live.status}`
        );
      }

      const delivery = await deliveries.insert({
        transactionId: input.transactionId,
        carrier: body.carrier,
        trackingCode: label.trackingCode,
        terminalId: body.terminalId ?? null,
        shippingFeeCents: body.shippingFeeCents ?? 0,
        status: "LABEL_CREATED",
        carrierLabelId: label.labelId,
        trackingUrl: label.trackingUrl,
      });

      return toResult(delivery, live, {
        releaseTriggered: false,
        releaseTransferStatus: null,
        messageLt: "Siuntos lipdukas sukurtas — laukiama kurjerio priėmimo",
        idempotentReplay: false,
      });
    });
  }

  /**
   * Buyer confirms receipt → DELIVERED + durable release job → tryRelease.
   */
  async confirmDelivery(input: {
    transactionId: string;
    actorUserId: string;
    body: unknown;
  }): Promise<DeliveryResult> {
    const body = ConfirmDeliveryBodySchema.parse(input.body);

    const phase = await runQueryableTransaction(this.db, async (tx) => {
      const txRepo = new TransactionRepository(tx);
      const deliveries = new DeliveryRepository(tx);
      const jobs = new SellerReleaseJobRepository(tx);
      const txn = await txRepo.getById(input.transactionId);
      if (!txn) throw new DeliveryAuthError();
      if (txn.buyerId !== input.actorUserId) throw new DeliveryAuthError();

      const delivery = await deliveries.getByTransactionIdForUpdate(
        input.transactionId
      );
      if (!delivery) throw new DeliveryNotFoundError();

      if (txn.status === "DELIVERED" || txn.status === "COMPLETED") {
        const d =
          delivery.status === "DELIVERED"
            ? delivery
            : await deliveries.updateStatus(delivery.id, "DELIVERED");
        // H-01: keep / repair durable release intent; never drop pending job.
        await jobs.ensurePendingInTx({
          transactionId: input.transactionId,
          actorUserId: input.actorUserId,
          idempotencyKey: `dlv-release-${body.idempotencyKey}`,
        });
        return {
          delivery: d,
          txn,
          alreadyDone: true as const,
        };
      }

      await assertReleaseEligibility(tx, {
        transactionId: input.transactionId,
        transactionStatus: txn.status,
      });

      const live = (
        await txRepo.executeTransitionInTx(tx, {
          transactionId: txn.id,
          toStatus: "DELIVERED",
          actorType: "BUYER",
          actorId: input.actorUserId,
          reasonCode: "DELIVERY_CONFIRMED",
          expectedVersion: txn.version,
          idempotencyKey: `dlv-confirm-${body.idempotencyKey}`,
          metadata: {
            trackingCode: delivery.trackingCode,
            source: "buyer_confirm",
            deliveryIntegrationVersion: DELIVERY_INTEGRATION_VERSION,
          },
        })
      ).transaction;

      const updated = await deliveries.updateStatus(delivery.id, "DELIVERED");
      await jobs.ensurePendingInTx({
        transactionId: input.transactionId,
        actorUserId: input.actorUserId,
        idempotencyKey: `dlv-release-${body.idempotencyKey}`,
      });
      return { delivery: updated, txn: live, alreadyDone: false as const };
    });

    const release = await this.tryReleaseWithDurableRetry(
      input.transactionId,
      input.actorUserId,
      body.idempotencyKey
    );

    if (phase.alreadyDone) {
      return toResult(phase.delivery, phase.txn, {
        releaseTriggered: release.triggered,
        releaseTransferStatus: release.transferStatus,
        messageLt: "Gavimas jau patvirtintas",
        idempotentReplay: true,
      });
    }

    return toResult(phase.delivery, phase.txn, {
      releaseTriggered: release.triggered,
      releaseTransferStatus: release.transferStatus,
      messageLt: "Gavimas patvirtintas — lėšos gali būti išmokamos pardavėjui",
      idempotentReplay: false,
    });
  }

  /**
   * Carrier status sync — physical scan → SHIPPED; DELIVERED → release.
   * H-02: DELIVERED while SHIPPING_PENDING → atomic SHIPPED → DELIVERED.
   */
  async syncCarrierStatus(input: {
    transactionId: string;
    actorUserId: string;
    body: unknown;
    authoritySource?: "user_poll" | "carrier_webhook" | "trusted_server";
  }): Promise<DeliveryResult> {
    const body = SyncCarrierStatusBodySchema.parse(input.body);
    const authoritySource = input.authoritySource ?? "user_poll";
    this.assertSystemTransitionAllowed(authoritySource);

    const delivery = await new DeliveryRepository(this.db).getByTransactionId(
      input.transactionId
    );
    if (!delivery) throw new DeliveryNotFoundError();

    const snap = await this.carrier.fetchTracking(delivery.trackingCode);

    const phase = await runQueryableTransaction(this.db, async (tx) => {
      const txRepo = new TransactionRepository(tx);
      const deliveries = new DeliveryRepository(tx);
      const jobs = new SellerReleaseJobRepository(tx);
      const txn = await txRepo.getById(input.transactionId);
      if (!txn) throw new DeliveryAuthError();
      if (
        txn.buyerId !== input.actorUserId &&
        txn.sellerId !== input.actorUserId &&
        authoritySource === "user_poll"
      ) {
        throw new DeliveryAuthError();
      }

      const liveDelivery = (await deliveries.getByTransactionIdForUpdate(
        input.transactionId
      ))!;

      if (txn.status === "DELIVERED" || liveDelivery.status === "DELIVERED") {
        const d =
          liveDelivery.status === "DELIVERED"
            ? liveDelivery
            : await deliveries.updateStatus(liveDelivery.id, "DELIVERED");
        await jobs.ensurePendingInTx({
          transactionId: input.transactionId,
          actorUserId: input.actorUserId,
          idempotencyKey: `dlv-release-${body.idempotencyKey}`,
        });
        return { delivery: d, txn, alreadyDone: true as const };
      }

      if (isPhysicalScanStatus(snap.status)) {
        let liveTxn = txn;
        const persisted = toPersistedDeliveryStatus(snap.status);
        const d = await deliveries.updateStatus(liveDelivery.id, persisted);

        if (liveTxn.status === "SHIPPING_PENDING") {
          liveTxn = (
            await txRepo.executeTransitionInTx(tx, {
              transactionId: liveTxn.id,
              toStatus: "SHIPPED",
              actorType: "SYSTEM",
              actorId: "SYSTEM",
              reasonCode: "SYSTEM_TRANSITION",
              expectedVersion: liveTxn.version,
              idempotencyKey: `dlv-carrier-shipped-${body.idempotencyKey}`,
              metadata: {
                trackingCode: liveDelivery.trackingCode,
                carrierRaw: snap.rawStatus,
                source: "carrier_physical_scan",
                authoritySource,
                deliveryIntegrationVersion: DELIVERY_INTEGRATION_VERSION,
              },
            })
          ).transaction;
        }

        return {
          delivery: d,
          txn: liveTxn,
          alreadyDone: false as const,
        };
      }

      if (snap.status === "LABEL_CREATED") {
        return {
          delivery: liveDelivery,
          txn,
          alreadyDone: false as const,
        };
      }

      if (snap.status !== "DELIVERED") {
        throw new DeliveryStateError(
          `Carrier status ${snap.status} does not advance delivery`
        );
      }

      // H-02: skip-state — SHIPPING_PENDING → SHIPPED → DELIVERED in one TX.
      await assertPayoutSafetyGates(tx, {
        transactionId: input.transactionId,
        transactionStatus: txn.status,
      });

      let live = txn;
      if (live.status === "SHIPPING_PENDING") {
        live = (
          await txRepo.executeTransitionInTx(tx, {
            transactionId: live.id,
            toStatus: "SHIPPED",
            actorType: "SYSTEM",
            actorId: "SYSTEM",
            reasonCode: "SYSTEM_TRANSITION",
            expectedVersion: live.version,
            idempotencyKey: `dlv-carrier-shipped-skip-${body.idempotencyKey}`,
            metadata: {
              trackingCode: liveDelivery.trackingCode,
              carrierRaw: snap.rawStatus,
              source: "carrier_delivered_skip_state",
              authoritySource,
              deliveryIntegrationVersion: DELIVERY_INTEGRATION_VERSION,
            },
          })
        ).transaction;
      }

      await assertReleaseEligibility(tx, {
        transactionId: input.transactionId,
        transactionStatus: live.status,
      });

      live = (
        await txRepo.executeTransitionInTx(tx, {
          transactionId: live.id,
          toStatus: "DELIVERED",
          actorType: "SYSTEM",
          actorId: "SYSTEM",
          reasonCode: "SYSTEM_TRANSITION",
          expectedVersion: live.version,
          idempotencyKey: `dlv-carrier-deliv-${body.idempotencyKey}`,
          metadata: {
            trackingCode: liveDelivery.trackingCode,
            carrierRaw: snap.rawStatus,
            source: "carrier_sync",
            authoritySource,
            skipState: txn.status === "SHIPPING_PENDING",
            deliveryIntegrationVersion: DELIVERY_INTEGRATION_VERSION,
          },
        })
      ).transaction;

      const updated = await deliveries.updateStatus(
        liveDelivery.id,
        "DELIVERED"
      );
      await jobs.ensurePendingInTx({
        transactionId: input.transactionId,
        actorUserId: input.actorUserId,
        idempotencyKey: `dlv-release-${body.idempotencyKey}`,
      });
      return {
        delivery: updated,
        txn: live,
        alreadyDone: false as const,
      };
    });

    if (phase.alreadyDone) {
      const release = await this.tryReleaseWithDurableRetry(
        input.transactionId,
        input.actorUserId,
        body.idempotencyKey
      );
      return toResult(phase.delivery, phase.txn, {
        releaseTriggered: release.triggered,
        releaseTransferStatus: release.transferStatus,
        messageLt: "Pristatymas jau užfiksuotas",
        idempotentReplay: true,
      });
    }

    if (phase.delivery.status === "DELIVERED") {
      const release = await this.tryReleaseWithDurableRetry(
        input.transactionId,
        input.actorUserId,
        body.idempotencyKey
      );
      return toResult(phase.delivery, phase.txn, {
        releaseTriggered: release.triggered,
        releaseTransferStatus: release.transferStatus,
        messageLt: "Kurjeris patvirtino pristatymą",
        idempotentReplay: false,
      });
    }

    return toResult(phase.delivery, phase.txn, {
      releaseTriggered: false,
      releaseTransferStatus: null,
      messageLt:
        phase.txn.status === "SHIPPED"
          ? "Kurjeris priėmė siuntą — pažymėta kaip išsiųsta"
          : "Siuntos būsena atnaujinta",
      idempotentReplay: false,
    });
  }

  async getTracking(input: {
    transactionId: string;
    actorUserId: string;
  }): Promise<DeliveryResult> {
    const txn = await new TransactionRepository(this.db).getById(
      input.transactionId
    );
    if (!txn) throw new DeliveryAuthError();
    if (
      txn.buyerId !== input.actorUserId &&
      txn.sellerId !== input.actorUserId
    ) {
      throw new DeliveryAuthError();
    }
    const delivery = await new DeliveryRepository(this.db).getByTransactionId(
      input.transactionId
    );
    if (!delivery) throw new DeliveryNotFoundError();
    return toResult(delivery, txn, {
      releaseTriggered: false,
      releaseTransferStatus: null,
      messageLt: null,
      idempotentReplay: false,
    });
  }

  /**
   * Immediate attempt + drain due jobs for this transaction (H-01).
   * Failures leave PENDING job with backoff — never orphan DELIVERED.
   */
  private async tryReleaseWithDurableRetry(
    transactionId: string,
    actorUserId: string,
    idempotencyKey: string
  ): Promise<{ triggered: boolean; transferStatus: string | null }> {
    if (!this.releasePort) {
      return { triggered: false, transferStatus: null };
    }

    const jobs = new SellerReleaseJobRepository(this.db);
    let job = await jobs.getByTransactionId(transactionId);
    if (!job) {
      await runQueryableTransaction(this.db, async (tx) => {
        await new SellerReleaseJobRepository(tx).ensurePendingInTx({
          transactionId,
          actorUserId,
          idempotencyKey: `dlv-release-${idempotencyKey}`,
        });
      });
      job = await jobs.getByTransactionId(transactionId);
    }
    if (job?.status === "COMPLETED") {
      return {
        triggered: true,
        transferStatus: job.transferStatus,
      };
    }
    // Another worker/request already owns the attempt — do not double-fire.
    if (job?.status === "PROCESSING") {
      return { triggered: false, transferStatus: null };
    }
    // Max-retry terminal — MANUAL_REVIEW required.
    if (job?.status === "FAILED") {
      return { triggered: false, transferStatus: null };
    }

    if (job) {
      await jobs.forceAvailableNow(job.id);
    }

    await processSellerReleaseJobs(this.db, this.releasePort, {
      limit: 5,
      forceImmediate: false,
    });

    const after = await jobs.getByTransactionId(transactionId);
    if (after?.status === "COMPLETED") {
      return {
        triggered: true,
        transferStatus: after.transferStatus,
      };
    }
    return {
      triggered: false,
      transferStatus: after?.transferStatus ?? null,
    };
  }
}

/** Test harness only — shared FakeCarrier so sync/confirm see the same tracking map. */
let deliveryCarrierOverride: CarrierAdapter | null = null;

export function setDeliveryCarrierOverride(carrier: CarrierAdapter | null): void {
  deliveryCarrierOverride = carrier;
}

export function createDeliveryService(
  db: TxQueryable,
  opts?: {
    carrier?: CarrierAdapter;
    releasePort?: ReleaseFundsPort | null;
  }
): DeliveryService {
  const carrier =
    opts?.carrier ?? deliveryCarrierOverride ?? resolveDefaultCarrierAdapter();
  return new DeliveryService(db, carrier, opts?.releasePort ?? null);
}

export function createTestDeliveryService(
  db: TxQueryable,
  opts?: {
    fake?: FakeCarrierAdapter;
    releasePort?: ReleaseFundsPort | null;
  }
): { service: DeliveryService; fake: FakeCarrierAdapter } {
  const fake = opts?.fake ?? new FakeCarrierAdapter();
  return {
    service: new DeliveryService(db, fake, opts?.releasePort ?? null),
    fake,
  };
}
