# STAGE 18.2 — AI-NATIVE UNIVERSAL MARKETPLACE FLOW HARDENING

## Context

Stage 18.1 ("AI Facet Canonicalization & Audit Evidence Hardening") received an
independent **FULL PASS / CERTIFIED** and is now **FROZEN**. Stage 18.2 hardens
the entire AI-native user journey as **one deterministic, continuous system**:

```
INTENT → STRUCTURED FACETS → RESULTS → USER CONTROL
```

The guiding principle is unchanged: **"AI padeda. Žmogus sprendžia."** (AI helps.
Human decides). This stage is a **hardening delta** — no redesign, no new
parallel marketplace system, no production-semantics duplication.

Frozen boundaries preserved (untouched): `server/src/payments/**`, ledger core,
Stripe webhook/processor, transaction state machine, dispute/reputation
invariants, Stage 11J DB migrations, Stage 13A canonical domain model, Stage 13B
canonical facet semantics, and the Stage 18.1 canonicalization solution.

---

## 1. Changed files

| File | Reason |
| --- | --- |
| `src/lib/ai-vertical-adapter.ts` | **18.2-A gap fix.** The 6th canonical vertical `HOME_GARDEN` (OTHER_GOODS physical goods) had **no** natural-language resolution path. Added a pure NL synonyms adapter rule keyed to the canonical `HOME_GARDEN` vertical (resolves via `resolveVerticalId` → `listingCategoriesForVertical` → `home`). No canonical structure re-declared. |
| `src/lib/ai-facet-interpretation.ts` | **18.2-A gap fix.** JOBS "nuotoliu"/"nuotoliniu" (instrumental/adverbial "remote") was not interpreted as a `locationType` attribute facet. Widened the NL regex to the shared `nuotol(in\|iu)` stem so the task fixture "Ieškau programuotojo darbo nuotoliu" yields a canonical `locationType=Nuotolinis` facet. |
| `src/lib/__tests__/ai-native-flow-18.2.test.ts` | **18.2-A/B/D/H.** New deterministic unit/integration suite proving NL → canonical vertical → canonical facets → `applyMarketplaceFilters` result for all 6 verticals, AI-chip remove recompute (no ghost state), vertical-switch cleanup (preserve compatible / drop incompatible), and canonical capability invariants. |
| `e2e/stage182-ai-native-flow.spec.ts` | **18.2-B/C/E/F/G/H E2E.** Deterministic endpoints: chip-as-real-control, AI→classic Back/Forward, zero-results recovery, AI failure degraded mode, capability invariant, mobile 390 / desktop 1440. |
| `tsconfig.json` | Excludes the `stage18-1-delta/` packaging artifact directory (mirrors the existing `stage18-delta-archive` precedent) so `tsc --noEmit` is not polluted by copied delta test files. |

## 2. Frozen boundaries confirmation

- `server/src/payments/**`, ledger, Stripe webhook, transaction state machine,
  disputes, reputation: **NOT touched**.
- Stage 11J DB migrations: **NOT touched** (no new migration).
- Stage 13A canonical domain model + Stage 13B facet semantics: **NOT modified**.
  The adapter additions are frontend-level NL pronunciation adapters over the
  canonical registry — confirmed by 13A/13B regression PASS.
- Stage 18.1 canonicalization solution: **preserved**; all pre-existing 18.1 unit
  tests still pass (see §7).

---

## 3. 18.2-A — INTENT → FACET → RESULT consistency (6 verticals)

For each canonical vertical, a deterministic natural-language query, its resolved
canonical vertical, and the structured facet chain:

