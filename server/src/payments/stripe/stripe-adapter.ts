/**
 * PaymentProvider adapters — Fake (tests/CI) + Real Stripe SDK.
 * Real adapter used ONLY when STRIPE_SECRET_KEY is set and forceFake is false.
 * Stage 11F.4 adds Connect transfer / refund / reversal.
 */

import { createHash, randomUUID } from "node:crypto";
import Stripe from "stripe";
import type {
  CreateStripePaymentIntentInput,
  CreateStripeRefundInput,
  CreateStripeTransferInput,
  CreateStripeTransferReversalInput,
  PaymentProvider,
  StripeProviderPaymentIntent,
  StripeProviderRefund,
  StripeProviderTransfer,
  StripeProviderTransferReversal,
} from "./types.js";
import {
  StripeProviderError,
  StripeProviderTimeoutError,
} from "./types.js";
import { StripeProviderPaymentIntentSchema } from "./schema.js";

export function stripeIdempotencyKeyForCreate(paymentIntentId: string): string {
  return `vauto:payment-intent:${paymentIntentId}:create`;
}

export function stripeIdempotencyKeyForSellerTransfer(
  transactionId: string,
  generation = 1
): string {
  return `vauto:transaction:${transactionId}:seller-transfer:${generation}`;
}

export type FakeStripeOptions = {
  failNextCreates?: number;
  timeoutNextCreates?: number;
  failNextTransfers?: number;
  /** Next N refunds return status "pending" (H-01 async finality tests). */
  pendingNextRefunds?: number;
  delayMs?: number;
};

/** Barrier for synchronized TOCTOU race tests (11H.3). */
export type TransferBarrierHandle = {
  /** Resolves when createTransfer has entered and is waiting. */
  waitUntilEntered: () => Promise<void>;
  /** Lets createTransfer proceed past the barrier. */
  release: () => void;
};

export class FakeStripeAdapter implements PaymentProvider {
  readonly name = "fake" as const;
  private readonly byIdempotency = new Map<string, StripeProviderPaymentIntent>();
  private readonly byId = new Map<string, StripeProviderPaymentIntent>();
  private readonly transfersByKey = new Map<string, StripeProviderTransfer>();
  private readonly refundsByKey = new Map<string, StripeProviderRefund>();
  private readonly reversalsByKey = new Map<
    string,
    StripeProviderTransferReversal
  >();
  private createCalls = 0;
  private transferCalls = 0;
  private refundCalls = 0;
  private reversalCalls = 0;
  private failNextCreates: number;
  private timeoutNextCreates: number;
  private failNextTransfers: number;
  private pendingNextRefunds: number;
  private delayMs: number;
  private transferBarrier: {
    signalEntered: () => void;
    entered: Promise<void>;
    gate: Promise<void>;
    openGate: () => void;
  } | null = null;
  /** stripe PI id → vauto payment intent / transaction metadata */
  private readonly piMeta = new Map<
    string,
    { vautoPaymentIntentId?: string; vautoTransactionId?: string }
  >();

  constructor(opts: FakeStripeOptions = {}) {
    this.failNextCreates = opts.failNextCreates ?? 0;
    this.timeoutNextCreates = opts.timeoutNextCreates ?? 0;
    this.failNextTransfers = opts.failNextTransfers ?? 0;
    this.pendingNextRefunds = opts.pendingNextRefunds ?? 0;
    this.delayMs = opts.delayMs ?? 0;
  }

