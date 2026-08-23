# ETAPAS 17A — VAUTO CURRENT UI INVENTORY

Certified base: `d4b7b41aed46f738de7411872100c3da45165b90`
Date: 2026-08-19
Scope: read-only frontend audit. Per Stage 17 rule **"Kol auditas nebaigtas — nieko masiškai neperrašyk"**, no mass rewrite was performed. This document is the audit deliverable.

---

## 1. Summary of the architecture

VAUTO has **two parallel token systems** and a full, token-clean **Design System 2.0** package that is only partially adopted:

| Layer | Location | Status |
|---|---|---|
| **Global CSS + legacy theme tokens** | `src/app/globals.css` (+ imports `../design-system/tokens.css`, `../design-system/polish.css`) | 4 app themes + 7 portal skins live here |
| **DS 2.0 semantic tokens (`--ds-*`)** | `src/design-system/tokens.css` | Light + Dark, token-clean, reduced-motion aware → **this is the Stage 17 "single source of truth" candidate** |
| **DS 2.0 primitives** | `src/design-system/primitives/*.tsx` | Button, IconButton, Card, Input/Textarea/SearchInput/Select/Checkbox/Radio/Switch, Badge, Tabs, Alert, Tooltip, DropdownMenu, Modal, Skeleton, EmptyState, PageHeader, SectionHeader, StatCard, AiInsightCard |
| **Content wrapper system** | `VautoAdaptiveLayout.tsx` / `PageContainer` / `DesktopShell` (`max-w-[var(--anonser-desktop-max,80rem)]`) | Exists for desktop; mobile `max-w` |

Tailwind **v4** (no `tailwind.config.*`; only `postcss.config.mjs` + `@import "tailwindcss"`). Colors/radius are wired via `@theme inline` in `globals.css` (lines 251–267).

---

## 2. Theme systems found (Stage 17B violation)

`src/app/globals.css` defines the following user-selectable app themes:

| Theme token | Name | Nature | Violates 17B |
|---|---|---|---|
| `:root` (default base) | "Brand Blue" light | Light | — (base) |
| `[data-app-theme="vauto-original"]` | "VAUTO Originali" | Light, hardcoded `#f7f8fb/#fff/#1b4dff` | **Yes — a third "original" theme** |
| `[data-app-theme="dark"]` | Dark | Dark | OK (DARK) |
| `[data-app-theme="light-minimal"]` | "Šviesioji minimali" | Light, hardcoded `#fafafa/#111` | **Yes — a third light theme** |

Additionally the light portal forces light chrome:
- `.vauto-desktop-portal` (globals.css 105–162) — pins desktop to light.
- `body.chameleon-*` **portal skins** for the external cross-portal listing flow: `autoplius`, `skelbiu`, `aruodas`, `cvbankas`, `paslaugos`, `wardrobe` (globals.css 1029–1255) — ~150 hardcoded hexes, bypass all tokens, defined in `src/lib/chameleon-themes.ts:50–286`. These are feature-specific (Dross/seller flow) and are **not** offered as user app themes.

The theme registry (`src/lib/app-theme.ts`) model:
```ts
export type AppThemeId = "vauto-original" | "dark" | "light-minimal";
export const APP_THEMES: AppThemeMeta[] = [ …3 items… ];
export const DEFAULT_APP_THEME: AppThemeId = "vauto-original";
```

`data-app-theme="vauto-original"` is **hardcoded as the default** in `src/app/layout.tsx:93`.

Theme runtime:
- Provider: `src/context/AppThemeContext.tsx` → sets `document.documentElement.dataset.appTheme`.
- Picker UI: `src/components/settings/ThemeSettingsCard.tsx` (Profile → "Programėlės tema") — **3 choices** + `ThemeSwatchStrip`.
- Persistence: `loadAppTheme/saveAppTheme` in `src/lib/storage.ts`.

### Stage 17B target
- Reduce to exactly **LIGHT + DARK**.
- Remove `vauto-original` and `light-minimal` as selectable themes; collapse them into a single canonical **light** (aliased to the current brand light default).
- Keep `chameleon-*` skins as an internal seller-flow feature (not user-selectable app themes) OR tokenize them — decision TBD with user (see Findings 3).

---

## 3. Design tokens (Stage 17B)

