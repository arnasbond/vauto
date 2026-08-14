# Stage 12A — Frontend Integration (Deal Room + Language)

Stage 11 backend (11A–11I) lieka **užšaldytas ir sertifikuotas**. Šis etapas prijungia Next.js UI prie tų pačių HTTP maršrutų ir sutvarko produkto kalbą pagal addendumą. **Etapas 12B nepradedamas.**

## Kas prijungta

| UI | Backend |
| --- | --- |
| `/sandoriai/?id=` Deal Room | `GET /api/transactions/:id/deal-room` |
| Pradėti sandorį iš skelbimo `/sandoriai/?listingId=` | `POST /api/listings/:id/transactions` |
| Pasiūlymas / priėmimas | `/api/transactions/:id/offers`, `/api/offers/:id/accept` |
| Mokėjimas | ledger `payment-intent` + `stripe-intent`; `PAID` tik po pasirašyto webhook |
| Omniva lipdukas / sekimas | `delivery/label`, `tracking`, `sync-status` (`SHIPPED` po vežėjo skenavimo) |
| Gavimo patvirtinimas | `delivery/confirm` (`SHIPPED` → `DELIVERED`) |
| Užbaigimas | `POST /api/transactions/:id/complete` (`DELIVERED` → `COMPLETED`) |
| Patvirtintas atsiliepimas | `POST /api/transactions/:id/reviews` — tik `{ rating, comment? }` |
| Reputacijos ženklas | `GET /api/users/:id/reputation` (`ratingAverage = null` jei tuščia) |

Klientas **nesiunčia** `buyerId`, `sellerId`, `status`, `revieweeId`, mokėjimo sumos.

Statinis export: dinaminiai kambariai tik per query (`?id=`), ne per `[id]` be `generateStaticParams`.

## Autentifikacija

Rašymo maršrutai — `requireAuth` (JWT). Svetimas vartotojas Deal Room / veiksmams gauna **404** (IDOR), išskyrus reputacijos rašymą svetimam sandoriui — **403**.

## Kalba

Žr. [VAUTO-VOICE-LANGUAGE-GUIDE.md](./VAUTO-VOICE-LANGUAGE-GUIDE.md). Homepage / DUK / `/apie` / klaidos / atsiliepimai atitinka principą «AI padeda. Žmogus sprendžia.»

## Testų architektūra (12A.1)

Yra **dvi atskiros** testų aplinkos. Jos nėra keičiamos viena kita.

### A. Stage 12A Playwright E2E — PGlite harness (ne produkcinė PostgreSQL)

| | |
| --- | --- |
| Harness (privalomas eksportui) | `server/src/test/stage12a-http-app.ts` |
| Playwright paleidimas | `e2e/helpers/stage12a-harness.ts` (`npx tsx src/test/stage12a-http-app.ts`) |
| Spec | `e2e/stage12a-deal-room-flows.spec.ts` |
| DB | **PGlite** in-process (Electric SQL). Tai ne CI `postgres:16`. |
| Auth | Harness `POST /api/test/token` (JWT, tas pats `JWT_SECRET`) |
| Session | `GET /api/auth/session` — kad Next `AuthContext` neištrintų JWT |

Harness **nėra** montuojamas produkcijos `server/src/index.ts`. Jis užkelia tuos pačius Stage 11 maršrutus (deal-room, offers, payment, delivery, disputes, reputation) ant PGlite migracijų.

**Simuliuoti teikėjų endpointai** (tik harness, ne produkcija):

| Endpoint | Ką daro | Ko **nedaro** |
| --- | --- | --- |
| `POST /api/test/simulate-payment-success` | Pasirašo testinį Stripe `payment_intent.succeeded` webhooką su `generateTestStripeSignatureHeader` ir `STAGE12A_WHSEC` | Neskambina gyvo Stripe API; `STRIPE_SECRET_KEY` harness'e išjungiamas |
| `POST /api/test/carrier-status` | Nustato `FakeCarrierAdapter` sekimo būseną (`IN_TRANSIT` / `DELIVERED`) | Neskambina gyvo Omniva OMX |
| `POST /api/test/seed-listing` | Įrašo stub `listings` eilutę | Nenaudoja produkcinio listing repo |
| `GET /api/test/review-count` | `COUNT(*)` iš `vauto_reviews` pagal `transactionId` | — |

Playwright **proxyja visus `/api/**`** į harnessą, nes e2e `output: "export"` build gali turėti įkeptą `NEXT_PUBLIC_API_URL`. Naršyklė vis tiek **nėra** `PAID` / `SHIPPED` / `COMPLETED` šaltinis — būseną keičia tik harness'e vykdomi Stage 11 servisai.

Duplicate review testas siunčia **tikrą** `Promise.all` (du lygiagretūs `POST /reviews`); tikimasi `[201, 409]` ir DB `count === 1`.

### B. Backend lygmens testai — reali PostgreSQL 16 (CI)

