/**
 * Finding C — schema-driven universal AI extraction.
 *
 * The marketplace-domain vertical schemas (registry/attributes/types) are the
 * SOURCE OF TRUTH for structured listing fields. This module lets the model
 * remain the semantic interpreter while deterministic code provides:
 *   - a compact schema hint (which canonical field keys exist per vertical),
 *   - validation/normalization of model-emitted fields against that schema.
 *
 * This is guidance + validation, NOT a phrase cage: the model still maps
 * natural language to fields; determinism only enforces the canonical shape
 * (type / enum whitelist / min-max). Non-canonical fields survive ONLY when an
 * explicit enrichment namespace owns them (enrichment-registry.ts) — arbitrary
 * unknown model keys are dropped.
 */
import {
  getVertical,
  CANONICAL_VERTICALS,
} from "../shared/marketplace-domain/registry.js";
import type {
  AttributeDefinition,
  VerticalId,
} from "../shared/marketplace-domain/types.js";
import { allowedAttributeKeys } from "./enrichment-registry.js";

/** Internal listing category slug → canonical vertical. */
export function verticalForCategory(category: string): VerticalId {
  switch (String(category ?? "").toLowerCase()) {
    case "vehicles":
    case "transport":
    case "automobiliai":
      return "TRANSPORT";
    case "real_estate":
    case "nt":
    case "nekilnojamas":
      return "REAL_ESTATE";
    case "electronics":
    case "elektronika":
      return "ELECTRONICS";
    case "clothing":
    case "apranga":
    case "fashion":
      return "CLOTHING";
    case "home":
    case "tools":
    case "namai":
    case "irankiai":
      return "HOME_GARDEN";
    case "services":
    case "paslaugos":
      return "SERVICES";
    case "jobs":
    case "darbas":
      return "JOBS";
    default:
      return "OTHER";
  }
}

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ą/g, "a")
    .replace(/č/g, "c")
    .replace(/ę/g, "e")
    .replace(/ė/g, "e")
    .replace(/į/g, "i")
    .replace(/š/g, "s")
    .replace(/ų/g, "u")
    .replace(/ū/g, "u")
    .replace(/ž/g, "z");
}

function enumMatch(options: readonly string[] | undefined, value: string): string | undefined {
  if (!options?.length) return value;
  const f = fold(value);
  return options.find((o) => fold(o) === f);
}

/** Normalize one model-emitted value against a canonical AttributeDefinition. */
function normalizeAttributeValue(
  def: AttributeDefinition,
  raw: string | string[]
): string | string[] | undefined {
  const str = Array.isArray(raw) ? raw.map(String).join(", ") : String(raw).trim();
  if (!str) return undefined;

  switch (def.type) {
    case "string":
      return str;
    case "number": {
      const n = Number(str.replace(",", "."));
      if (!Number.isFinite(n)) return undefined;
      if (def.min != null && n < def.min) return undefined;
      if (def.max != null && n > def.max) return undefined;
      return String(n);
    }
    case "enum": {
      return enumMatch(def.options, str);
    }
    case "multi_enum": {
      const parts = Array.isArray(raw) ? raw.map(String) : str.split(/[,|]/);
      const matched = parts
        .map((p) => enumMatch(def.options, p))
        .filter((p): p is string => Boolean(p));
      return matched.length ? matched : undefined;
    }
    case "boolean": {
      if (/^(taip|yes|true|1)$/i.test(str)) return "true";
      if (/^(ne|no|false|0)$/i.test(str)) return "false";
      return undefined;
    }
    default:
      // location / date / range — pass through as a normalized string.
      return str;
  }
}

/**
 * Validate/normalize model-emitted attributes against a vertical's canonical
 * schema. Canonical keys are coerced/whitelisted; non-canonical keys survive
 * only when an explicit enrichment namespace owns them (see
 * enrichment-registry.ts); any other arbitrary model key is DROPPED.
 * Returns the normalized map + missing required.
 */
export function normalizeAttributesAgainstVertical(
  verticalId: VerticalId,
  attrs: Record<string, string | string[]>
): { attributes: Record<string, string | string[]>; missingRequired: string[] } {
  const defs = getVertical(verticalId).attributes;
  const allowed = allowedAttributeKeys(verticalId);

  // Drop arbitrary unknown keys up front — keep only canonical + owned enrichment.
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (!allowed.has(key)) continue;
    out[key] = value;
  }

  const missingRequired: string[] = [];

  for (const def of defs) {
    const raw = out[def.key];
    if (raw == null || raw === "" || (Array.isArray(raw) && raw.length === 0)) {
      if (def.required) missingRequired.push(def.key);
      continue;
    }
    const norm = normalizeAttributeValue(
      def,
      Array.isArray(raw) ? raw.map(String) : String(raw)
    );
    if (norm === undefined) {
      delete out[def.key];
      if (def.required) missingRequired.push(def.key);
    } else {
      out[def.key] = norm;
    }
  }

  return { attributes: out, missingRequired };
}

/** Compact prompt hint: per-vertical canonical field keys (not a phrase cage). */
export function buildSchemaHint(): string {
  const lines = CANONICAL_VERTICALS.map((v) => {
    const fields = v.attributes.map((a) => {
      const type =
        a.type === "enum" && a.options?.length
          ? `${a.type}: ${a.options.join("|")}`
          : a.type;
      return `${a.key}(${type})`;
    });
    return `${v.uiSlug}/${v.id}: ${fields.join(", ")}`;
  });
  return `KATEGORIJOS STRUKTŪRA (kokius struktūrinius laukus ištraukti — naudok šiuos raktus):
${lines.join("\n")}`;
}