The desired **semantic token names from Stage 17** (`--bg-primary`, `--text-primary`, `--surface`, `--accent`, `--success`, `--shadow-soft`, `--radius-card`, …) most closely map to the already-built `--ds-*` scale in `src/design-system/tokens.css`:

| Stage 17 semantic | Already exists as | Current value (light) | In dark |
|---|---|---|---|
| `--bg-primary` | `--ds-surface-page` | `#f7f8fb` | `#0b1220` |
| `--bg-secondary` / `--surface` | `--ds-surface-card` | `#ffffff` | `#121a2b` |
| `--surface-elevated` | `--ds-surface-elevated` | `#ffffff` | `#182235` |
| `--surface-muted` | `--ds-surface-muted` | `#f1f3f6` | `#0f172a` |
| `--text-primary` | `--ds-text-primary` | `#0b1220` | `#f4f6fb` |
| `--text-secondary` | `--ds-text-secondary` | `#3a4558` | `#c5ccd9` |
| `--text-muted` | `--ds-text-muted` | `#4f596c` | `#9aa3b5` |
| `--border-subtle` | `--ds-border-subtle` | `#e6e9f0` | `rgba(244,246,251,.1)` |
| `--accent` | `--ds-brand` | `#1b4dff` | `#5b8aff` |
| `--success` | `--ds-success` | `#059669` | `#34d399` |
| `--warning` | `--ds-warning` | `#d97706` | `#fbbf24` |
| `--danger` | `--ds-danger` | `#e11d48` | `#fb7185` |
| `--shadow-soft` | `--ds-shadow-s*` | 4-tier | 4-tier |
| `--radius-card` | `--ds-radius-card` | `1rem` | `1rem` |

The `--vauto-*` / `--anonser-*` families in `globals.css` are largely **aliases** (e.g. `--vauto-bg: var(--background)`). They add a second source of truth and hardcoded fallbacks.

### Findings to resolve in 17B
- **F-01 (theme count)** — 3 selectable themes must collapse to 2 (LIGHT/DARK).
- **F-02 (two token systems)** — `--vauto-*`/`--anonser-*` vs `--ds-*`. Decide whether to remap `--vauto-*` aliases onto `--ds-*` (recommended) or keep them as thin aliases.
- **F-03 (accent color)** — current brand accent is **blue** (`#1b4dff`). Stage 17 allows emerald/neon-green accent used sparingly. This is a brand decision (see open question).
- **F-04 (chameleon skins)** — ~150 hex values bypass tokens. Tokenize in Stage 17 only if safe; otherwise keep feature-scoped.

---

## 4. Core UI component inventory (17A table)

Legend for "issues": **HEX** = hardcoded hex color; **STYLE** = inline `style={}`; **PX** = arbitrary `[...px]` classes; **DUP** = visually duplicated; **DTL** = desktop-only layout; **OVF** = horizontal-overflow risk.

