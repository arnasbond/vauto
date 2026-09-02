import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LISTING_CATEGORY_IDS,
  LISTING_CATEGORY_LABELS,
  VISIBLE_CATEGORY_BY_SLUG,
  VISIBLE_CATEGORY_IDS,
  coerceListingCategoryForDb,
  listingCategoryLabel,
  visibleCategoryOptions,
} from "@vauto/shared/category-registry";
import { classifyFashionKind, FASHION_KIND_LABELS } from "@/lib/clothing-catalog";
import { getAiListingTagChips } from "@/lib/listing-dynamic-attributes";
import {
  LISTING_PLACEHOLDER_IMAGE,
  isListingPlaceholderUrl,
  resolveListingImage,
} from "@/lib/listing-image";

describe("F7 — 8 visible category parity", () => {
  it("exposes exactly 8 visible top-level categories with canonical labels", () => {
    assert.equal(VISIBLE_CATEGORY_IDS.length, 8);
    assert.deepEqual(
      VISIBLE_CATEGORY_IDS.map((id) => LISTING_CATEGORY_LABELS[id]),
      [
        "Transportas",
        "Nekilnojamas turtas",
        "Elektronika",
        "Mada",
        "Namai ir buitis",
        "Paslaugos",
        "Darbas",
        "Kita",
      ]
    );
  });

  it("keeps all canonical IDs unchanged (no competing category system)", () => {
    assert.deepEqual([...LISTING_CATEGORY_IDS].sort(), [
      "clothing",
      "electronics",
      "home",
      "jobs",
      "other",
      "real_estate",
      "rental",
      "services",
      "tools",
      "transport",
      "vehicles",
    ]);
  });

  it("clothing is user-visible as „Mada“", () => {
    assert.equal(LISTING_CATEGORY_LABELS.clothing, "Mada");
  });

  it("legacy slugs fold into the closest visible category", () => {
    assert.equal(VISIBLE_CATEGORY_BY_SLUG.transport, "vehicles");
    assert.equal(VISIBLE_CATEGORY_BY_SLUG.tools, "home");
    assert.equal(VISIBLE_CATEGORY_BY_SLUG.rental, "other");
    assert.equal(listingCategoryLabel("transport"), "Transportas");
    assert.equal(listingCategoryLabel("tools"), "Namai ir buitis");
    assert.equal(listingCategoryLabel("rental"), "Kita");
  });

  it("unknown category fails closed to other / „Kita“ (never guessed)", () => {
    assert.equal(coerceListingCategoryForDb("nežinomas objektas 123"), "other");
    assert.equal(coerceListingCategoryForDb(""), "other");
    assert.equal(listingCategoryLabel("ne_zinu_kas"), "Kita");
    assert.equal(listingCategoryLabel(undefined), "Kita");
    assert.equal(listingCategoryLabel(null), "Kita");
  });

  it("visibleCategoryOptions returns 8 deterministic picker options", () => {
    const options = visibleCategoryOptions();
    assert.equal(options.length, 8);
    assert.deepEqual(
      options.map((o) => o.label),
      [
        "Transportas",
        "Nekilnojamas turtas",
        "Elektronika",
        "Mada",
        "Namai ir buitis",
        "Paslaugos",
        "Darbas",
        "Kita",
      ]
    );
    assert.equal(options.find((o) => o.id === "other")?.label, "Kita");
  });
});

describe("F7 — „Mada“ subcategories via existing architecture", () => {
  it("classifies shoe subcategories as avalynė", () => {
    assert.equal(classifyFashionKind({ subcategory: "Sportbačiai" }), "avalynė");
    assert.equal(classifyFashionKind({ subcategory: "Bateliai" }), "avalynė");
    assert.equal(classifyFashionKind({ text: "Nike Air Max 42" }), "avalynė");
  });

  it("classifies accessory subcategories as aksesuarai", () => {
    assert.equal(classifyFashionKind({ subcategory: "Krepšiai" }), "aksesuarai");
    assert.equal(classifyFashionKind({ text: "rankinė odinė" }), "aksesuarai");
  });

  it("classifies clothing subcategories as drabužiai", () => {
    assert.equal(classifyFashionKind({ subcategory: "Suknelės" }), "drabužiai");
    assert.equal(classifyFashionKind({ text: "žieminė striukė" }), "drabužiai");
  });

  it("unknown fashion items return null — never guessed", () => {
    assert.equal(classifyFashionKind({ subcategory: "Nežinomas dydis" }), null);
    assert.equal(classifyFashionKind({ text: "" }), null);
    assert.equal(classifyFashionKind({}), null);
  });

  it("fashion kind labels are Lithuanian and stable", () => {
    assert.deepEqual(FASHION_KIND_LABELS, {
      drabužiai: "Drabužiai",
      avalynė: "Avalynė",
      aksesuarai: "Aksesuarai",
    });
  });

  it("detail chips: clothing listings present „Mada“ or the kind subcategory", () => {
    const withShoes = getAiListingTagChips(["nike air max 42"], "clothing");
    assert.ok(withShoes.includes("Avalynė"), `got: ${withShoes.join(",")}`);

    const generic = getAiListingTagChips(["prabangus daiktas"], "clothing");
    assert.ok(generic.includes("Mada"), `got: ${generic.join(",")}`);

    // Non-clothing verticals never receive fashion kind chips.
    const electronics = getAiListingTagChips(["batai"], "electronics");
    assert.ok(!electronics.some((c) => /Avalyn|Drabuž|Aksesuar/.test(c)));
  });
});

describe("F7 — missing/broken image contract", () => {
  it("a listing without photos resolves to the neutral placeholder (never stock)", () => {
    const url = resolveListingImage({
      title: "X",
      category: "other",
      description: "",
      images: [],
    });
    assert.equal(url, LISTING_PLACEHOLDER_IMAGE);
    assert.equal(isListingPlaceholderUrl(url), true);
  });

  it("real uploads win over the placeholder", () => {
    const url = resolveListingImage({
      title: "X",
      category: "vehicles",
      description: "",
      images: ["https://cdn.example.com/photo.jpg"],
    });
    assert.equal(url, "https://cdn.example.com/photo.jpg");
    assert.equal(isListingPlaceholderUrl(url), false);
  });
});
