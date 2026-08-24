# STAGE 22B — MAP EXPERIENCE IMPLEMENTATION & PRODUCTION HARDENING

**Status:** IMPLEMENTED — AUDIT READY (generuojama prieš audit paketą)
**Baseline:** Stage 22A / 22A.1 / 22A.1E / 22A.2 — FULL PASS / CERTIFIED
**Branch:** audit/stage16-security-ops · HEAD d4b7b41aed46f738de7411872100c3da45165b90

## Tikslas

Stage 22B paverčia Stage 22A nustatytą safe view-mode/capability contract į
production-ready map patirtį map-capable vertikalėms. Tai NE Stage 22A
perdizainas — map yra vertikalei adaptyvus marketplace presentation mode, ne
atskira paieškos sistema.

Core invariant:

```
SEARCH INTENT → CANONICAL SEARCH STATE → RESULTS
                                          ↓
                                   LIST / GRID / MAP
```

Presentation mode keitimas NEGALI keisti marketplace intent.

## Implementacijos delta (minimalus, priskirtinas 22B)

| Failas | Tipas | Turinys |
|---|---|---|
| `src/lib/map-provider.ts` | **NAUJAS** | Tile provider abstrakcija: URL/attribution iš vieno šaltinio; deterministinė resolution (`NEXT_PUBLIC_MAP_TILE_URL` → `NEXT_PUBLIC_MAP_PROVIDER` → default OSM); sanitarizacija; attribution visada išsaugoma |
| `src/lib/__tests__/map-provider.test.ts` | **NAUJAS** | 7 unit testai: default, custom URL, static provider, unknown fallback, malformed URL, missing placeholders, default attribution |
| `src/components/marketplace/ListingMapViewInner.tsx` | **MODIFIKUOTAS** | Provider consumption; tile-failure detekcija → graceful degraded state (`data-map-degraded`, `data-map-fallback-list`); LIGHT/DARK tokenai; a11y popup fallback; `data-map-container`/`data-map-footer` test hooks; Supercluster išsaugotas. 22B.1: URL geo context (`maptest=nogeo`) → deterministinis zero-geocoded; `data-map-listing-count`; sr-only marker list |
| `src/lib/geocoding.ts` | **MODIFIKUOTAS (22B.1)** | `enrichListingCoords` optional `geoContext`; `mapGeoContextFromUrl` — deterministinis test-only context, niekada nefabricuoja koordinačių |
| `e2e/stage22b1-audit-delta.spec.ts` | **NAUJAS (22B.1)** | AUD-01 deterministinis zero-geocoded; AUD-02 real marker → detail → Back; AUD-03 true live MAP resize continuity |
| `src/components/marketplace/ListingMapView.tsx` | **MODIFIKUOTAS** | Loading skeleton → design tokenai (LIGHT/DARK) |
| `e2e/stage22b-map.spec.ts` | **NAUJAS** | Dedikuotas deterministinis map E2E (13 testų) |
| `e2e/stage22b-map-visual-evidence.spec.ts` | **NAUJAS** | Map visual evidence (4 testai, LIGHT+DARK) |

## Canonical contract — vienintelis authority

Stage 22B vartoja (NE kartoja, NE perrašo):

- `enabledViewModesForVertical(verticalId)` — capability gating
- `presentationContractForVertical(verticalId).viewModes.map` — lygis
- `viewModes.mapRationale` — vartotojui skirtas paaiškinimas
- `useCanonicalFacetQuery()` — kanoninė facet query

Jokio antro map-capability registry. Jokių hardcoded vertical pavadinimų map UI.
JOBS MAP = NOT_APPLICABLE išlieka per egzistuojantį contract.

## Search/view continuity

- LIST → MAP → LIST: canonical query/facets/URL išlieka (E2E PROVEN)
- GRID → MAP → GRID: tas pats (E2E PROVEN)
- MAP → detail → back: URL atkuriamas — FULL marker→detail→Back kelias deterministiškai
  įrodytas Stage 22B.1 (AUD-02: `e2e/stage22b1-audit-delta.spec.ts`)
- Resize while MAP: map lieka attached po kiekvieno transition, 0 overflow (E2E PROVEN);
  pilnas per-transition MAP continuity proof — Stage 22B.1 (AUD-03)
- Zero-geocoded: deterministinis scenarijus (canonical rezultatai yra, 0 geocodable
  listingų) — Stage 22B.1 (AUD-01, `maptest=nogeo`)
- LIGHT → DARK → LIGHT: abi temos veikia (E2E PROVEN)
- Map judėjimas/zoom NEsikeičia canonical intent (jokio "search as map moves")

## Tile provider

- Default: `osm-standard` (OSM standard tiles, attribution išsaugota)
- Override: `NEXT_PUBLIC_MAP_TILE_URL` + `NEXT_PUBLIC_MAP_ATTRIBUTION`
- Alternatyva: `NEXT_PUBLIC_MAP_PROVIDER=osm-hot`
- Sanitarizacija: netinkamas URL/attribution → fallback be crash
- Failure: tile error → degraded state (`data-map-degraded`), canonical rezultatai
  lieka pasiekiami (`data-map-fallback-list` → `#listing-results`)

## Protected zones

- Stage 11: ABSOLUTAI FROZEN — 0 modifikacijų
- Stage 22A contract: tik skaityti
- 22A.1E geometry tests: nesilpninami
- 21D-L: nekeičiamas (dokumentuota techninė skola)
- MASTER LIGHT/DARK: jokio naujo paletės; emerald saikingai (cluster icon)

## Coordinate invariant (22B.1 patikslinta formuluotė)

> Canonical listing coordinates are never fabricated or mutated.
> Presentation-only marker offsets may be derived for overlapping markers and
> must never persist into canonical listing/search state.

- `enrichListingCoords` niekada neprideda koordinačių nežinomai/šalies lygio lokacijai.
- `spreadDuplicateCoords` dirba tik su kopijomis (spread) — canonical listing
  objektas lieka nepaliestas.
- `maptest=nogeo` yra TEST-ONLY deterministic context: jis verčia map pipeline
  elgtis taip, tarsi 0 listingų turėtų koordinates — jokio produkcinio kelio
  (kanoninio enrich) šis flagas nekeičia. Flagas skaitomas iš URL ir
  sessionStorage (`vauto_map_test_ctx`) — sessionStorage yra stabilus transportas,
  nes canonical AI facet URL sync gali perrašyti URL be test param; produkcinis
  naršymas niekada nenustato nei vieno.
- E2E įrodoma: `?maptest=nogeo` (AUD-01) — canonical rezultatų rinkinys
  ne tuščias, bet `[data-map-empty]` rodomas, 0 markerių/klasterių, jokia
  koordinatė nefabricuojama, LIST perjungimas atstato tuos pačius rezultatus.
- Unit testai (`src/lib/__tests__/geocoding-invariant.test.ts`) įrodo:
  country-only / unknown lokacija → nėra koordinačių; `forceUngeocoded` ištrina
  net explicit GPS koordinates presentation-lygmenyje (identity/canonical laukai
  lieka nepaliesti); `mapGeoContextFromUrl` grąžina `normal` kai flago nėra.
