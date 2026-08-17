# Stage 13A — Universal Category Domain Model

**Status:** `ETAPAS 13A IMPLEMENTED — AWAITING INDEPENDENT AUDIT`

Vienas kanoninis kategorijų registras yra šaltinis tapatybei, etiketėms, hierarchijai, atributams, tipams, validacijai, filtravimui ir **galimybėms (capabilities)**. Home, `/add`, paieškos šoninė juosta ir būsimas Deal Room **nebespėja** atskirai, ką kategorija „gali“.

Šis etapas — **tik domeno pamatas**. Čia **nėra**: universalaus Deal Room UI, naujo Stripe/escrow, darbo užmokesčio mokėjimo, NT escrow, siuntų integracijų, 13B faceted-search UI, naujo AI modelio, 12C žmogaus testo.

## Kanoninės 6 šaknys

| ID | uiSlug (`data-vertical-id`) | Etiketė | listingKind |
| --- | --- | --- | --- |
| `TRANSPORT` | `transport` | Transportas | `VEHICLE` |
| `REAL_ESTATE` | `real_estate` | Nekilnojamasis turtas | `REAL_ESTATE` |
| `ELECTRONICS` | `electronics` | Elektronika | `PHYSICAL_GOOD` |
| `SERVICES` | `services` | Paslaugos | `SERVICE` |
| `JOBS` | `jobs` | Darbas | `JOB_POSTING` |
| `HOME_GARDEN` | `home` | Namai ir sodas | `PHYSICAL_GOOD` |

12B testai naudoja mažąsias `data-vertical-id` reikšmes — jos **neliestos**. Papildomai UI turi `data-canonical-vertical="ELECTRONICS"` ir pan.

## Šaltinis

`shared/marketplace-domain/` — vienintelis 13A šaltinis. Importas: `@vauto/shared/marketplace-domain`.

**Nedubliuoti** į `server/src/shared/`. Senasis `shared/category-registry.ts` lieka DB slugams (`vehicles`, `clothing`, …) per `coerceListingCategoryForDb`. Vertikalę iš senų slugų duoda `resolveVerticalId` — nežinoma reikšmė = `null`.

## Capability matrica

| | Offers | Negotiation | Platform payment | Deposit | Shipping | Pickup | Appointments | Applications | Milestones | Delivery tracking | Reviews | Quantity | Price | Recurring |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TRANSPORT | taip | taip | taip | taip | ne | taip | taip | ne | ne | ne | taip | ne | taip | ne |
| REAL_ESTATE | taip | taip | ne | ne | ne | ne | taip | ne | ne | ne | taip | ne | taip | ne |
| ELECTRONICS | taip | taip | taip | ne | taip | taip | ne | ne | ne | taip | taip | taip | taip | ne |
| SERVICES | taip | taip | taip | ne | ne | ne | taip | ne | taip | ne | taip | ne | taip | taip |
| JOBS | ne | ne | **ne** | ne | ne | ne | taip | taip | ne | ne | taip | ne | ne | ne |
| HOME_GARDEN | taip | taip | taip | ne | taip | taip | ne | ne | ne | taip | taip | taip | taip | ne |

Invariantai:

- **JOBS** `supportsPlatformPayment === false` — nepaveldi e-commerce mokėjimo.
- **REAL_ESTATE** `supportsShipping === false` — tai ne siuntos SKU.
- Nežinoma kategorija: **fail-closed** (visos galimybės `false`, `resolveVerticalId` → `null`). Niekada `supportsPlatformPayment: true` pagal nutylėjimą.
- Drabužiai / įrankiai / nuoma / `other` **nėra** 13A šaknys — mapinamos į `null`.

Deal Room **kontraktas** (UI čia nerašomas): `canStartOffer`, `canUsePlatformPayment`, `canUseShipping`, `canApply`.

## Atributai (santrauka)

- TRANSPORT: markė, modelis, metai, rida, kuras, transmisija, VIN.
- REAL_ESTATE: objekto tipas, plotas, kambariai, statybos metai, aukštas, vieta.
- ELECTRONICS: gamintojas, įrenginio versija, būklė, atmintis, prekės garantija (prekės laukas, ne platformos garantija).
- SERVICES: paslaugos tipas, vietoje/nuotoliu, kainodara, trukmė.
- JOBS: pareigos, darbo forma, atlygis nuo/iki, lokacija, darbo tipas.
- HOME_GARDEN: prekės tipas, būklė, medžiaga, pristatymo galimybė.

## Legacy mapinimas

`resolveVerticalId("auto"|"cars"|"vehicle")` → `TRANSPORT`; `"real-estate"|"property"|"nt"` → `REAL_ESTATE`; ir t. t. Žr. `LEGACY_MAPPING_FIXTURES`. Tuščia / nežinoma → `null`.

## `/add` įrodymas

Svečio `/add` po kategorijos pasirinkimo rodo `CategorySchemaPreview` (`data-category-schema`). Elektronika — be VIN / ridos / kambarių. Darbas — be siuntos ir be platformos mokėjimo CTA (`data-no-platform-payment`). 12B Test 4 (Elektronika / MacBook, be transporto laukų) lieka galioti.

## Produkcijos kvietimai

| Vieta | Kaip |
| --- | --- |
| `src/lib/marketplace-verticals.ts` | 6 vertikalės iš `CANONICAL_VERTICALS` (ikonos lieka UI) |
| `HomeCategoryGrid` | Home ir `/add` |
| `DesktopHomeLayout` | paieškos šoninė juosta |
| `/add` + `CategorySchemaPreview` | schema pagal `resolveVerticalId` |

## 13B / 13C kontraktas (neimplementuota)

- **13B** faceted search: `getFilterableAttributes` / `getSearchableAttributes` / `getSortableAttributes`.
- **13C** Deal Room: `canStartOffer` / `canUsePlatformPayment` / `canUseShipping` / `canApply`. Mokėjimo primityvas lieka 11J — čia tik kategorijos durys.

## Užšaldytos ribos

- **11J FROZEN** — neliesti `server/src/payments/`, ledger, Stripe webhook/provenance, transaction core, 11J migracijų.
- **12A CERTIFIED** — 6 lygiavertės vertikalės, universalus `/add`, «platformos paslaugos mokestis», be klaidingų garantijų.
- **12B CERTIFIED** — universali paieška, tuščios paieškos validacija, mobilus pirmas kartas, AI ribos tekstas.

## Testai

```
npm run test:category-domain
```

(arba `npm run test:category-domain --prefix server`)

A–L: 6 šaknys, unikalūs ID, capabilities, JOBS payment, NT shipping, elektronikos siunta, izoliacija, validacija, fail-closed, legacy fixtures, wizard raktai, 11J riba.

## 13A.1 — /add auth round-trip ir schema

Pasirinkta vertikalė keliauja per `?vertical={uiSlug}` (`addListingReturnPath` → `requireAuthForListing`). Po prisijungimo `/add` skaito URL (`parseAddListingSearch`) ir kviečia `openAiSellerListingChat({ verticalId })`. Juodraštis sėdamas per `buildAiSellerListingSeed` + `buildCanonicalListingFlowContext` (`category`, `_canonicalVertical`, be svetimų laukų). Fashion (`?vertical=fashion`) lieka atskiras, ne 13A šaknis.

Testai M–N: `npm run test:category-domain`. E2E: `e2e/stage13a-add-schema.spec.ts`.

## Kas ne šio etapo

13B faceted UI, 13C Deal Room, nauji mokėjimai, 7-oji šaknis, FULL PASS / CERTIFIED antraštė.
