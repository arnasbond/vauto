# STAGE 18.3 — SEARCH-STATE HARDENING

AI-native search state, URL persistence & classic interoperability — deterministic evidence.

> **Product invariant that Stage 18.3 upholds:** natural-language search is **not** an
> alternative VAUTO search engine. It is the easiest way to build the **same canonical
> `MarketplaceFilterState`** that the user can always see, edit, and continue with the
> classic filters. «AI padeda. Žmogus sprendžia.»

---

## 1. Production state-ownership schema

There is **one** canonical search state: `MarketplaceFilterState`
(`src/lib/marketplace-view.ts`), held by `VautoSearchContext` and written/read by the
Stage 17.1 URL-authoritative layer. AI is an **adapter** into that state, never a
parallel truth source.

```
Natural language
   │  resolveAiVertical(vauto-shared/marketplace-domain → canonical VerticalId)
   ▼
interpretAiFacets          (src/lib/ai-facet-interpretation.ts)
   ▼  canonical facet chips (FacetChip[])
applyFacetChips            (src/lib/apply-ai-facet.ts) — single production write bridge
   ▼
MarketplaceFilterState     (src/lib/marketplace-view.ts)  ← CANONICAL TRUTH
   ├─ facetQueryString     (13B ParsedFacetQuery: vertical + q)
   ├─ location / priceMin / priceMax / condition / radiusKm / sort
   └─ categoryAttributes   (chameleon attrs: rooms, propertyType, locationType, …)
   │
   ├─ useCanonicalFacetUrl.commit / syncMarketplaceFiltersToUrl  → URL
   │     (URL is derived FROM the canonical state, not a separate source)
   ▼
URL (search-URL params)   ──→  reload / deep-link  →  parseMarketplaceFiltersFromUrl + parseFacetSearchParams
   └─ restores the SAME MarketplaceFilterState WITHOUT re-running AI
   ▼
applyMarketplaceFilters / applyFacetFilters (src/lib/display-listings-pipeline.ts)
   ▼
results + chips + URL  — one consistent dereference of one state
```

Key ownership points:
- **13A `VERTICAL_ATTRIBUTES`** (`shared/marketplace-domain/attributes.ts`) — canonical
  attribute semantics are untouched; Stage 18.3 only re-reads them via
  `categoryFilterFieldsFor`.
- **13B `facet-query.ts`** (`ParsedFacetQuery`, `serializeFacetSearchParams`,
  `parseFacetSearchParams`, `canonicalizeFacetSearchParams`) — canonical query
  semantics untouched.
- The complementary URL layer added by Stage 18.3 (`src/lib/marketplace-filter-url.ts`) is an
  **origin-agnostic adapter** that mirrors the existing frontend `categoryAttributes` /
  `location` / price / condition / radius into complementary search params and
  re-validates every value through production allowlists. It does **not** introduce a
  second filter engine or second vertical registry.

---

## 2. AI → canonical state → URL path

After an AI query the client canonical adapter persists facets into the URL through two
cooperating writers, both using `history.replaceState` (non-navigational canonical
serialization):

1. `AiInterpretationChips` `useEffect` → `syncMarketplaceFiltersToUrl(filters)`
   (`src/components/marketplace/AiInterpretationChips.tsx`).
2. `useCanonicalFacetUrl.commit` → `serializeMarketplaceFiltersIntoUrl` for the
   `vertical=q` (13B) part.

Both combine into one URL, e.g. for `"2 kambarių butas Vilniuje iki 120000 €"`:

```
/search?vertical=real_estate&q=...&location=Vilnius&price_max=120000&ca_propertyType=Butas&ca_rooms=2
```

Verified deterministically for all 6 canonical verticals (E2E 18.3-A + unit
`18.3-A/B/C` 6-vertical round-trip): TRANSPORT, REAL_ESTATE, ELECTRONICS, SERVICES,
JOBS, OTHER_GOODS/HOME_GARDEN — correct canonical vertical + facets, and the URL
carries the active state.

### Root-cause fix found during implementation

`syncMarketplaceFiltersToUrl` originally called `serializeMarketplaceFiltersIntoUrl` and
**discarded its return value** (the function returns a copy; it does not mutate the
input). Result: the complementary facets were silently dropped and the URL was emptied.
Fixed by carrying the returned `URLSearchParams` forward. Regression-guarded by a new
unit test that asserts the exact merged URL
(`?vertical=real_estate&location=Vilnius&price_max=90000&ca_propertyType=Butas&ca_rooms=2`).

---

## 3. URL → reload / deep-link restoration path

`useHydrateFacetUrl` (`src/hooks/useCanonicalFacetUrl.ts`) restores a fully-serialized
state from the URL on mount:

```
window.location.search
   ├─ canonicalizeFacetSearchParams(raw) → parseFacetSearchParams  → 13B vertical/q/predicates
   └─ parseMarketplaceFiltersFromUrl(raw)  →  location/price/condition/radius/attrs
        → serializeMarketplaceFiltersIntoUrl(normalize({...}), params)  →  writeSearch (full URL)
        → setMarketplaceFilters({...restored, facetQueryString})
```

