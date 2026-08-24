# CURRENT VAUTO ROADMAP STATE

Read-only inventory from repository evidence (master @ `1b5812f9`). This is inventory, not redesign.

Status legend: **CERTIFIED/CLOSED** · **IMPLEMENTED BUT NOT FULLY CERTIFIED** · **PARTIAL** · **PLANNED** · **LEGACY/DEPRECATED** · **UNKNOWN/NEEDS AUDIT**

---

## Stages

| Stage | State | Evidence |
|---|---|---|
| Stage 20B.1 (audit package) | **CERTIFIED/CLOSED** | `docs/audit/stage20b1/STATUS-20B1.md` (phases A–E complete), `MANIFEST-20B1.md`, `TEST-EVIDENCE-SUMMARY.md`, `e2e/stage20b1-visual-regression.spec.ts`, `e2e/stage20b1-deal-room-evidence.spec.ts`, commit `f271b315` |
| Stage 20C (AI-native capability reconciliation) | **CERTIFIED/CLOSED** (read-only audit, zero delta) | `docs/STAGE-20C-CHECKPOINT-RECORD.md` (FULL PASS / Stage 21 GO), commit `00fe136f` (1 file changed) |
| Stage 21 / 21D (search continuity) | **IMPLEMENTED BUT NOT FULLY CERTIFIED** | `e2e/stage21d-search-continuity.spec.ts` (16 tests), commit `3bb2ed52`; no `docs/STAGE-21*` audit package |
| Stage 22A / 22A.1 / 22A.2 (vertical experience) | **CERTIFIED/CLOSED** | commit `19d8a27b`; baseline statement in `docs/STAGE-22B-MAP-EXPERIENCE.md`; `stage22a*.spec.ts` (16+10+10 tests); `docs/audit/stage22a{,1,2}/` |
| Stage 22B / 22B.1 (map experience + audit delta) | **CERTIFIED/CLOSED** | commits `5754490d`, `37c0ea78`; `docs/STAGE-22B-MAP-EXPERIENCE.md`; `stage22b-map.spec.ts` (13 tests), `stage22b1-audit-delta.spec.ts` (AUD-01..03) |
| Stage 22C (cross-vertical continuity) | **IMPLEMENTED BUT NOT FULLY CERTIFIED** | commit `b7c56e22`; `e2e/stage22c-cross-vertical.spec.ts` (11 tests); no `docs/STAGE-22C*` or `docs/audit/stage22c/` |
| Stage 23 | **PLANNED** (nothing exists) | zero matches for "stage23" in repo |
| Stage 13B (faceted filters, deep-link hydration) | **CERTIFIED + HOTFIXED** | commit `1b5812f9` restores certified deep-link invariant; `stage13b-faceted-filters.spec.ts` 11/11 |
| Stage 20A design system + emerald theme | **CERTIFIED/CLOSED** | commit `03496772`; `docs/STAGE-20A-DESIGN-SYSTEM.md` |
| Stage 14/15/16/17/18 series | **CERTIFIED/CLOSED** (historical reconstruction) | commits `64c001f2` (18.x), `46520a49` (17/17.1), `901bad4b`, `76c3ed31`, `d4b7b41a`, `368482d3` |

## Product Areas

| Area | State | Evidence |
|---|---|---|
| Design/theme implementation | **IMPLEMENTED, ACTIVE** | `src/design-system/tokens.css` (full `--ds-*`, dark via `[data-app-theme=dark]`), 12 primitives, token-driven homepage |
| MASTER LIGHT/DARK reference assets | **REFERENCE ASSETS (preserved)** | `docs/design-reference/chatgpt-visual-baseline/` (MANIFEST + 2 JPGs + SHA-256); policy forbids production import |
| AI assistant | **IMPLEMENTED, PRODUCTION-WIRED** | `VautoAgentContext.tsx`, `server/src/routes/vauto-agent.ts` (SSE), ~70 `server/src/ai/*` modules |
| Multimodal listing intelligence | **IMPLEMENTED (server), PARTIAL (client)** | `server/src/services/visual-pipeline/` (OCR/damage/background/smart-sort/vision-extract); client `ImageSearch/PhotoSearchScanOverlay/VisualSearchStrip` appear ORPHANED (no importers) |
| Chameleon / external portal simulation | **LEGACY/DEPRECATED** | `chameleon-themes.ts`, `chameleon-portal-ui.ts` marked `@deprecated`; `PortalPageChrome` → `VerticalPageChrome` |
| ZeroUi screen shell | **ACTIVE scaffolding** (not simulator) | `src/app/page.tsx` routes through `ZeroUiViewTransition`; screens: marketplace/listing_preview/business_dashboard/admin_panel |
| Current production homepage | **ACTIVE, token-driven** | `src/app/page.tsx` + `HomeAiHero` („AI padeda. Žmogus sprendžia."), `HomeCategoryGrid`, `HomeValuePropCards`, `HomeVisualFlow` |

## UNKNOWN / NEEDS AUDIT

- Stage 22C standalone audit record (missing; commit-only certification).
- Current agent-stack certification (no stage-specific audit package).
- Server vision pipeline certification.
- Orphaned visual-search client components (`ImageSearch` etc.) — unused or superseded.

## Notes

- The 20A–22C series are "checkpoint/recovery" commits on master (single active chain). `audit/stage16-security-ops` branch exists but is behind.
- Home hero message currently differs from the approved MASTER reference („Pasakyk, ko nori…" absent from `src/`); see `docs/audit/VAUTO-MASTER-THEME-GAP.md`.