| Component | Current styling source | Duplicated / hardcoded values | Issues | Stage 17 target |
|---|---|---|---|---|
| Global tokens / theme | `globals.css` :root + 3 themes + chameleon | `--background #f7f8fb`, `--primary #1b4dff`, per-theme hex | HEX, 3rd-theme (F-01) | `--ds-*` single source, LIGHT+DARK |
| Tailwind theme wiring | `globals.css` `@theme inline` (251–267) | — | — | keep, point to `--ds-*` |
| Typography | `--font-geist-*`, `--font-outfit` in `layout.tsx`; `--ds-text-*` scale exists | `text-\[10px\]`=390, `text-\[13px\]`, etc. | PX, DUP | `--ds-text-*` scale |
| Spacing | `--ds-space-*` (4px grid) | `--vauto-space-*` parallel set | DUP | consolidate on `--ds-space-*`/Tailwind scale |
| Radius | `--ds-radius-*`; `--radius-lg: var(--radius)` | `rounded-xl`, `rounded-2xl`, `rounded-\[…\]` ad hoc | DUP | `--ds-radius-control/card/panel` |
| Shadows | `--ds-shadow-*`; `--vauto-elev-*` | `card-shadow`, inline `shadow` strings | DUP | `--ds-shadow-*` |
| Card | `src/design-system/primitives/Card.tsx` (DS); legacy `vauto-panel`, `listing-card` | `vauto-glass-card`, `vauto-dashboard-card`, `vauto-onboarding-card` | DUP | DS `Card` + drop legacy shells |
| Button | DS `Button.tsx` (6 variants, loading, focus) | `vauto-btn-primary/secondary`, `vauto-btn-danger`, `listing-card-btn--*`, `vauto-auth-submit-btn`, `vauto-segmented-btn` | DUP | DS `Button` |
| Input / Textarea / Select / Checkbox / Radio / Switch | DS `FormControls.tsx` | `vauto-support-input`, `vauto-admin-input`, `profile-editable-input`, `listing-form-input`, hardcoded focus/border hex | DUP, HEX | DS `FormControls` |
| Chip / Pill | DS (Badge/Tabs) + `marketplace-filter-chip`, `vauto-segmented` | `vauto-flux-chip-on`, `agent-quick-reply-chip` | DUP | DS `Badge`/`Tabs` |
| Modal | DS `Overlay.tsx` `Modal` (focus trap, ESC, aria) | `vauto-light-modal` (hardcoded `#fff`), `vauto-auth-modal`, `pre-publish-modal-panel` | HEX, DUP | DS `Modal` |
| Drawer / sheet | No unified DS Drawer — bespoke overlap pattern | multiple bespoke drawer/sheet components | DUP | add DS `Drawer` (17D) |
| Tooltip | DS `Overlay.tsx` `Tooltip` | bespoke title/help tooltips | DUP | DS `Tooltip` |
| Badge | DS `Badge.tsx` (tones) | `vauto-badge-*` (success/muted/warning/info), `vauto-demo-badge` | DUP | DS `Badge` |
| Empty state | DS `Feedback.tsx` `EmptyState` | bespoke empty states | DUP | DS `EmptyState` |
| Skeleton | DS `Feedback.tsx` `Skeleton` (+ `ListingCardSkeleton`) | bespoke shimmer classes | DUP | DS `Skeleton` |
| Navbar / header | `src/app/layout.tsx`, `src/components/app-shell/AppHeader.tsx` (DS-aware) | header chrome classes; `--anonser-header-*` tokens | DUP, DTL | DS header |
| Footer | bespoke `Footer` component | inline hex, hardcoded px | HEX, PX | DS-consistent footer |
| Mobile bottom nav | `vauto-bottom-nav`, `vauto-flux-nav` | dark overlay `rgba(11,15,23,.85)`, hardcoded | HEX | DS bottom nav |
| Sidebar | `src/components/app-shell/AppSidebar.tsx` (DS-aware) | `--anonser-sidebar-width: 17.5rem` | DTL | persistent sidebar desktop; drawer mobile |
| Listing card shell | `src/components/marketplace/ListingCard.tsx` (DS-aware) + `listing-card` legacy | `listing-card`, `listing-card-title/meta/row`, tier classes | DUP | DS `ListingCard` shell |
| Search UI (hero) | `HomeAiHero` (DS-aware) + `home-ai-hero-search`, `home-ai-glass-*` | `#6366f1` AI indigo, hex glass | HEX | DS hero |
| Search results / filters | `MarketplaceFilterBar`, `FacetFilterPanel` (DS-aware), `marketplace-filter-*` classes | `marketplace-filter-chip`, panel hex | DUP | DS filter surfaces |
| Category cards | e.g. `discover`/`fashion` category grids (bespoke) | hardcoded grid / hex | REVISIT | DS card + tokenized |
| Deal Room UI | `src/components/deal-room/*` (DS-aware: `UniversalDealRoomPanel`, `DealRoomPage`, `VerifiedReviewForm`) | — | — | DS-consistent (mostly done) |
| Auth / onboarding | `vauto-auth-*`, `vauto-onboarding-card`, `chameleon` | many hex (e.g. `#111827` Apple, `#ffc107` wizard) | HEX, DUP | DS treatment |

> **Deal Room note:** Deal Room is the most DS-consistent surface already (`src/components/deal-room/` uses `@/design-system`). The biggest legacy debt sits in the seller/listing wizard (`listing-wizard-overlay`, `chameleon-*`, `nt-wizard-*`), auth overlays, and the bottom mobile nav.

---

## 5. Hardcoded-value survey (ripgrep, `src/`)