**Pre-fix gap:** `useHydrateFacetUrl` parsed the complementary params from the *13B-only
cleaned* params (after `canonicalizeFacetSearchParams` stripped `location`/`ca_*`), so
deep-linked complementary facets were lost. Fixed to parse from the **original raw URL
params** and to re-serialize the full URL (13B + complement).

**AI is not required for restoration** — no AI request is issued to deserialize state.
Proven by E2E 18.3-B (reload) and 18.3-C (fresh deep-link): anchor card restores, URL
expression of `ca_propertyType=`/`location=` retained, and `collectAgentPosts()` records
**zero** AI POSTs.

---

## 4. AI ↔ classic filter interoperability proof

Scenario (E2E 18.3-D, 390 px): restore an AI/RE state
(`vertical=real_estate&location=Tel%C5%A1iai&price_max=120000&ca_propertyType=Butas&ca_rooms=1`),
then edit the classic priceMax to 200 000 € via the mobile filter drawer.

- Canonical state re-filters → the anchor card remains (non-empty result).
- URL re-syncs to `price_max=200000` while **keeping** the AI-generated `location`,
  `ca_propertyType`, `ca_rooms`.
- No double filter, no stale chip, no UI/URL conflict: the classic edit lands in the
  same `MarketplaceFilterState` the AI seeded.
- Unit `18.3-D` proves AI facets + a classic priceMax edit coexist and both round-trip.

Principle held: **AI seeds the canonical state; the human continues editing the same
state with classic controls.** AI holds no privileged parallel search state.

---

## 5. Vertical-switch cleanup proof

Switching vertical in the classic drawer must drop incompatible attribute facets while
preserving **agnostic** ones (location, price, condition) only where the canonical model
permits.

- `applyDrawer` now resolves the effective category from the drawer's
  `verticalId` via the 13A `listingCategoryForVertical` (single source of truth) and
  calls `coerceCategoryAttributesToCategory` (re-validating through
  `categoryFilterFieldsFor`) before normalizing + syncing.
- `useCanonicalFacetUrl.commit` already resets `categoryAttributes` on a vertical change
  for the 13B path.

E2E 18.3-E: `REAL_ESTATE → ELECTRONICS` yields
`vertical=electronics&location=…&price_max=…` with **no** `ca_propertyType=`/`ca_rooms=`
leftover.
Unit `18.3-E coerceCategoryAttributesToCategory`: RE→ELECTRONICS, →SERVICES, →JOBS
→TRANSPORT converge so only agnostics remain; no ghost attrs in state or URL.

---

## 6. Back / Forward matrix

History model follows the **validated Stage 17/17.1 canonical contract**: classic filter
edits are non-navigational canonical serialization (`replaceState`), only explicit view
changes push a distinct entry (`pushState`). Stage 18.2's certified Back/Forward E2E uses
the same two-entry model.

E2E 18.3-F (390 px):

| Step | Action | URL after | Facets | View |
|------|--------|-----------|--------|------|
| A | deep-link RE baseline | `vertical=real_estate&location=…&ca_propertyType=…` | AI-restored intact | grid (default) |
| B | classic priceMax edit (replaceState, same entry) | `…&price_max=200000` | AI-restored preserved | grid |
| C | view=list (pushState, new entry) | `…&view=list` | preserved | list |
| Back | return to B entry | `…&price_max=200000` (no `view=list`) | `ca_propertyType=` present, anchor card | grid |
| Forward | return to C | `…&view=list&ca_propertyType=…` | preserved | list |

Assertions cover **URL, facets, chips/result card, and view** at each step. No stale AI
state, no ghost facets. `goBack/goForward` restore the pushed (view) entries; the
canonical filter state is re-hydrated from the URL on each popstate — no extra AI
request.

---

## 7. Second-query / query-edit cleanup proof

Unit `18.3-G`: `RE` query (`rooms=2`, `propertyType=Butas`) → second query
`"MacBook Pro iki 1500 €"` → `applyFacetChips` writes the ELECTRONICS canonical state
and the serialized URL carries **no** `ca_rooms`/`ca_propertyType`. A new AI intent never
inherits incompatible facets from the previous vertical.

---

## 8. Zero-results + state preservation

E2E 18.3-H (390 px): deep-link with a keyword that deterministically returns nothing
(`q=…`, `location=Telšiai`, `ca_propertyType=Butas`).

- Results = 0, **no fake/auto-widened cards** injected.
- URL keeps the user's criteria verbatim (`q=…`, `location=…`).
- Classic drawer remains editable; changing `Vietovė` to `Vilnius` re-syncs the URL
  (`location=Vilnius`) and recomputes — no new AI query, no hidden facet removal.

Unit `18.3-H` confirms criteria stay serialized and that a widened criteria set still
returns an empty set deterministically with no silent widening.

