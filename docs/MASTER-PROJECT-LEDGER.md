# MASTER PROJECT LEDGER — VAUTO

> **Purpose:** this ledger records **verified project state**, not aspirations.
> It is the reference for future agents to distinguish completed infrastructure from complete AI maturity,
> and to prevent re-inventing stage order or overriding frozen boundaries.

## Metadata

- **Last verified date:** 2026-09-07
- **Verified master SHA:** `e9334af516d3e9619a36300cbd7a2d115bdfe38c`
- **Production frontend:** https://www.vauto.lt (Vercel Production, deployed from the verified SHA)
- **Production API:** https://vauto-api.onrender.com (Render; `/api/health.commitSha` reports the verified SHA)
- **Stage 11 fingerprint:** SAME 89 / CHANGED 0 / MISSING 0
- **Classification legend:** COMPLETE · COMPLETE WITH DEBT · PARTIAL · SUPERSEDED · UNVERIFIED · NOT STARTED

## FROZEN MILESTONE — E2.8 AI Semantic Authority & Final UX/Query Hardening

- **Status:** **PRODUCTION FULL PASS — FROZEN**
- **Certified HEAD:** `e9334af516d3e9619a36300cbd7a2d115bdfe38c`
- **Closure evidence (production-verified):**
  - discovery vs execution authority boundary enforced;
  - advisory / `context_question` never initiates a catalog search;
  - META/dialog questions (e.g. `Ką tu gali?`) never initiate a search;
  - wanted registration is a first-class capability — never an implicit search;
  - explicit search / bare-browse directives retain search authority;
  - polite Lithuanian directive/control language no longer leaks into the semantic product query;
  - legitimate advisory replies are no longer suppressed by frontend fallback heuristics;
  - `type:"none"` preserves prior search state as continuity while the advisory reply stays visible;
  - conditional-wanted was **NOT** implemented (deferred);
  - the E2.8 authority model was **NOT** widened;
  - Stage 11 fingerprint `89 SAME / 0 CHANGED / 0 MISSING`;
  - CI FULL PASS (build + api-integration + e2e);
  - Render / Vercel / Android automatic workflows PASS;
  - production deployment via the existing automatic workflow;
  - ENV / DB / migrations unchanged.
- **Do NOT re-run or "improve" E2.8** unless a newly reproduced regression proves a defect.

## AI maturity hierarchy (post-E2.8)

`AI Assistant Behavioral Resilience & Autonomy` is the **broader** mandatory AI-maturity block. Its first concrete implementation boundary after E2.8 is the **Universal Deterministic Cross-Vertical Fact Core** (NEXT IMPLEMENTATION GATE below). Completing the Fact Core does **not** by itself complete Behavioral Resilience — the remaining resilience obligations (prompt stacking / conflicting instructions, compact-vs-full policy drift, client/server trimming divergence, context overload, tool/capability routing, AI provider/down observability + graceful degradation, recovery, uncertainty/abstention, AI grounding / epistemic authority, Human-in-the-Loop, inert/disconnected safety-vision paths) stay open on the roadmap.

> Recorded for later AI-maturity work (do NOT fix now): an advisory response may state current-market facts (e.g. "šiuo metu neturime Kia Sportage…") without executing a catalog lookup. This is an **AI grounding / epistemic-authority** item, not a defect in the E2.8 authority boundary.

## North Star (unchanged — record only)

This ledger does **not** change product direction. The governing principles remain (see `docs/VAUTO-NORTH-STAR.md`, `docs/VAUTO-PROJECT-CONSTITUTION.md`, `docs/VAUTO-EXECUTION-CONTRACT.md`):

- "Pasakyk arba parodyk, ko nori. VAUTO padės padaryti visa kita."
- AI padeda. Žmogus sprendžia.
- AI DOWN != VAUTO DOWN.
- One universal marketplace platform; verticals differ by data/capabilities, not by separate product architectures or themes.
- Natural language + photos/documents + classic UI converge into the canonical marketplace core.
- AI must not silently invent or choose a conflicting material fact; exactly one highest-value question instead of a long interview.
- Consequential actions require human control/confirmation.
- Stage 11/11J remains frozen.
- MASTER LIGHT/DARK is the final visual source of truth.

## Ledger

