/**
 * Smoke checks for Cloudinary public_id parsing + ConfirmDialog theme tokens.
 * Run: node scripts/test-listing-delete-ux.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "server", "package.json"));

// Prefer compiled JS if present; otherwise transpile-free inline copy of the parser.
async function loadParser() {
  try {
    const mod = await import(
      path.join(root, "server", "dist", "ai", "cloudinary.js").replace(/\\/g, "/")
    );
    return mod.cloudinaryPublicIdFromUrl;
  } catch {
    // Inline mirror of server/src/ai/cloudinary.ts helper for pre-build runs
    return function cloudinaryPublicIdFromUrl(url) {
      const raw = String(url ?? "").trim();
      if (!raw || !/res\.cloudinary\.com/i.test(raw)) return null;
      try {
        const pathname = new URL(raw).pathname;
        const parts = pathname.split("/").filter(Boolean);
        const uploadIdx = parts.indexOf("upload");
        if (uploadIdx < 0) return null;
        let rest = parts.slice(uploadIdx + 1);
        while (rest.length > 0) {
          const seg = rest[0];
          if (/^v\d+$/.test(seg)) {
            rest = rest.slice(1);
            break;
          }
          if (seg.includes(",") || /^[a-z]_/.test(seg)) {
            rest = rest.slice(1);
            continue;
          }
          break;
        }
        if (!rest.length) return null;
        const withExt = rest.join("/");
        return withExt.replace(/\.[a-zA-Z0-9]+$/, "") || null;
      } catch {
        return null;
      }
    };
  }
}

const confirmSrc = readFileSync(
  path.join(root, "src", "components", "ui", "ConfirmDialog.tsx"),
  "utf8"
);
const manoSrc = readFileSync(
  path.join(root, "src", "components", "dashboard", "ManoSkelbimaiDashboard.tsx"),
  "utf8"
);
const apiSrc = readFileSync(
  path.join(root, "server", "src", "routes", "api.ts"),
  "utf8"
);

assert.ok(
  !confirmSrc.includes("bg-[#1a1f2e]"),
  "ConfirmDialog must not hardcode dark panel bg"
);
assert.ok(
  confirmSrc.includes("var(--vauto-card-bg)"),
  "ConfirmDialog must use theme card token"
);
assert.ok(
  confirmSrc.includes('variant === "danger"'),
  "ConfirmDialog must support danger variant"
);

assert.ok(manoSrc.includes("EyeOff"), "Hide action must use EyeOff");
assert.ok(manoSrc.includes("Ištrinti visam laikui"), "Permanent delete CTA required");
assert.ok(
  manoSrc.includes("variant: \"danger\""),
  "Permanent delete confirm must be danger"
);
assert.ok(
  /Trash2[\s\S]*Ištrinti visam laikui/.test(manoSrc) ||
    /Ištrinti visam laikui[\s\S]*Trash2/.test(manoSrc),
  "Trash icon reserved for permanent delete"
);

assert.ok(
  apiSrc.includes('"/listings/:id/hide"'),
  "Soft-hide route POST /listings/:id/hide required"
);
assert.ok(
  apiSrc.includes("permanentlyDeleteListing"),
  "DELETE must call permanentlyDeleteListing"
);

const cloudinaryPublicIdFromUrl = await loadParser();
assert.equal(
  cloudinaryPublicIdFromUrl(
    "https://res.cloudinary.com/dhbrljo8v/image/upload/v1785776907/vauto/system/listing-placeholder.png"
  ),
  "vauto/system/listing-placeholder"
);
assert.equal(
  cloudinaryPublicIdFromUrl(
    "https://res.cloudinary.com/demo/image/upload/c_fill,w_200/v123/vauto/listings/abc.jpg"
  ),
  "vauto/listings/abc"
);
assert.equal(
  cloudinaryPublicIdFromUrl("https://example.com/photo.jpg"),
  null
);

console.log("[test-listing-delete-ux] OK");
void require;
