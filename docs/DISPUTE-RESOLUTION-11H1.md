# Stage 11H.1–11H.4 — Dispute Resolution, Financial Finality & Serialization

## Status

**11H.4 PASS criteria target — STRICT STOP before Stage 11I (Reputation Engine).**  
`disputeEngineVersion`: **`1.2`**

## Authority rules

1. **Open dispute** (buyer/seller) → 11A `DISPUTED` + accurate freeze classification:
   - `TRANSFER_BLOCKED` — block applied before provider call
   - `TRANSFER_IN_FLIGHT` — `transfer_status = TRANSFER_EXECUTING` (Stripe already in progress)
   - `TRANSFER_ALREADY_EXECUTED` — already `TRANSFERRED`
2. **Resolve** only `ADMIN` / `SYSTEM`. Decision ≠ finality (`DECIDED_*` + durable `dispute_financial_jobs`).
3. Final `RESOLVED_*` / `COMPLETED` / `CANCELLED` only after 11F confirms.

## 11H.3 — TOCTOU elimination

`releaseToSeller` acquires an **atomic** DB lock immediately before Stripe (`TRANSFER_EXECUTING` + `execution_token`).  
0 rows → fail-closed (**no** Stripe API call).

## 11H.4 — In-flight refund serialization (no double economic loss)

`refundToBuyer` **rejects** while `TRANSFER_PENDING` or `TRANSFER_EXECUTING`:

> Seller transfer in progress — refund deferred until transfer finality

Dispute financial worker on `DECIDED_BUYER_REFUND`:

- If transfer is still in-flight → recoverable wait (2–5 s backoff, **not** FAILED).
- After `TRANSFERRED` → `refundToBuyer` performs **exactly 1** transfer reversal + **exactly 1** buyer refund.
- If transfer never executed → direct refund (no reversal).

**Invariant:** seller payout cannot remain unreversed after a full buyer refund.

## Evidence manifest

- `fullChatCanonicalHash`, `evidenceManifestHash`, `fundsFreezeState`, snapshot, tracking

DB trigger: `evidence_json` UPDATE / row DELETE → `Dispute evidence is immutable`.

## Migrations

- `053_dispute_resolution_1.0.sql`
- `055_dispute_financial_finality_1.0.sql`
- `056_in_flight_transfer_lock_1.0.sql` — `TRANSFER_EXECUTING` + `execution_token`

## Tests

```bash
npm run test:dispute-resolution --prefix server
```

## Explicit stop

**Do not start Stage 11I** until auditor approval.
