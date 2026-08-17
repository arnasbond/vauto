# Stage 15R.1 — Enterprise E2E release-blocker remediation

**Cursor status:** recorded in `vauto-15r1-delta.zip` after GitHub CI.

Production was **not** touched. PR #9 was **not** merged. Stage 16 was **not** started. Force-push / force-deploy were **not** used. Stage 10–14 product semantics were **not** changed.

DEP0190 (`spawn` + `shell: true` in the local gate runner) is **not** a Stage 15 blocker. Register as later security/tech-debt.

---

## Classification (before any product change)

GitHub CI `32041437802` failed three enterprise tests with `locator.click` + 120s test timeout. The click targets were:

| Test | Line | Locator |
| --- | --- | --- |
| checkout-promote | 25 | `getByRole("button", { name: /Iškelti/i })` |
| listing-lifecycle | 120 | `getByRole("link", { name: /Peržiūrėti skelbimą/i })` |
| vision-form-assertions | 110 | same `Peržiūrėti skelbimą` link |

Sibling tests on the **same** `/mano-skelbimai/` page that click **Redaguoti** passed in <2s. This is not CI slowness.

Certified Stage 14 UI (`ManoSkelbimaiDashboard` → `ListingManagementCard`):

- Primary CTA is **Redaguoti**. There is **no** `Iškelti` button and **no** `Peržiūrėti skelbimą` link.
- Cover image is a `Link` whose accessible name is the listing title (`alt`).
- Listing detail owner chrome is **Savininko režimas** (`aria-label` + badge), not `Savininko Valdymas`.
- Promote lives on listing detail: `OwnerListingPromote` button **Iškelti skelbimą** → `SmartPromoteModal`.

**Verdict: stale/brittle E2E locators vs frozen Stage 14 product. Not a product regression. Timeouts were not increased.**

---

## Test-only patch

`openOwnedListingFromDashboard` clicks the cover link, then asserts `Savininko režimas`. Checkout then clicks **Iškelti skelbimą**. Detail-edit tests then click **Redaguoti**.

---

## Local proof

- 3 previously failing files: **6 passed**
- Full `e2e-enterprise`: **18 passed**
- 11F.5 real PostgreSQL: **394 / 0 / 0**
- Stage 12A/12B/13B/13C: **38 passed** (gate TAP `pass=0` is parser-only)

---

## GitHub CI / SHA

Recorded in zip `STATUS.txt` / `MANIFEST.txt`. Do not merge. Do not repeat Stage 15 until independent audit.