| Pattern | Count | Notes |
|---|---|---|
| `bg-\[#…\]` | 125 | arbitrary hex backgrounds |
| `text-\[#…\]` | 178 | arbitrary hex text (incl. price/status colors) |
| `border-\[#…\]` | 97 | arbitrary hex borders |
| `style={{` | 99 | inline styles (~73% are price color injection) |
| `#0f172a` | 41 | blue-slate constant |
| `#ffffff` | 79 | white constant |
| `rgba(` | 177 | shadow/overlay rgba |
| `text-\[…px\]` | 390 | hardcoded font-size px |
| any `[…px]` arbitrary class | **425** | text sizes are the largest share |

These bypass the token layer and will migrate onto `--ds-*` over Stage 17's component pass.

---

## 6. Layout & responsive composition (17C / 17L)

Current state:
- **Only one real CSS media query** in `globals.css`: `@media (min-width: 768px)`. Breakpoints otherwise come from Tailwind utilities (`sm:/md:/lg:/xl:`) inline in components.
- Desktop max-width exists via `VautoAdaptiveLayout`/`PageContainer`/`DesktopShell` and `--anonser-desktop-max: 80rem` (1280px) + `.vauto-adaptive-content`. Tablet/mobile gutters and grid gap are ad hoc per page.
- **Horizontal overflow (390px) risk:** fixed-width grids like `minmax(260px|280px, 1fr)` without `minmax(0, 1fr)`; several `overflow-x-auto` strips are **intentional** scrolls (should stay). No global `overflow-x: hidden` safety net on body.
- **Organic-layout gap:** desktop = mostly width-percent scaling of mobile; no distinct tablet 2-col, no mobile filter sheet, no mobile drawer replacing sidebar in every flow, no explicit 768/1024/1440/1920 designed breakpoints.

### Stage 17C / 17L target
- Define canonical breakpoints: mobile <768 · tablet 768–1024 · desktop 1440 · large ≥1920.
- Centralize page gutters (`--ds-space-*`), section spacing, and `max-width` containers in one wrapper (`VautoAdaptiveLayout` or DS `PageContainer`), remove per-page `max-w-[…]` duplication.
- Add `minmax(0, …)` where grids could overflow; guard iOS with `min-width:0`; test 390/768/1440/1920 for **horizontal scroll = 0**.
- Implement drawer↔sidebar, buttons↔compact actions, filters→sheet toggles per breakpoint (organic principle, Stage 17L).

---

## 7. Accessibility & performance posture (17H / 17I)

Already present in DS 2.0 primitives:
- `Button`: `disabled`/loading (`aria-busy`), `focus-visible` via `ds-focusable`, `active:scale`.
- `Modal` (`Overlay.tsx`): focus trap, ESC close, backdrop click close, `aria-modal`, `aria-labelledby`, returns focus on close.
- `prefers-reduced-motion`: handled for `--ds-*` durations (`tokens.css` 197–204) + a limited global `@media (prefers-reduced-motion: reduce)` block.
- Touch targets: DS `Button` uses `h-9/10` (36/40px) — **below 44px** in small size → needs 44px guard for critical mobile actions (Stage 17H).

Watching (17I): Next.js App Router, local fonts, no map SDK on homepage, no autoplay video — good. The legacy `globals.css` is large but static (no runtime JS). Hydration/LCP impact from Stage 17 must stay nil.

---

## 8. Open decisions that block 17B implementation (user input required)

Per Stage 17 rule ("Kol auditas nebaigtas — nieko masiškai neperrašyk"), the audit is complete and no mass rewrite has been done. The following brand/product decisions must be confirmed before implementing 17B–17L, because they change UX.

1. **Theme set** — confirm collapsing to exactly LIGHT + DARK, removing `vauto-original` and `light-minimal` as selectable themes. (Recommended: yes, per 17B.)
2. **Accent color** — Stage 17 says "emerald/neon-green character, used sparingly," but the current brand is **blue** (`#1b4dff`). Confirm whether Stage 17 keeps blue as the accent or shifts to emerald/neon-green.
3. **Scope of migration** — confirm that Stage 17 should wire the existing DS 2.0 into the audit's "Stage 17 target" component set (a contained pass) rather than attempt to restyle every legacy page (which would contradict "that's a later bigger UI rebuild").