  /**
   * Arm a one-shot barrier: next createTransfer waits after incrementing call count
   * until release() is called. Used for in-flight dispute race tests.
   */
  armTransferBarrier(): TransferBarrierHandle {
    let signalEntered!: () => void;
    let openGate!: () => void;
    const entered = new Promise<void>((resolve) => {
      signalEntered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    this.transferBarrier = { signalEntered, entered, gate, openGate };
    return {
      waitUntilEntered: () => entered,
      release: () => {
        openGate();
        this.transferBarrier = null;
      },
    };
  }

  getCreateCallCount(): number {
    return this.createCalls;
  }
  getTransferCallCount(): number {
    return this.transferCalls;
  }
  getRefundCallCount(): number {
    return this.refundCalls;
  }
  getReversalCallCount(): number {
    return this.reversalCalls;
  }

  resetCallCount(): void {
    this.createCalls = 0;
    this.transferCalls = 0;
    this.refundCalls = 0;
    this.reversalCalls = 0;
  }

  configure(opts: FakeStripeOptions): void {
    if (opts.failNextCreates != null) this.failNextCreates = opts.failNextCreates;
    if (opts.timeoutNextCreates != null) {
      this.timeoutNextCreates = opts.timeoutNextCreates;
    }
    if (opts.failNextTransfers != null) {
      this.failNextTransfers = opts.failNextTransfers;
    }
    if (opts.pendingNextRefunds != null) {
      this.pendingNextRefunds = opts.pendingNextRefunds;
    }
    if (opts.delayMs != null) this.delayMs = opts.delayMs;
  }

  async createPaymentIntent(
    input: CreateStripePaymentIntentInput
  ): Promise<StripeProviderPaymentIntent> {
    this.createCalls += 1;
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
    if (this.timeoutNextCreates > 0) {
      this.timeoutNextCreates -= 1;
      throw new StripeProviderTimeoutError();
    }
    if (this.failNextCreates > 0) {
      this.failNextCreates -= 1;
      throw new StripeProviderError("Fake Stripe API error", {
        code: "STRIPE_API_ERROR",
        httpStatus: 502,
      });
    }

    const existing = this.byIdempotency.get(input.idempotencyKey);
    if (existing) {
      if (existing.amountCents !== input.amountCents) {
        throw new StripeProviderError(
          "Idempotency key reuse with different amount",
          { code: "STRIPE_IDEMPOTENCY_MISMATCH", httpStatus: 409 }
        );
      }
      return existing;
    }

    const digest = createHash("sha256")
      .update(input.idempotencyKey)
      .digest("hex")
      .slice(0, 24);
    const id = `pi_fake_${digest}`;
    const secret = `pi_fake_${digest}_secret_${randomUUID().slice(0, 8)}`;
    const pi: StripeProviderPaymentIntent = {
      id,
      clientSecret: secret,
      status: "requires_payment_method",
      amountCents: input.amountCents,
      currency: "eur",
    };
    StripeProviderPaymentIntentSchema.parse(pi);
    this.byIdempotency.set(input.idempotencyKey, pi);
    this.byId.set(pi.id, pi);
    this.piMeta.set(pi.id, {
      vautoPaymentIntentId: input.metadata.vautoPaymentIntentId,
      vautoTransactionId: input.metadata.vautoTransactionId,
    });
    return pi;
  }

  async retrievePaymentIntent(
    providerId: string
  ): Promise<StripeProviderPaymentIntent | null> {
    return this.byId.get(providerId) ?? null;
  }

  async createTransfer(
    input: CreateStripeTransferInput
  ): Promise<StripeProviderTransfer> {
    this.transferCalls += 1;
    const barrier = this.transferBarrier;
    if (barrier) {
      barrier.signalEntered();
      await barrier.gate;
    }
    if (this.failNextTransfers > 0) {
      this.failNextTransfers -= 1;
      throw new StripeProviderError("Fake Stripe transfer error", {
        code: "STRIPE_TRANSFER_ERROR",
        httpStatus: 502,
      });
    }
    const existing = this.transfersByKey.get(input.idempotencyKey);
    if (existing) {
      if (
        existing.amountCents !== input.amountCents ||
        existing.destinationAccountId !== input.destinationAccountId
      ) {
        throw new StripeProviderError("Transfer idempotency mismatch", {
          code: "STRIPE_IDEMPOTENCY_MISMATCH",
          httpStatus: 409,
        });
      }
      return existing;
    }
    const digest = createHash("sha256")
      .update(input.idempotencyKey)
      .digest("hex")
      .slice(0, 20);
    const tr: StripeProviderTransfer = {
      id: `tr_fake_${digest}`,
      amountCents: input.amountCents,
      currency: "eur",
      destinationAccountId: input.destinationAccountId,
      status: "paid",
      metadata: input.metadata ?? {},
      sourcePaymentIntentId: null,
    };
    // Link transfer → Stripe PI via vauto payment intent id metadata
    if (input.metadata?.vautoPaymentIntentId) {
      for (const [piId, meta] of this.piMeta) {
        if (meta.vautoPaymentIntentId === input.metadata.vautoPaymentIntentId) {
          tr.sourcePaymentIntentId = piId;
          break;
        }
      }
    }
    this.transfersByKey.set(input.idempotencyKey, tr);
    return tr;
  }

  async createRefund(
    input: CreateStripeRefundInput
  ): Promise<StripeProviderRefund> {
    this.refundCalls += 1;
    const existing = this.refundsByKey.get(input.idempotencyKey);
    if (existing) return existing;
    const digest = createHash("sha256")
      .update(input.idempotencyKey)
      .digest("hex")
      .slice(0, 20);
    let status: string = "succeeded";
    if (this.pendingNextRefunds > 0) {
      this.pendingNextRefunds -= 1;
      status = "pending";
    }
    const rf: StripeProviderRefund = {
      id: `re_fake_${digest}`,
      amountCents: input.amountCents,
      paymentIntentId: input.paymentIntentId,
      status,
    };
    this.refundsByKey.set(input.idempotencyKey, rf);
    return rf;
  }

  async createTransferReversal(
    input: CreateStripeTransferReversalInput
  ): Promise<StripeProviderTransferReversal> {
    this.reversalCalls += 1;
    const existing = this.reversalsByKey.get(input.idempotencyKey);
    if (existing) return existing;
    const digest = createHash("sha256")
      .update(input.idempotencyKey)
      .digest("hex")
      .slice(0, 20);
    const rv: StripeProviderTransferReversal = {
      id: `trr_fake_${digest}`,
      transferId: input.transferId,
      amountCents: input.amountCents,
      status: "succeeded",
    };
    this.reversalsByKey.set(input.idempotencyKey, rv);
    return rv;
  }

  /** Stage 11F.5/11F.6 — stateful inspection for reconciliation / red-team. */
  inspectPaymentIntent(id: string): StripeProviderPaymentIntent | null {
    return this.byId.get(id) ?? null;
  }

  /** Stage 11F.7 M-01 — direct retrieve by Stripe object id (not list window). */
  retrieveTransfer(id: string): StripeProviderTransfer | null {
    for (const tr of this.transfersByKey.values()) {
      if (tr.id === id) return tr;
    }
    return null;
  }

  retrieveRefund(id: string): StripeProviderRefund | null {
    for (const rf of this.refundsByKey.values()) {
      if (rf.id === id) return rf;
    }
    return null;
  }

  /**
   * Seed >100 unrelated transfers so list-window strategies would miss a target.
   * Direct retrieve(transferId) must still find the real deal transfer.
   */
  seedNoiseTransfers(count: number): void {
    for (let i = 0; i < count; i++) {
      const id = `tr_noise_${String(i).padStart(4, "0")}_${randomUUID().slice(0, 8)}`;
      const key = `noise-idem-${i}-${id}`;
      this.transfersByKey.set(key, {
        id,
        amountCents: 100 + i,
        currency: "eur",
        destinationAccountId: `acct_noise_${i}`,
        status: "paid",
        metadata: { noise: "1", idx: String(i) },
        sourcePaymentIntentId: null,
      });
    }
  }

  listTransfers(filter?: {
    transactionId?: string;
    paymentIntentId?: string;
    stripePaymentIntentId?: string;
  }): StripeProviderTransfer[] {
    let all = [...this.transfersByKey.values()];
    if (filter?.transactionId) {
      all = all.filter(
        (t) => t.metadata?.vautoTransactionId === filter.transactionId
      );
    }
    if (filter?.paymentIntentId) {
      all = all.filter(
        (t) => t.metadata?.vautoPaymentIntentId === filter.paymentIntentId
      );
    }
    if (filter?.stripePaymentIntentId) {
      all = all.filter(
        (t) => t.sourcePaymentIntentId === filter.stripePaymentIntentId
      );
    }
    return all;
  }

  listRefunds(filter?: {
    paymentIntentId?: string;
  }): StripeProviderRefund[] {
    let all = [...this.refundsByKey.values()];
    if (filter?.paymentIntentId) {
      all = all.filter((r) => r.paymentIntentId === filter.paymentIntentId);
    }
    return all;
  }

  listReversals(filter?: {
    transferId?: string;
  }): StripeProviderTransferReversal[] {
    let all = [...this.reversalsByKey.values()];
    if (filter?.transferId) {
      all = all.filter((r) => r.transferId === filter.transferId);
    }
    return all;
  }

  /** Simulate async refund becoming succeeded (webhook path). */
  markRefundSucceeded(refundId: string): StripeProviderRefund | null {
    for (const [k, rf] of this.refundsByKey) {
      if (rf.id === refundId) {
        const next = { ...rf, status: "succeeded" };
        this.refundsByKey.set(k, next);
        return next;
      }
    }
    return null;
  }

  /** Simulate Stripe Dashboard amount tampering (security mismatch tests). */
  tamperPaymentIntentAmount(id: string, newAmountCents: number): void {
    const pi = this.byId.get(id);
    if (!pi) return;
    const next = { ...pi, amountCents: newAmountCents };
    this.byId.set(id, next);
    for (const [k, v] of this.byIdempotency) {
      if (v.id === id) this.byIdempotency.set(k, next);
    }
  }

  /** Register a provider PI not yet linked in DB (recoverable drift). */
  registerOrphanPaymentIntent(
    pi: StripeProviderPaymentIntent,
    idempotencyKey: string
  ): void {
    this.byId.set(pi.id, pi);
    this.byIdempotency.set(idempotencyKey, pi);
  }
}

export class RealStripeAdapter implements PaymentProvider {
  readonly name = "stripe" as const;
  private readonly stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey);
  }

