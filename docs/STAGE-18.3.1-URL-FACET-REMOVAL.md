# STAGE 18.3.1 — STALE COMPLEMENTARY URL FACET REMOVAL CLOSURE

Independent ChatGPT 18.3 audit → **CONDITIONAL PASS**, 1 MEDIUM blocker resolved here.

**Blocker:** `serializeMarketplaceFiltersIntoUrl` (complementary URL layer) appended active
complementary facets but did **not** deterministically remove previously-written, now-inactive
`location`, `price_min`, `price_max`, `condition`, `radius`, `sort` and `ca_*` params. Because
`syncMarketplaceFiltersToUrl` can start from a stale `filters.facetQueryString`, a removed
filter could linger in the URL and be resurrected on reload / deep-link.

**Fix:** The complementary serializer is now **state-authoritative / replacement-safe**, not
append-only.

**Product invariant upheld:** «AI padeda. Žmogus sprendžia.» A removed facet stays removed;
a cleared filter can never silently return via the URL. No canonical search semantics change.

---

## 1. What was changed (minimal, surgical)

| File | Change |
|---|---|
| `src/lib/marketplace-filter-url.ts` | `serializeMarketplaceFiltersIntoUrl` is now **replacement-safe**. Before writing current state it strips stale complementary params; then writes only the currently-active, allowlisted facets. |
| `src/hooks/useCanonicalFacetUrl.ts` | `commit` mirrors the canonical `location` predicate into complementary `filters.location`, keeping the frontend complement the single authoritative location source (so a live 13B location is re-written rather than stripped, and a cleared one is removed). |
| `src/lib/__tests__/marketplace-filter-url.test.ts` | +10 deterministic unit regression tests (61 total). |
| `e2e/stage183-search-state.spec.ts` | +1 E2E test `18.3.1` exercising the **real production write path** (classic drawer `applyDrawer` → `syncMarketplaceFiltersToUrl`) + reload. |

No change to Stage 13A/13B shared models, no redesign, no DB migrations, no Stage 20 work.

---

## 2. The replacement-safe algorithm

Inside `serializeMarketplaceFiltersIntoUrl(filters, params)`:

1. **Copy** the incoming URL params (13B canonical `vertical`, `q`, predicates stay).
2. **Determine 13B ownership** (`owned13bKeys`): parse the incoming params through the
   canonical `parseFacetSearchParams`, scrubbing the complement-only keys
   (`price_min`, `price_max`, `radius`, `ca_*`) first so a genuine canonical predicate
   (e.g. `condition=Naudotas`, `location=X`, `rooms_min`) is recognised correctly and never
   dropped — even when complementary price/radius/`ca_*` params coexist in the same URL.
3. **Strip** every complementary param that is no longer active in `filters`:
   - `price_min` / `price_max` / `radius` / `ca_*` — owned ONLY by the complement; removed
     when the state field is `null`/empty.
   - `condition` — complement value domain is `new|used`; the 13B predicate uses native
     option values (`Naudotas` …). A cleared complement `condition=used` is removed; a
     13B `condition=Naudotas` is preserved.
   - `sort` — single shared field; removed when `filters.sort = "relevance"` and re-written
     otherwise.
   - `location` — the complement `filters.location` is the authoritative mirror; removed when
     empty and re-written when set. An active canonical `location` predicate is therefore
     re-written, not lost (via the `commit` mirror).
4. **Write back** only currently-active, allowlisted facets.

Net effect: `filter → clear → reload` never resurrects the cleared filter; all 13B canonical
params (`vertical`, `q`, predicates) persist.

---

## 3. Blocker scenarios — proof

| Scenario | Unit test | Result |
|---|---|---|
| `price_max=120000 → priceMax=null` → `price_max` disappears from URL → reload no price | `18.3.1: priceMax=null → price_max disappears from URL (stale removed)` | PASS |
| `location=Vilnius → location=""` → param disappears → reload no location | `18.3.1: location='' → location param disappears from URL` | PASS |
| `condition=used → all` → disappears | `18.3.1: condition=all → condition param disappears from URL` | PASS |
| `radius=20 → null` → disappears | `18.3.1: radius=null → radius param disappears from URL` | PASS |
| `ca_rooms=2 → remove chip` → `ca_rooms` disappears + reload no restore | `18.3.1: rooms chip removed → ca_rooms disappears from URL and reload does not restore` | PASS |
| 13B `vertical`, `q`, valid predicates survive stripping | `18.3.1: genuine 13B predicate keys are never stripped` + `clearing the whole complement leaves ONLY active (and 13B) params` | PASS |

E2E (real production write path): `18.3.1: clearing a classic filter removes the stale
complementary param (reload-safe)` opens a deep-link with a full complement, clears `priceMax`
through the classic drawer (`data-facet-apply` → `applyDrawer` → `syncMarketplaceFiltersToUrl`),
asserts `price_max=` leaves the URL, then reloads and asserts it is **not** resurrected while the
still-active agnostic complement (`location`) survives.

---

## 4. Regression gate (all frozen)

| Suite | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `eslint` (changed files) | 0 errors |
| Unit `marketplace-filter-url` | 61/61 pass (incl. +10 18.3.1) |
| Unit full frontend | 61/61 pass |
| E2E 13A + 13B (`stage13a-add-schema`, `stage13b-faceted-filters`) | 13/13 pass |
| E2E Stage 17 / 17.1 / 18.1 + a11y | 35/35 pass |
| E2E Stage 18.2 (`stage182-ai-native-flow`) | 7/7 pass |
| E2E Stage 18.3 (`stage183-search-state`, incl. `18.3.1`) | 11/11 pass |
| `build:e2e` (static export) | pass |

---

## 5. Raw evidence

See the packaged `vauto-18.3.1-delta.zip`:
`unit-filter-url.txt`, `unit-full.txt`, `tsc.txt`, `e2e-183.txt`, `git-diff.txt`, this document.

---

*STRICT STOP — 18.3.1 complete. Ready for independent audit.*