---

## 9. AI failure fallback

E2E 18.3-I routes `https://vauto-api.onrender.com/**` to HTTP 500 and confirms the
canonical facets still restore results (anchor card), with **0 horizontal overflow**.
Classic category navigation, filters, URL state, deep-links and Back/Forward remain
first-class when the AI endpoint is down. This reuses the existing deterministic AI
failure mechanism (Stage 17 invariant).

---

## 10. Mobile 390 + Desktop 1440 results

E2E 18.3-J runs the full URL→facets→results→reload flow at both 390×844 and 1440×900
with `horizontalOverflowPx() <= 0`, anchor restored, and reload identity.
Additional overflow coverage at 390/430/768/1024/1440/1920 exists in the frozen Stage
18N matrix (passed with Stage 18.1 gate).

---

## 11. Regression command exit codes

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 (pre-existing warnings only) |
| `npm run test:unit:frontend` | 51/51 pass — exit 0 |
| `npm run test:category-domain --prefix server` (13A) | 14/14 pass — exit 0 |
| `npm run test:faceted-search --prefix server` (13B) | 23 pass, 1 legit DB-bound skip, 0 fail — exit 0 |
| `npx playwright test … stage17/stage171/stage18-ai-native` | 31/31 — exit 0 |
| `npx playwright test e2e/stage17-accessibility.spec.ts` | 4/4 — exit 0 |
| `npx playwright test e2e/stage182-ai-native-flow.spec.ts` | 7/7 — exit 0 |
| `npx playwright test e2e/stage183-search-state.spec.ts` | 10/10 — exit 0 |
| `npm run build:e2e` (production static build) | success |

**All new Stage 18.3 assertions are deterministic** — none gate on `count > 0` to pass,
none use `.catch(() => true)`.

---

## 12. Changed production files & reason

| File | Change | Reason |
|---|---|---|
| `src/lib/marketplace-filter-url.ts` | **new** — complementary URL serialization adapter (`serializeMarketplaceFiltersIntoUrl`, `parseMarketplaceFiltersFromUrl`, `syncMarketplaceFiltersToUrl`, `categoryForVerticalId`, `coerceCategoryAttributesToCategory`) + **fix**: carry the serialized param set forward in `sync` | §2 URL persistence; §3 restoration; §4 sync; §5 vertical cleanup; the origin for the return-value bug fix |
| `src/hooks/useCanonicalFacetUrl.ts` | `commit` + `useHydrateFacetUrl` now serialize/restore complementary facets from the open URL adapter, and `commit` resets `categoryAttributes` on vertical change | §2/§3 — AI/classic state → URL → reload/deep-link |
| `src/components/marketplace/MarketplaceFilterBar.tsx` | `applyDrawer` calls `syncMarketplaceFiltersToUrl(next)` and resolves the effective category (via 13A `listingCategoryForVertical`) + `coerceCategoryAttributesToCategory` on vertical switch | §4 drawer edits persist; §5 vertical cleanup |
| `src/components/marketplace/AiInterpretationChips.tsx` | `syncMarketplaceFiltersToUrl(filters)` effect after interpretation/edit | §2 — AI chips persist to URL |
| `src/lib/__tests__/marketplace-filter-url.test.ts` | **new/expanded** — 6-vertical round-trip, URL rejection, AI↔classic, second-query, zero-results, sync-return-value regression, vertical coerce | §11 deterministic evidence |
| `e2e/stage183-search-state.spec.ts` | **new** — A–J deterministic E2E suite | §11 audit evidence |

*(`src/lib/apply-ai-facet.ts`, `src/lib/ai-facet-interpretation.ts`, `src/context/VautoSearchContext.tsx`
were touched in Stage 18.1/18.2/18.2.1 — reported there; Stage 18.3 only references the
existing `applyFacetChips` and `categoryForVerticalId`/`coerceCategoryAttributesToCategory`
helpers built on canonical 13A signal.)*

---

## 13. Frozen core untouched — confirmation

- **Stage 11J** payments/ledger/Stripe/transaction state machine/disputes/reputation: untouched.
- **Stage 13A** canonical marketplace domain model: untouched; re-read (not re-defined).
- **Stage 13B** canonical facet/query semantics (`facet-query.ts`, `VERTICAL_ATTRIBUTES`): untouched.
  `canonicalizeFacetSearchParams` is used as-is; the complementary layer is added **beside** it.
- **Stage 18.1 / 18.2 / 18.2.1** certified intent→facet→result semantics: preserved; Stage 18.3
  writes into the same canonical bridge (`applyFacetChips`, `applyMarketplaceFilters`).
- No new parallel marketplace/vertical/facet/filter engine. No DB migration. No redesign.
- No AI feature added; AI is explicitly **not** invoked for serialized-state restoration.

---

*Stage 18.3 implemented. Awaiting independent ChatGPT audit (vauto-18.3-delta.zip).*