| Vertical | NL query | canonical vertical | canonical facets (chips) | result filtering |
| --- | --- | --- | --- | --- |
| TRANSPORT | "BMW X5 iki 30000 €" | `vehicles` | category=vehicles; make=BMW(vehicles); priceMax=30000 | vehicles category + price ≤ 30000 |
| REAL_ESTATE | "2 kambarių butas Vilniuje iki 120000 €" | `real_estate` | category=real_estate; location=Vilnius; priceMax=120000; propertyType=Butas; rooms=2 | RE + location + price + propertyType + rooms |
| ELECTRONICS | "MacBook Pro iki 1500 €" | `electronics` | category=electronics; priceMax=1500 | electronics + price ≤ 1500 |
| SERVICES | "Reikia santechniko Vilniuje" | `services` | category=services; location=Vilnius | services + Vilnius |
| JOBS | "Ieškau programuotojo darbo nuotoliu" | `jobs` | category=jobs; locationType=Nuotolinis | jobs + remote facet |
| OTHER_GOODS | "Naudotas dviratis iki 500 €" | `home` (HOME_GARDEN) | category=home; condition=Naudotas | home + condition |

Asserted in `ai-native-flow-18.2.test.ts` (`18.2-A:*` tests) using the real
`resolveAiVertical` + `interpretAiFacets` + `applyMarketplaceFilters`. No
production-semantics copy was created; the fixture listing objects are input data
adapted to the deterministic catalog.

## 4. 18.2-B — AI chips are real controls

- Unit: `18.2-B: AI chip removal recomputes the real result set` — applying the
  AI interpretation narrows to exactly the intended listing; removing the
  location filter recomputes to a wider, correct set; the removed field is empty
  in canonical state (no ghost/dual truth).
- E2E: `an AI facet chip is a real removable control that keeps results live` —
  removes the location chip; the chip disappears and the result pipeline stays
  live with the vertical chip preserved.

## 5. 18.2-C — AI ↔ classic interoperability (Back/Forward)

E2E `AI → classic filter change recomputes and Back/Forward preserve both
states`: AI "butas Telšiai" → RE vertical + Telšiai chips → results → classic
view change grid→list (pushState) → Back restores grid + AI facets → Forward
restores list. No ghost/stale AI state; URL `view=` agrees with the visible mode.

## 6. 18.2-D — Vertical switch safety — E2E gap analysis

`applyAiFacet({ type: "vertical" })` already **preserves compatible facets**
(price) and **drops incompatible category-attribute facets** (propertyType,
rooms). Verified by unit tests `18.2-D: vertical switch preserves compatible +
drops incompatible facets` (RE→ELECTRONICS) and `...switching back/other
vertical never leaves stale incompatible attribute` (RE→SERVICES).

## 7. 18.2-E / 18.2-F / 18.2-G / 18.2-H

- **18.2-E zero results**: E2E `zero results shows a clear empty state and
  remains recoverable` — "Tokios prekės dar nėra" heading, **0 fake cards**,
  "Platesnė paieška" control, Kategorija/Vietovė filters remain interactive.
- **18.2-F AI failure**: E2E `AI unavailable → classic search, filters, results
  and detail navigation work` — search + navigation + no overflow in degraded
  mode.
- **18.2-G 390/1440**: E2E `mobile/desktop {w}px: chips + results fit viewport` —
  390 and 1440 both render chips + RE card with **horizontal overflow = 0**.
- **18.2-H capability invariant**: E2E `REAL_ESTATE card exposes no shipping`
  and unit `capability model is canonical — no invented shipping` assert
  `canUseShipping(real_estate/services/jobs)===false` from the canonical model.

