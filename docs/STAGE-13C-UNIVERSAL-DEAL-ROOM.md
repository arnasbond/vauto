# Stage 13C — Universal Deal Room & Negotiation Engine

**Status:** `ETAPAS 13C IMPLEMENTED — AWAITING INDEPENDENT AUDIT`

Hardening follow-up: see `docs/STAGE-13C1-CAPABILITY-ENTRY-HARDENING.md` (`ETAPAS 13C.1`). Full 13C certification is **not** granted by this packet.

Deal Room nėra automobilių funkcija. Grandinė:

`listing.verticalId (13A) → canonical capabilities → allowed deal actions → server authorization → negotiation state machine → UI`

13A registras naudojamas **read-only**. Šiame etape nepridėta naujų atributų, capability reikšmių ar vertikalių.

## Frozen boundaries

| Sluoksnis | Paliesta? |
| --- | --- |
| 11J `server/src/payments/` | **NO** — mokėjimas kviečia viešą `PaymentIntentService` |
| Stripe webhook / provenance | **NO** |
| Ledger | **NO** (suma visada iš accepted snapshot) |
| 11J migracijos 058–061 | **NO** |
| 13A canonical registry (`capabilities.ts`, `attributes.ts`, `registry.ts`) | **NO** semantikos |
| 13B facet engine | **NO** |

12A harness `stage12a-http-app.ts` papildytas `category` stulpeliu ir 13C routeriu, kad capability gate turėtų listing vertical. 12A produkto kalba nekeista.

## Capability → veiksmai

Šaltinis: `shared/marketplace-domain/deal-actions.ts` skaito `getCategoryCapabilities`.

| Vertikalė | Offer / counter | Platform payment | Kita |
| --- | --- | --- | --- |
| TRANSPORT | taip | taip | pickup, appointments |
| REAL_ESTATE | taip | **ne** | appointments |
| ELECTRONICS | taip | taip | shipping / pickup |
| SERVICES | taip | taip | appointments (milestones/recurring **ne** kuriami — nėra naujo finansinio modelio) |
| JOBS | **ne** | **ne** | application / contact |
| HOME_GARDEN | taip | taip | shipping / pickup |
| nežinoma | fail-closed | fail-closed | — |

Nėra `if (category === "auto")`.

## Server authority

Kiekvienam mutuojančiam veiksmui:

1. JWT actor (`req.authUserId`)
2. listing egzistuoja
3. `resolveListingVertical(listing)` — **kliento `verticalId` ignoruojamas**
4. canonical capability
5. actor ∈ {buyer, seller} kitaip **404** (IDOR)
6. 13C negotiation state
7. allowlisted transition
8. mokėjimas tik jei `supportsPlatformPayment`; suma **ne** iš kliento
9. idempotency / optimistic lock per esamą 11B offer engine (`FOR UPDATE` + version)

Frontend mygtuko slėpimas nėra security boundary.

## Negotiation SM ≠ payment ledger

13C būsenos (view virš offer istorijos + tx status):

`OPEN → OFFERED → COUNTERED → ACCEPTED | REJECTED | CANCELLED`

`PAYMENT_PENDING` / `PAID` / siunta lieka 11J. 13C jų nedubliuoja — jos mapinamos į `ACCEPTED`.

Counter-offer visada naujas `vauto_offers` įrašas su `parentOfferId`. Suma neperrašoma.

## Money

Tik integer `amountCents`, valiuta `EUR`. `parseEuroInputToCents` — sveikieji eurai/centai, be `parseFloat`.
Payment intent body gali turėti tik `idempotencyKey`. Priimta suma 500 € (50000 ct) lieka 50000, net jei klientas siunčia `amountCents: 500`.

## AI

`DealAiPort.suggest` yra optional. Timeout / throw **neblokuoja** offer / accept / reject / payment.

## API

- `GET /api/transactions/:id/universal-deal`
- `POST /api/transactions/:id/universal-deal/offers`
- `POST /api/offers/:id/universal-deal/{counter,accept,reject}`
- `POST /api/transactions/:id/universal-deal/payment` (ignoruojama kliento suma)
- Esami `/offers` ir `/payment-intent` (įskaitant `/stripe-intent`) eina per 13C capability gate. Withdraw: `UniversalDealRoomService.withdrawOffer()`.

## UI

`UniversalDealRoomPanel` + `DealRoomPage`: kas pasiūlė, kiek, kieno eilė, galimi veiksmai, istorija. Mobilus CTA `min-h-12`. Jobs rodo kontaktą, ne checkout.

## Testai

A–K, M–R: `npm run test:deal-room-13c`  
S–U (real PostgreSQL): `npm run test:deal-room-13c-pg`  
L + A/B/D/E UI: `npx playwright test e2e/stage13c-deal-room.spec.ts`

## SKIP

13C PGlite/HTTP suite **neturi** sąmoningo SKIP. Real-Postgres S–U SKIP, jei nėra `TEST_DATABASE_URL` — tai **nėra PASS**. Žr. 13C.1 dokumentaciją.
