# Stage 11J / 11J.1–11J.5 — Universal Transaction Core (policy-driven)

## Status

**ETAPAS 11J.5 IMPLEMENTED — AWAITING INDEPENDENT AUDIT.**  
Stage 12B UI remains ON HOLD. Do not treat this stage as certified.

One state machine, declarative policies — not four Deal Room backends.

- **11J.1** — atomic ledger, evidence-derived L1, dual-party DIRECT_CONTACT, fail-closed composition, ServiceRemotePolicy.
- **11J.2** — provider-verified L1 provenance, atomic `create()` INSERT + fingerprint idempotency, real PostgreSQL `FOR UPDATE` pool test.
- **11J.3** — unique `provider_event_id` / primary `payment_provider_ref`, metadata-checked provenance, Stripe `payment_intent.succeeded` wiring, replay/forgery tests.
- **11J.4** — provenance capability boundary: public ledger/repository cannot set `provider_verified_at` from caller strings.
- **11J.5** — runtime verified-Stripe-event capability: only the object returned by `Stripe.webhooks.constructEvent()` inside `verifyStripeWebhookSignature` can mint provenance. `as Stripe.Event` is not enough.

## Composition (not `if (car)`)

| Axis | Values | Default (11A–11I compat) |
| --- | --- | --- |
| `vertical` | GOODS, SERVICES, REAL_ESTATE, JOBS | `GOODS` |
| `fulfillment_type` | CARRIER_DELIVERY, LOCAL_HANDOFF, SERVICE_IN_PERSON, SERVICE_REMOTE, DIRECT_CONTACT | `CARRIER_DELIVERY` |
| `payment_mode` | FULL_ESCROW, DEPOSIT_ESCROW, PLATFORM_FEE_ONLY, OFF_PLATFORM | `FULL_ESCROW` |
| `verification_policy` | PLATFORM_TRANSACTION, MUTUAL_COMPLETION, APPOINTMENT_VERIFIED, NO_VERIFIED_REVIEW | `PLATFORM_TRANSACTION` |

`validateTransactionPolicyComposition` is **fail-closed**. Invalid combinations throw `InvalidPolicyCompositionError` (400) before insert.

## Atomic create (11J.2)

`TransactionRepository.create()` is **one INSERT** with all policy columns (no follow-up UPDATE). SHA-256 payload fingerprint is stored in `idempotency_fingerprint`. Same `idempotency_key` + same fingerprint → replay; different payload → `IdempotencyConflictError` (409).

039-only databases (11A) still insert legacy columns only — policy columns are detected via `information_schema`.

## L1 provenance (11J.2–11J.5)

`createObligation()` records an internal HELD row with `provider_verified_at = null`. L1 requires:

`status IN ('HELD','CAPTURED','RELEASED') AND payment_provider_ref IS NOT NULL AND provider_verified_at IS NOT NULL`

### Trust boundary (11J.4 + 11J.5)

```
POST /webhooks/stripe
  → handleVautoStripeWebhook
  → handleRawWebhook(rawBody, Stripe-Signature)
  → verifyStripeWebhookSignature
  → Stripe.webhooks.constructEvent()
  → SIGNATURE_VERIFIED_STRIPE_EVENTS.add(event)   // runtime capability 1
  → local PaymentIntent lookup by Stripe PI id
  → amount / currency / transaction reconcile
  → mintTrustedProviderProvenanceFromVerifiedStripeEvent
       (rejects unless isSignatureVerifiedStripeEvent(event))
  → MINTED_PROVENANCE.add(token)                  // runtime capability 2
  → applyTrustedProviderProvenanceInTx
  → provider_verified_at = NOW()
```

Runtime writers (minimal):

1. **Mark Stripe event verified** — only `signature-verifier.ts` (`verifyStripeWebhookSignature` after `constructEvent`). No `markStripeEventAsVerified` API. `isSignatureVerifiedStripeEvent` is read-only.
2. **Mint TrustedProviderProvenance** — only `trusted-provider-provenance.ts`; production caller is `webhook-processor.ts`.
3. **Set `provider_verified_at`** — only `trusted-provider-provenance.ts` SQL `NOW()`.

`VerifiedStripeEvent = Stripe.Event` remains a TypeScript alias. Runtime proof is WeakSet object identity. A forged POJO with a real PI id and correct amount/currency/transaction cannot enter the registry via `as Stripe.Event`.

Unique indexes (migration 061, unchanged):

- `(payment_provider, provider_event_id)` where event id is set
- `(payment_provider, payment_provider_ref)` for primary obligation types

Reusing a Stripe `provider_event_id` throws `ProviderEventReplayError` (409). Metadata mismatch throws `ProviderMetadataMismatchError` (422). Unminted / unverified event throws `UntrustedProviderProvenanceError` (403).

## Fulfillment policies

- **CarrierDeliveryPolicy** — Omniva path unchanged.
- **ServiceInPersonPolicy** / **ServiceRemotePolicy** (`id: SERVICE_REMOTE`, not an alias).
- **DirectContactPolicy** — `CONTACT_ACCEPTED → INTERACTION_CLAIMED → INTERACTION_CONFIRMED → INTERACTION_COMPLETED`.
- **LocalHandoffPolicy** — `PAID → DELIVERED`.

## Migrations

- `058` — policy columns, obligations table, review level.
- `059` — dual-party interaction statuses, obligation idempotency unique, `source_obligation_id`.
- `060` — `payment_provider`, `provider_event_id`, `provider_verified_at`, `idempotency_fingerprint`.
- `061` — unique provider event + primary provider ref indexes.

## Tests

```bash
npm run test:universal-core --prefix server
```

1–5, A–G as in 11J.2, plus:

- **H** Same `evt_stripe_real_1` cannot verify a second obligation (`ProviderEventReplayError` 409)
- **I** Wrong amount / transaction_id → `ProviderMetadataMismatchError`; `provider_verified_at` stays NULL
- **J** Fake `pi_fake_*` + `evt_fake_*` via public/repository/call-graph bypass → FAIL CLOSED (`provider_verified_at` NULL)
- **K** Fake `Stripe.Event` POJO (`as Stripe.Event`) with correct transaction/amount/currency/PI id, never from `constructEvent()` → `UntrustedProviderProvenanceError`; `provider_verified_at` NULL
- **Pool** (when `TEST_DATABASE_URL` set): two `pg.Pool` clients, `SELECT … FOR UPDATE` cap + refund races. Skipped locally without the env var.

Regression: `test:transaction-state-machine`, `test:reputation-engine`. Do **not** edit frozen Stage 11A–11I suites. CI certifies PostgreSQL 16.

## Stop

Do **not** start Stage 12B UI or production deploy. Status remains **11J.5 IMPLEMENTED — AWAITING INDEPENDENT AUDIT**.