Lokaliai be `TEST_DATABASE_URL` dalis suite'ų gali kristi ant PGlite. **Sertifikavimo šaltinis yra CI**, ne Playwright harness.

`.github/workflows/ci.yml` job `build`:

- Service: `postgres:16` (`POSTGRES_DB=vauto_test`)
- Env: `TEST_DATABASE_URL=postgres://vauto_test:vauto_test_pass@localhost:5432/vauto_test`

| Komanda | CI žingsnis | DB |
| --- | --- | --- |
| `npm run test:real-postgres-pool` | `Stage 11E.2 Real PostgreSQL pg.Pool gate` | PostgreSQL 16 per `TEST_DATABASE_URL` |
| `npm run test:reputation-engine` | `Stage 11I.1 Reputation Engine` | ta pati CI Postgres 16 |
| `npm run test:dispute-resolution` | `Stage 11H.1 Dispute Resolution` | ta pati CI Postgres 16 |
| `npm run test:delivery-shipping` | `Stage 11G.1 Delivery & Shipping` | ta pati CI Postgres 16 |

Stage 11 testų failų **neliesti**. Jei lokalus PGlite duoda `25P02`, tai nėra leidimas silpninti testų — tikrinti CI žalią `build` job.

Job `e2e` paleidžia `npx playwright test e2e/stage12a-deal-room-flows.spec.ts` su `E2E_MINT_REAL_JWT=1` po `npm run server:install`.

## Feature → Code/API → UI claim mapping

Kiekvienas vartotojui matomas teiginys turi atitikti kodą. Draudžiami: „Pirmoji Lietuvoje“, „0 € 3 mėn“, „oficialus OMX live API“, „publikavimas per 10 s“, „Regitra dokumentų techniniai duomenys“, „ROI analytics“, „Social Engine“, „b2bTrustBoost“, „TOP dovana“.

| Feature | Code / API | UI claim (sąžiningas) |
| --- | --- | --- |
| Brand principas | `docs/VAUTO-VOICE-LANGUAGE-GUIDE.md`, `HomeAiHero` | «AI padeda. Žmogus sprendžia.» |
| Deal Room | `GET /api/transactions/:id/deal-room` · UI `DealRoomPage` · `/sandoriai/?id=` | Sandorio kambarys: eiga vedama UI, būseną saugo serveris |
| Pasiūlymas | `POST /api/transactions/:id/offers` | „Pateikti pasiūlymą“; suma centais |
| Priėmimas | `POST /api/offers/:id/accept` su `expectedVersion` | „Priimti pasiūlymą“; UI siunčia versiją, ne statusą |
| Mokėjimas | `POST .../payment-intent` + `.../stripe-intent`; `PAID` tik po pasirašyto webhook | „Apmokėti saugiai“ = per platformos eigą; naršyklė nepažymi PAID |
| Harness mokėjimo simuliacija | `POST /api/test/simulate-payment-success` | Tik E2E; produkcijoje — Stripe webhook |
| Omniva lipdukas / sekimas | `POST .../delivery/label`, `GET .../tracking`, `POST .../sync-status`; `SHIPPED` po vežėjo skenavimo | „Omniva siuntų sekimo integracija“ — ne „oficialus OMX live API“ |
| Harness vežėjas | `POST /api/test/carrier-status` + `FakeCarrierAdapter` | Tik E2E |
| Gavimas | `POST .../delivery/confirm` (`SHIPPED` → `DELIVERED`) | „Patvirtinti gavimą“ |
| Užbaigimas | `POST .../complete` (`DELIVERED` → `COMPLETED`) | „Užbaigti sandorį“; ne AI sprendimas |
| Patvirtintas atsiliepimas | `POST .../reviews` body `{ rating, comment? }`; `revieweeId` serverio; duplicate → 409 | Tik po COMPLETED; tuščia reputacija ≠ 0 žvaigždučių |
| Reputacija | `GET /api/users/:id/reputation` | `VerifiedReputationBadge` |
| Skelbimo juodraštis | pokalbio / vision srautas; publikavimas rankinis | „greitas skelbimo paruošimas su AI asistentu“; ne „10 sekundžių“ |
| Kainos rėžis | VAUTO Score / PriceRangeBar | rekomendacija, ne garantuota rinkos kaina |
| `/apie` | `src/app/apie/page.tsx` | „Šiuolaikiška automobilių prekybos ir sandorių platforma“ |
| IDOR | Deal Room svetimam → **404** | „Sandoris nerastas.“ |

## E2E failai (eksporto komplektas)

Nepriklausomam atkūrimui **privaloma** įtraukti harnessą:

- `server/src/test/stage12a-http-app.ts`
- `e2e/helpers/stage12a-harness.ts`
- `e2e/stage12a-deal-room-flows.spec.ts`
- `docs/STAGE-12A-FRONTEND-INTEGRATION.md`
- `docs/VAUTO-VOICE-LANGUAGE-GUIDE.md`