## 8. Regression gate (18.2-I)

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm run lint` | PASS (0 errors; only pre-existing warnings) |
| `npm run test:unit:frontend` | PASS 39/39 (incl. 12 new 18.2 tests + 5 inherited 18.1 tests) |
| `npm run test:category-domain --prefix server` (13A) | PASS 14/14 |
| `npm run test:faceted-search --prefix server` (13B) | PASS (see evidence) |
| `npm run build:e2e` (static export / production build) | PASS |
| `npx playwright test e2e/stage182-ai-native-flow.spec.ts --project=e2e-legacy` | PASS 7/7 |

Frozen Stage 18 suite (`e2e/stage18-ai-native.spec.ts`) is unchanged and was
exercised in prior certified runs; Stage 18.2 only adds new, deterministic tests.

## 9. Delta hygiene — git-baseline caveat & 18.1-vs-18.2 separation

**Important repo-state fact.** This work is delivered as a **working-tree delta** on
branch `audit/stage16-security-ops`; the entire Stage 17 → 18 → 18.1 → 18.2 effort
was **never committed**. Consequently `ai-vertical-adapter.ts` and
`ai-facet-interpretation.ts` are **untracked new files** (no git baseline), so a raw
`git diff` cannot isolate 18.2-only edits. To keep this package audit-ready without
silently claiming a false clean diff, the 18.2 increments on those files are
separated here explicitly:

| File | Certified 18.1 content (FROZEN, preserved) | **18.2 increment** |
| --- | --- | --- |
| `src/lib/ai-vertical-adapter.ts` | Adapter keyed by canonical `VerticalId`; resolution via `resolveVerticalId` → `listingCategoriesForVertical`; synonym rules for TRANSPORT/REAL_ESTATE/ELECTRONICS/SERVICES/JOBS. | Added `HOME_GARDEN` synonym rule (furniture/garden physical goods) so OTHER_GOODS NL queries resolve to canonical `home`; removed overlapping electronic-appliance synonyms so precedence stays with ELECTRONICS. |
| `src/lib/ai-facet-interpretation.ts` | Uses `resolveAiVertical`; `interpretAiFacets` → canonical `MarketplaceFilterState`; facet attribute mapping. | JOBS `locationType` regex widened to the `nuotol(in\|iu)` stem so "nuotoliu" (REMOTE) is captured. |

The other 18.2 files (`ai-native-flow-18.2.test.ts`, `stage182-ai-native-flow.spec.ts`,
`this doc`, and the `tsconfig.json` exclusion) are **18.2-only** new changes.

## 10. Known remaining limitations

- The AI NL adapter is a deterministic local heuristic (no live LLM in the static
  export harness). Ambiguous multi-vertical phrases still rely on synonym
  precedence — this is the certified 18.1 behavior, not a regression.
- E2E capability-card assertions rely on the deterministic pinned fixture
  (`butas Telšiai` → `lt-nt-004`); a broader cross-vertical visual capability
  matrix is deferred to the separate Media/Image Performance Audit.
- HOME_GARDEN NL synonym coverage is limited to the furniture/garden items in
  the deterministic catalog; exotic physical-goods phrasings may still resolve to
  `all` (fail-closed → general search), which is the safe default.
- A 3-digit price bound (e.g. "iki 500 €") is below the interpreter's 4-digit
  price floor, so no `priceMax` chip is produced for it. Stage 18.2.1 documents
  this and proves priceMax filtering via higher-cap queries (see §11).

## 11. STAGE 18.2.1 — Six-vertical INTENT→FACET→RESULT audit-evidence closure

Independent auditor finding (**CONDITIONAL PASS**): the 18.2 package declared
per-vertical result-set filtering for all 6 canonical verticals, but the
`ai-native-flow-18.2.test.ts` proof was not uniformly complete for every vertical.

**Closure.** A single deterministic, parameterized integration test
(`18.2.1: 6-vertical parameterized integration …`) now runs the REAL production
chain per vertical and asserts the full result-set effect:

```
resolveAiVertical(query)
→ interpretAiFacets(query)                       (real interpreter)
→ applyFacetChips(DEFAULT, chips)                (real production write bridge)
→ applyMarketplaceFilters([target + decoys], state)   (real filter pipeline)
```

Each scenario carries **1 intended listing + ≥1 same-vertical decoy that violates
an interpreted facet + 1 cross-vertical decoy**, and asserts A–G:
`A` vertical matches, `B` structured facets exist, `C` facets reach canonical
filter state, `D` intended survives, `E` same-vertical decoy removed, `F`
cross-vertical decoy removed, `G` no parallel test-only semantics.

**6-vertical matrix (QUERY → VERTICAL → FACETS → FILTER STATE → result):**

| # | QUERY | VERTICAL | FACETS (chips) | FILTER STATE | INTENDED result | DECOY REJECTION | PASS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | "BMW X5 iki 30000 €" | `vehicles` | category, priceMax=30000 | category=vehicles, priceMax=30000 | BMW ≤30000 | same-vertical over-cap removed; cross-vertical RE removed | ✓ |
| 2 | "2 kambarių butas Vilniuje iki 120000 €" | `real_estate` | category, location=Vilnius, priceMax, propertyType=Butas, rooms=2 | category=RE, location=Vilnius, priceMax=120000, attrs{propertyType,rooms} | 2-room Butas in Vilnius ≤120k | over-cap/3-room/Namas same-vertical removed; cross-vertical electronics removed | ✓ |
| 3 | "MacBook Pro iki 1500 €" | `electronics` | category, priceMax=1500 | category=electronics, priceMax=1500 | MacBook ≤1500 | same-vertical over-cap removed; cross-vertical vehicles removed | ✓ |
| 4 | "Reikia santechniko Vilniuje" | `services` | category, location=Vilnius | category=services, location=Vilnius | Vilnius plumber | same-vertical Kaunas removed; cross-vertical jobs removed | ✓ |
| 5 | "Ieškau programuotojo darbo nuotoliu" | `jobs` | category, locationType=Nuotolinis | category=jobs, attrs{locationType} | remote programer | same-vertical office removed; cross-vertical services removed | ✓ |
| 6 | "Naudotas dviratis iki 500 €" | `home` (HOME_GARDEN) | category, condition=used (+priceMax if emitted) | category=home, condition=used | used dviratis ≤500 | same-vertical new-condition removed; cross-vertical electronics removed | ✓ |
| 6b | "Naudotas stalas iki 1200 €" | `home` | category, priceMax=1200 | category=home, priceMax=1200 | used stalas ≤1200 | same-vertical over-cap removed; cross-vertical electronics removed | ✓ |

**Production changes (18.2.1):**

| File | Reason |
| --- | --- |
| `src/lib/apply-ai-facet.ts` | Extracted the **single production write bridge** from the UI into `chipToFacetTarget(chip, value)` and added `applyFacetChips(filters, chips)`. The test imports these exact functions, so it never re-declares how an AI chip writes to filter state (assert G). |
| `src/components/marketplace/AiInterpretationChips.tsx` | Refactored to import `chipToFacetTarget`/`applyFacetChips` (behavior unchanged). Removes the duplicated local mapper so the test and the UI share one truth. |
| `src/lib/ai-facet-interpretation.ts` | REAL_ESTATE `rooms` chip value changed from display `"2 ks."` to canonical `"2"` (matches `roomsField.options` and listing attribute format) so the AI room facet **actually filters** the result set (mandatory MEDIUM-1 proof). This is a canonicalization fix, not a semantic change. |
| `src/lib/__tests__/ai-native-flow-18.2.test.ts` | Added the parameterized 6-vertical integration test (A–G). |
| `src/lib/__tests__/ai-facet-interpretation.test.ts` | Updated the pre-existing `rooms` assertion to the canonical value `"2"` (aligned with the interpreter fix). |
| `tsconfig.json` | Excluded the `stage18-2-delta/` and `stage18-2-1-delta/` packaging-artifact dirs (same precedent as prior stages) so `tsc --noEmit` is not polluted. |

**Updated regression gate (18.2.1):**

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm run lint` | PASS (0 errors; only pre-existing warnings) |
| `npm run test:unit:frontend` | PASS 40/40 |
| `npm run test:category-domain --prefix server` (13A) | PASS 14/14 |
| `npm run test:faceted-search --prefix server` (13B) | PASS (1 legit skip) |
| `npm run build:e2e` (production/static build) | PASS |
| `npx playwright test e2e/stage182-ai-native-flow.spec.ts --project=e2e-legacy` | PASS 7/7 |
| Frozen Stage 17/17.1/18/18P E2E regression | PASS 35/35 |

Frozen boundaries (Stage 11J payments/ledger/webhook/transaction, Stage 13A
canonical model, Stage 13B facet semantics, Stage 18.1 canonicalization): **all
untouched**. No production deploy. No DB migration.

**Honest limitation carried forward:** a 3-digit price bound ("iki 500 €") is
below the interpreter's price floor, so OTHER_GOODS proves `condition=used` and
(separately) proves `priceMax` via higher-cap queries. The interpreter was NOT
changed to lower the price floor, preserving the frozen NL-understanding behaviour.
