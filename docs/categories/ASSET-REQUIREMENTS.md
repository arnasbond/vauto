# F7 Premium Category Imagery — ASSET REQUIREMENTS (Atlas asset generation)

Status: **NEEDS ATLAS ASSET GENERATION** — the three illustrations below cannot
be produced by the current working environment (no photorealistic raster/3D
product render capability). The procedural flat SVG stand-ins committed on
branch `feat/f7-premium-category-imagery` are PLACEHOLDERS for wiring only and
are explicitly NON-CONFORMING (see optical-size audit).

Reference / style baseline:
`H:\OneDrive\Desktop\VAUTO-MASTERS-VISUALS\VAUTPO-MASTER-NEW UPDATE.jpg`
(owner-approved master) and the five existing photorealistic sources:
`assets/categories-source/category-{transport,real-estate,electronics,home-garden,services}.png`
(AI-rendered product-style object photography, plain studio-white background,
soft contact shadow, generic fictional designs, no third-party brand marks).

## Required deliverables (one per category)

| File (exact path) | Object |
|---|---|
| `assets/categories-source/category-clothing.png` | **Mada** — cream knit cardigan on a NATURAL WOOD hanger: clearly visible sleeves, body, hanger, buttons and a subtle knit texture. Realistic premium product photography, NOT an icon. |
| `assets/categories-source/category-jobs.png` | **Darbas** — wide, STRUCTURED dark-brown leather document portfolio in THREE-QUARTER perspective (not a flat front rectangle): clear handle, flap, stitching, brass clasp and subtle leather texture. |
| `assets/categories-source/category-other.png` | **Kita** — clearly recognizable CLOSED kraft-cardboard shipping box in THREE-QUARTER perspective: visible walls, top flaps and adhesive tape, natural kraft texture, no logos/marks. |

## Source contract (must match the five existing sources)

1. 1024×1024 PNG, object isolated on a PLAIN STUDIO-WHITE background.
2. Soft contact shadow that TOUCHES (or is immediately adjacent to) the object.
3. Object centered; no clipping; safe margins matching the existing six.
4. No text, logos, people, scene, room, green card background or gradient backdrop.
5. Readable in LIGHT and DARK card themes.
6. Optical fill ratio (non-transparent pixels after keying) must land within
   ±0.15 of the existing median (~0.45): current stand-ins measure ~0.19–0.23
   and FAIL (`node scripts/check-category-optical-size.mjs`).

## Pipeline (already wired, no code changes needed)

1. Drop the three PNGs into `assets/categories-source/`.
2. Add their names to `CATEGORY_IMAGE_FILES` in `scripts/process-category-images.mjs`
   (background flood-fill keying + feathered alpha) OR keep the direct-alpha
   triplet generator `scripts/generate-category-illustrations.mjs` (replace its
   SVG bodies with the raster sources).
3. Served triplet per category (already referenced by `CATEGORY_IMAGE_SRC`):
   - `public/images/categories/category-<name>.png` (480px)
   - `public/images/categories/category-<name>.webp` (240px)
   - `public/images/categories/category-<name>@2x.webp` (480px)

## Acceptance checks (run after generation)

- `node scripts/check-category-optical-size.mjs` → PASS (exit 0).
- `npx tsx --test src/lib/__tests__/f7-premium-imagery.test.ts` → PASS.
- `npx playwright test tests/e2e/f7-category-cards.spec.ts --project=e2e-enterprise` → PASS.
- Contact sheets (light + dark, REAL tile scale) regenerated and re-reviewed.

## Explicitly out of scope for this branch

Category semantics, names/order, filters, search, card geometry, branding,
Stage 11, payments, ledger, webhooks, AI, F6, migrations, deploy.