### 1. Repository/recovery closure — **COMPLETE**
- Evidence: single canonical repo; linear master fast-forward history (`…650a9f70 → 3125b05d`); recovery branches preserved (`recovery/*`, `release/stage15r*`); 16 merged PRs.
- Remaining debt: one OPEN docs-only PR (#3, Cursor environment).
- Next dependency: none.

### 2. Standalone canonical repository — **COMPLETE**
- Evidence: client (`src/`), server (`server/`), shared contracts (`shared/`) in one repo; master builds and deploys both planes.
- Debt: duplicated mirror contracts (see debt register).
- Next dependency: none.

### 3. Controlled Production workflow — **COMPLETE**
- Evidence: master CI + api-integration + Deploy-to-Vercel + Deploy-Render + Android build workflows all green on the verified SHA; Production health green; schema current / 0 pending.
- Debt: no automated rollback drill (see debt register).
- Next dependency: none.

### 4. Stage 22A.2 responsive/device continuity — **COMPLETE WITH DEBT**
- Evidence: `e2e/stage22a-responsive-evidence.spec.ts`, `stage22a1-mobile-geometry`, `stage22a2-webkit-iphone`, `stage22a2-live-viewport` — green.
- Debt: foldable = viewport tolerance + native feed cap only; no split-pane design.

### 5. MASTER LIGHT/DARK closure — **COMPLETE WITH DEBT**
- Evidence: `master-wave1-theme-semantics.spec.ts` (16 tests) green; runtime theme authority `src/lib/app-theme.ts`; zero-FOUC bootstrap.
- Debt: three CSS token families + hardcoded-hex dark band-aids; parity test is a home-page DOM fingerprint.

### 6. Stage 11 protection — **COMPLETE**
- Evidence: `docs/checkpoints/stage11-frozen-baseline.txt` + `scripts/verify-stage11-fingerprint.mjs`; 89/0/0 verified at every closure.

### 7. Phase 1 — consequential-action confirmation boundary — **COMPLETE**
- PR #11; `server/src/ai/confirmation/*`, `routes/consequential-actions*`; ~90-test suite (policy/PG store/atomic ops/fencing/recovery/chat boundary).

### 8. Phase 2A — chat-level human confirmation control — **COMPLETE**
- PR #12; client gates in `VautoAgentContext`; `agent-quick-reply-bare-confirmation.test.ts`, `confirm-dialog-queue.test.ts`.

### 9. Phase 2B — single highest-value next-question policy — **COMPLETE**
- PR #13; deterministic `sell/next-question-policy.ts`; unit + live-integration tests.

### 10. Phase 2C — server-owned VIN confirmation — **COMPLETE**
- PR #14; HMAC receipt/challenge/scope (`vehicle/vin-confirmation.ts`, `vin-challenge.ts`), HTTP boundary, model-visible redaction; Production-verified.

### 11. Phase 2D — trusted draft-state round-trip — **COMPLETE**
- PR #15; 12 draft-state keys preserved through the client sanitizer; persistence strip + LLM redaction extended; round-trip suite imports the REAL client sanitizer; Production-verified.

### 12. Cross-vertical vehicle-extraction containment — **COMPLETE**
- PR #16 (merge OID `3125b05d…`); vehicle spec extraction/VIN/year/title/description gated to transport categories via the canonical `isVehicleFamilyCategory` predicate; 14-test cross-vertical regression suite; Production-verified.

### 13. Universal marketplace/search/publish plumbing — **COMPLETE WITH DEBT**
- Evidence: canonical 13A schemas for the currently registered 13A verticals, 13B faceted search, one shared publish pipeline, category-branched validation and a deal-room capability registry are live in Production.
- Debt: **clothing has no 13A vertical** (enforced test invariant); electronics/services/home client facet chips incomplete; shared plumbing is live, but cross-vertical parity is **not** complete.

### 14. Deal Room / transaction capabilities by vertical — **COMPLETE WITH DEBT**
- TRANSPORT full; REAL_ESTATE negotiation-only; ELECTRONICS offer+payment; JOBS fail-closed; SERVICES **declared but untested**; clothing fail-closed by design.
- Debt: services deal-room tests; jobs applications are localStorage-mocked (debt register).

### 15. Business capabilities — **PARTIAL**
- Live: service-lead tools, metrics, boost/monetization. Docs-only: Business Cockpit (`docs/UI-BUSINESS-7.0.md`).

### 16. AI behavioral resilience — **PARTIAL**
- **Open proven defects:** raw base64 image block injected as prompt text (`vauto-agent.ts:1831-1840`); guest `myListingsSummary` unsanitized prompt-injection channel; prompt stacking with contradictory question-count and price-timing instructions.
- **Missing tests:** compact-vs-full instruction drift; client/server trimming divergence; AI-down fallback chain; supervisor tool routing.
- **Architectural risks:** unbounded per-turn context (sellerMetrics/behavior payloads uncapped); client/server trim policy divergence (8 vs 32 messages, assistant retention); safety-shield vision path inert with dev fail-open.

### 17. Cross-vertical deterministic fact core — **PARTIAL**
- Live: VIN + year conflict state machines, one-question policy, vehicle extraction (now correctly gated). Generic extraction exists across multiple verticals.
- Missing: deterministic provenance/confidence/conflict/uncertainty controls for non-transport verticals — non-vehicle conflict producers (`roomsConflict`/`workTypeConflict` are question strings with zero producers), non-vehicle uncertainty tiers, per-field provenance in the live draft. Other verticals remain partial and asymmetric.

### 18. Multimodal listing intelligence — **PARTIAL / LIVE WITH ASYMMETRY**
- Live: photos+text+documents into the agent path; vehicles strongest; clothing (wardrobe + barcode) live; generic two-pass for others.
- Disconnected: `shared/listing-intelligence` + `/api/stage10` (zero client callers).

### 19. Trust/safety — **PARTIAL**
- Live: text safety gate, Gemini safety settings, red-team 301/301, consequential-action fencing.
- Inert: vision anti-fraud shield (disconnected consumers; dev fail-open).

### 20. Performance/media — **UNVERIFIED**
- No perf/LCP/image-budget gates; draft media held as data-URLs; no virtualization; aspect ratios untested conventions.

### 21. MASTER AI UX/UI integration — **PARTIAL**
- Live: AI command bar, interpretation chips, price signals, chat strip + PrePublish card, twin panel.
- Gaps: deterministic parsing branded “VAUTO suprato”; deal-room copilot promised in onboarding but absent; manual publish is a hidden secondary path.

### 22. Remaining Stage 22 vertical experience — **PARTIAL**
- Vertical presentation contracts + cross-vertical e2e exist; per-vertical detail layout and aspect-ratio locks absent.

### 23. Stage 23 Production maturity — **PARTIAL**
- CI/deploy/health/schema checks solid; observability budgets, rollback drill and release-gate KPI automation missing.

### 24. Repository-wide red-team audit — **NOT STARTED**
- Stage 10I red-team (300+) covers the AI/API layer; a repository-wide audit incl. the full vertical matrix is pending.

### 25. Final release gate — **NOT STARTED**
- `docs/STAGE-14-PRODUCTION-RELEASE-GATE.md` defines the gate; it has not been executed against the current ledger.

### 26. Soft launch — **NOT STARTED**
- The current public Production is a **controlled live-beta / verification environment** (real marketplace traffic used for hardening and verification closures).
- Formal Soft Launch — as defined by the project plan, with bounded real-user cohorts and structured feedback/telemetry review — remains **NOT STARTED**.

### 27. Public launch — **NOT STARTED**

## Current AI maturity statement

- **Safety and human-control foundation: COMPLETE** (Phases 1, 2A, 2B, 2C, 2D, cross-vertical containment — all merged, CI-green, Production-verified).
- **AI semantic authority (E2.8): COMPLETE — FROZEN** (discovery/execution/wanted/advisory boundary; positive search authority; advisory/search presentation).
- **Atlas-level universal assistant: PARTIAL.**
- **Cross-vertical fact/provenance/confidence/conflict core: PARTIAL** — generic extraction exists across multiple verticals; **deterministic provenance/confidence/conflict/uncertainty controls are materially complete only for transport**; other verticals remain partial and asymmetric.
- **AI Behavioral Resilience & Autonomy: PARTIAL** — the E2.8 authority boundary and the audited sanitization fixes are complete; the remaining resilience obligations (prompt stacking, compact/full drift, trim divergence, context overload, tool routing, AI-down observability, recovery, uncertainty, Human-in-the-Loop, inert safety-vision paths) remain open.
- **Multimodal input plumbing: PARTIAL / LIVE WITH ASYMMETRY.**
- **Full behavioral/adversarial audit: NOT COMPLETE.**

The AI maturity program as a whole is **NOT COMPLETE**.

## NEXT IMPLEMENTATION GATE — Universal Deterministic Cross-Vertical Fact Core

- **Status:** **PLANNED** (audited scope; NOT yet implemented).
- **Purpose:** remove the transport-first deterministic fact asymmetry and establish one shared conflict/fact-resolution boundary across the core VAUTO verticals.
- **Vertical matrix:** Transport · Real Estate · Electronics · Clothing · Services · Jobs · General/Other (where the canonical registry treats it as a distinct capability path).
- **Primary invariant:** a **NON-VEHICLE draft must NEVER be mutated by vehicle-spec extraction.**
- **Conflict lifecycle:** conflict detected → exactly one highest-value clarification → user resolves A/B (or canonical equivalent) → resolution applied deterministically → required transient marker survives the necessary client state round-trip → marker never persists as listing data → marker never becomes model-visible context.
- **Audited minimal manifest (planned, NOT implemented):**
  - `server/src/ai/vauto-agent.ts` — category-gate the vehicle spec-patch branch; generalize field conflict resolution;
  - `server/src/ai/sell/next-question-policy.ts` — activate cross-vertical conflict producers (RE/electronics/etc.);
  - `src/lib/listing-attribute-isolation.ts` — transient conflict-marker handling;
  - `server/src/shared/listing-attributes-sanitize.ts` (+ canonical shared mirror) — strip ephemeral markers before persistence;
  - `server/src/shared/llm-context-slice.ts` — model-hidden marker enforcement;
  - `shared/vin-review.ts` (or current canonical ingress boundary) — prevent inappropriate marker/model leakage;
  - neutralize remaining vehicle-first couplings only where directly required.

## Technical-debt register (record only — do not fix in the documentation PR)

1. **North Star was previously fragmented** — doctrine lived in prompts, phase headers and task briefs; now consolidated here.
2. **`server/tsconfig.json` test-seam aliases** (`@/*`, `@vauto/shared/*`) — accepted Phase 2D debt; no server source imports them; server→client coupling must not expand.
3. **Disconnected provenance/intelligence layer** — `shared/listing-intelligence` + `sell/field-merge.ts` + `/api/stage10` with zero client callers.
4. **Prompt stacking + contradictory question policies** — one-question doctrine vs `suggestedQuestions` (up to 4), conflicting price-timing rules, dead `buildCreateListingDraftFollowUp`.
5. **Raw base64/context-budget concerns** — raw image block in prompt text; no aggregate per-turn context budget; `sellerMetrics`/behavior payloads uncapped.
6. **Compact/full prompt drift** — compact slice drops safety/workflow/contact rules; untested.
7. **Client/server trimming divergence** — 8 vs 32 messages; assistant-message retention; document caps 50k vs 20k.
8. **Vehicle-biased memory/vision/manual fallbacks still remaining** — universal “Volvo V70” memory default; car vision rules in the universal extractor; vehicle-forcing branch in the client manual-fallback draft (server gate fixed; these await their own scoped fixes).
9. **Mocked job applications** — localStorage + demo seeds; no server persistence.
10. **Untested services Deal Room** — capabilities declared, no dedicated tests.
11. **Clothing vertical/schema asymmetry** — no 13A vertical (enforced invariant).
12. **MASTER theme token fragmentation** — three CSS families + hex band-aids.
13. **Performance/rollback/observability gaps** — no perf budgets, no automated rollback drill.

## Next sequence (post-E2.8 — authoritative order)

1. **E2.8 — PRODUCTION FULL PASS / FROZEN** (`e9334af5`).
2. **Universal Deterministic Cross-Vertical Fact Core** (NEXT IMPLEMENTATION GATE).
3. Independent audit / FULL PASS for the Fact Core.
4. **Remaining AI Behavioral Resilience & Autonomy** (prompt stacking, compact/full drift, trim divergence, context overload, tool routing, AI-down observability + graceful degradation, recovery, uncertainty/abstention, Human-in-the-Loop, inert safety-vision paths).
5. Full universal provenance/confidence/conflict maturity (F2).
6. Multimodal Listing Intelligence completion (F3).
7. "VAUTO mane suprato" AI UX integration (F4).
8. Cross-vertical product completion (F5).
9. Business capabilities (F6).
10. MASTER LIGHT/DARK final convergence (F7).
11. Performance/media budgets (F8).
12. Trust/security/production maturity (F9).
13. Repository-wide final audit (F10).
14. GO/NO-GO (F11).
15. Controlled soft launch (F12).
16. Public launch (F13).

> The forward AI-maturity order above (F2–F13) is a **semantic sequence**, not new duplicate stage numbers: the existing numbered ledger items (1–27) and the release-readiness F8–F12 series are preserved. Do **not** assign a new Phase number until this Ledger is independently accepted.

## Deferred (explicitly later — NOT part of the Fact Core gate)

- Full provenance/confidence wiring (`shared/listing-intelligence` ↔ live draft).
- Complete multimodal listing intelligence; vision pipeline expansion.
- Prompt consolidation beyond the Fact Core's direct need.
- Clothing 13A/schema architecture work.
- Job-application real persistence.
- Services Deal Room completion.
- MASTER LIGHT/DARK final convergence.
- Performance/media budgets.
- Repository dead-code cleanup.
- Final trust/security maturity.
- Release gate; soft launch; public launch.

## Historical branches & artifacts (record only)

- `test/universal-fact-evidence-contract-final` = merged/certified historical evidence.
- `test/universal-fact-evidence-contract` = superseded earlier iteration.
- Other `recovery/*`, `release/stage15r*`, `feature/*`, `fix/*` historical branches: **do NOT resurrect without owner/auditor sign-off** — do not merge, delete, rebase, or check out for work.
- Existing untracked audit/probe/artifact files (`audit-output/`, `docs/audit/**`, `docs/ui-stage18/`, `server/audit-output/`, `server/src/agent-core/**/e1-probe.ts`, `server/src/golden/probe.ts`) are left untouched — record only.