  async createPaymentIntent(
    input: CreateStripePaymentIntentInput
  ): Promise<StripeProviderPaymentIntent> {
    try {
      const pi = await this.stripe.paymentIntents.create(
        {
          amount: input.amountCents,
          currency: input.currency,
          metadata: {
            vautoPaymentIntentId: input.metadata.vautoPaymentIntentId,
            vautoTransactionId: input.metadata.vautoTransactionId,
            vautoDealSnapshotId: input.metadata.vautoDealSnapshotId,
            buyerId: input.metadata.buyerId,
            sellerId: input.metadata.sellerId,
            acceptedOfferId: input.metadata.acceptedOfferId,
          },
          automatic_payment_methods: { enabled: true },
        },
        { idempotencyKey: input.idempotencyKey }
      );
      if (!pi.client_secret) {
        throw new StripeProviderError(
          "Stripe PaymentIntent missing client_secret"
        );
      }
      return StripeProviderPaymentIntentSchema.parse({
        id: pi.id,
        clientSecret: pi.client_secret,
        status: pi.status,
        amountCents: pi.amount,
        currency: "eur",
      });
    } catch (e) {
      if (e instanceof StripeProviderError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      if (/timeout|ETIMEDOUT|ECONNRESET/i.test(msg)) {
        throw new StripeProviderTimeoutError(msg);
      }
      throw new StripeProviderError(msg, {
        code: "STRIPE_API_ERROR",
        httpStatus: 502,
      });
    }
  }

  async retrievePaymentIntent(
    providerId: string
  ): Promise<StripeProviderPaymentIntent | null> {
    try {
      const pi = await this.stripe.paymentIntents.retrieve(providerId);
      if (!pi.client_secret) return null;
      return StripeProviderPaymentIntentSchema.parse({
        id: pi.id,
        clientSecret: pi.client_secret,
        status: pi.status,
        amountCents: pi.amount,
        currency: "eur",
      });
    } catch {
      return null;
    }
  }

  async createTransfer(
    input: CreateStripeTransferInput
  ): Promise<StripeProviderTransfer> {
    try {
      const tr = await this.stripe.transfers.create(
        {
          amount: input.amountCents,
          currency: input.currency,
          destination: input.destinationAccountId,
          metadata: input.metadata,
        },
        { idempotencyKey: input.idempotencyKey }
      );
      return {
        id: tr.id,
        amountCents: tr.amount,
        currency: "eur",
        destinationAccountId: String(tr.destination),
        status: tr.reversed ? "reversed" : "paid",
        metadata: (tr.metadata ?? {}) as Record<string, string>,
      };
    } catch (e) {
      if (e instanceof StripeProviderError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      throw new StripeProviderError(msg, {
        code: "STRIPE_TRANSFER_ERROR",
        httpStatus: 502,
      });
    }
  }

  async createRefund(
    input: CreateStripeRefundInput
  ): Promise<StripeProviderRefund> {
    try {
      const rf = await this.stripe.refunds.create(
        {
          payment_intent: input.paymentIntentId,
          amount: input.amountCents,
        },
        { idempotencyKey: input.idempotencyKey }
      );
      return {
        id: rf.id,
        amountCents: rf.amount ?? input.amountCents,
        paymentIntentId: input.paymentIntentId,
        status: rf.status ?? "succeeded",
      };
    } catch (e) {
      if (e instanceof StripeProviderError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      throw new StripeProviderError(msg, {
        code: "STRIPE_REFUND_ERROR",
        httpStatus: 502,
      });
    }
  }

  async createTransferReversal(
    input: CreateStripeTransferReversalInput
  ): Promise<StripeProviderTransferReversal> {
    try {
      const rv = await this.stripe.transfers.createReversal(
        input.transferId,
        { amount: input.amountCents },
        { idempotencyKey: input.idempotencyKey }
      );
      return {
        id: rv.id,
        transferId: input.transferId,
        amountCents: rv.amount ?? input.amountCents,
        status: "succeeded",
      };
    } catch (e) {
      if (e instanceof StripeProviderError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      throw new StripeProviderError(msg, {
        code: "STRIPE_REVERSAL_ERROR",
        httpStatus: 502,
      });
    }
  }
}

export function createPaymentProvider(opts?: {
  forceFake?: boolean;
  fakeOptions?: FakeStripeOptions;
}): PaymentProvider {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!opts?.forceFake && key) {
    return new RealStripeAdapter(key);
  }
  return new FakeStripeAdapter(opts?.fakeOptions);
}
