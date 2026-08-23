# Stage 18.3.2 — Canonical Shared-Facet Clear Closure

**Independent ChatGPT 18.3.1 audit:** CONDITIONAL PASS → this stage → **FULL PASS**.

## Blocker (1 MEDIUM)
`useCanonicalFacetUrl.ts` `commit()` used parts of the **stale** `marketplaceFilters`
state before calling `serializeMarketplaceFiltersIntoUrl()`:

1. **LOCATION** — `location: canonicalLocation ?? marketplaceFilters.location ?? ""`.
   Removing the canonical 13B `location` predicate made `canonicalLocation === undefined`,
   so the old `marketplaceFilters.location` was reused and a cleared location was
   re-written to the URL (not reload-safe).
2. **SORT** — the serializer received the old `marketplaceFilters.sort`; the canonical→frontend
   sort mapping (`price_asc→cheapest`, `newest→newest`, else→relevance`) ran only later in
   `setMarketplaceFilters()`, producing a one-write-lag for canonical sort clear/change.

## Fix (minimal, surgical)
A **single derived complement state** is built once in `commit()` and fed to BOTH
`serializeMarketplaceFiltersIntoUrl()` and `setMarketplaceFilters()`.

Pure, unit-tested helpers added to `src/lib/marketplace-filter-url.ts`:
- `canonicalLocationPredicate(facetQueryString)` → canonical `location` predicate value
  or `undefined` (complement-only keys scrubbed so the 13B parser succeeds and still finds
  a genuine `location` predicate).
- `deriveCanonicalLocationMirror(prevQS, prevLocation, nextLocation)`:
  - canonical `location` predicate present in `next` → mirror it;
  - predicate **removed** while the previous canonical query held one → **clear to `""`**
    (state-authoritative, no stale fallback, reload-safe);
  - previous canonical query held **no** location predicate (complement-only location) → **preserve** `prevLocation`.
- `deriveCanonicalSortMirror(nextSort)` → computes the frontend sort **before** URL serialization.

`commit()` now derives `location` + `sort` up-front, serializes the URL with the derived
state, then commits the **same** derived state — eliminating the one-write-lag.

## Ownership (Requirement C)
`commit()` is the **canonical** writer. Complement-only locations (AI chips / classic
`FilterFields`) are written via `syncMarketplaceFiltersToUrl()`, which does **not** pass
through `commit()`. Therefore the canonical-location clear is scoped to the canonical layer
— a legitimate complementary-only location is never blindly deleted.

## Regression Tests
| ID | Requirement | Coverage |
|----|-------------|----------|
| A  | Canonical 13B location set → clear → reload-safe | unit `18.3.2-A`, `18.3.2-A2` + E2E `18.3.2-A` |
| B  | Canonical sort set → clear → reload-safe | unit `18.3.2-B` + E2E `18.3.2-B` |
| C  | Complement-only location preserved | unit `18.3.2-C` |
| D  | Existing 18.3.1 unit + production E2E stay PASS | all 10 unit + E2E `18.3.1` |

## Full Regression Gate
| Gate | Result |
|------|--------|
| `tsc --noEmit` | PASS |
| `lint` | PASS (pre-existing warnings only) |
| full frontend unit | 66 / 66 |
| 13A + 13B frozen E2E | 13 / 13 |
| Stage 17 / 17.1 / 18.1 + a11y | 35 / 35 |
| Stage 18.2 | 7 / 7 |
| Stage 18.3 (+ 18.3.1 + 18.3.2) | 13 / 13 |
| `build:e2e` | PASS |

## Freeze Compliance
No 13A/13B shared-model changes. No DB/backend changes. No redesign. No Stage 20 work.
No new dependencies.

## Outcome
- 18.3 MEDIUM blocker: **CLOSED**
- STAGE 18.3: **FROZEN**
- **STRICT STOP** — ready for independent audit.
