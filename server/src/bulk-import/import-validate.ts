/**
 * F6 Final — import mapping + canonical validation.
 *
 * Deterministic column/field → canonical listing-field mapping with explicit
 * alias tables (case-insensitive, trimmed). NO invented facts: unknown
 * columns are reported as ignored; missing category becomes the explicit
 * `other`; per-vertical attributes are validated with the canonical
 * marketplace-domain validator. This layer is read-only — it never writes.
 */
import { coerceListingCategoryForDb } from "../shared/category-registry.js";
import { validateListingAttributes } from "../shared/marketplace-domain/validation.js";
import { isFormulaInjectionCell } from "./import-parsers.js";
import type { XmlNode } from "./import-parsers.js";

export const IMPORT_MAX_TITLE = 160;
export const IMPORT_MAX_DESCRIPTION = 5000;
export const IMPORT_MAX_PRICE = 100_000_000;

export type ImportSource = "csv" | "xml";

export type ImportRowVerdict = "ok" | "warning" | "error";

export type ImportRowReport = {
  line: number;
  verdict: ImportRowVerdict;
  errors: string[];
  warnings: string[];
  ignoredFields: string[];
  /** Canonical listing fields that were present in the row. */
  title: string | null;
  price: number | null;
  priceLabel: string | null;
  category: string | null;
  location: string | null;
  description: string | null;
  tags: string[];
  images: string[];
  attributes: Record<string, string>;
};

export type ImportSummary = {
  total: number;
  ok: number;
  warnings: number;
  errors: number;
  byCategory: Record<string, number>;
};

export type ImportPreviewResult = {
  source: ImportSource;
  columns: string[];
  mapping: Array<{ column: string; field: string | null; ignored: boolean }>;
  rows: ImportRowReport[];
  summary: ImportSummary;
  reportText: string;
};

const FIELD_ALIASES: Record<string, string[]> = {
  title: ["title", "pavadinimas", "name", "skelbimo pavadinimas"],
  price: ["price", "kaina", "price_eur"],
  priceLabel: ["price_label", "kainos uzrasas", "price label"],
  category: ["category", "kategorija", "category_slug"],
  location: ["location", "miestas", "city", "vieta"],
  description: ["description", "aprasymas", "aprašymas", "desc"],
  tags: ["tags", "zymos", "raktazodziai", "keywords"],
  images: ["images", "nuotraukos", "image_urls", "photos"],
  image: ["image", "nuotrauka", "cover", "image_url", "photo"],
  contact: ["contact", "kontaktai", "phone", "telefonas"],
};

/** Per-vertical attribute columns: `attr:<key>` (CSV) and attributes container children / listing attributes (XML). */
export const ATTRIBUTE_KEYS = [
  "make",
  "model",
  "year",
  "mileage",
  "fuelType",
  "transmission",
  "vin",
  "bodyType",
  "rooms",
  "area",
  "floor",
  "heating",
  "condition",
  "brand",
  "screenSize",
  "storage",
  "size",
  "color",
  "material",
  "serviceArea",
  "experience",
  "salaryMin",
  "salaryMax",
  "schedule",
  "gardenArea",
  "furnished",
] as const;

const RESOLVED_ALIASES: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const a of aliases) out[normalizeKey(a)] = field;
  }
  for (const key of ATTRIBUTE_KEYS) {
    out[`attr:${key}`] = `attribute:${key}`;
  }
  return out;
})();

export function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "_");
}

export function mapColumn(column: string): { field: string | null; ignored: boolean } {
  const field = RESOLVED_ALIASES[normalizeKey(column)];
  if (field) return { field, ignored: false };
  return { field: null, ignored: true };
}

/** Deterministic price parsing: plain number or "12 345,67" (lt-LT). */
export function parsePrice(raw: string | null): number | null {
  if (raw == null) return null;
  const t = raw.trim().replace(/\u00a0/g, " ").replace(/€|eur/gi, "").trim();
  if (!t) return null;
  const normalized = t.replace(/\s+/g, "").replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0 || value > IMPORT_MAX_PRICE) return null;
  return value;
}

export function splitList(raw: string | null): string[] {
  if (raw == null) return [];
  return raw
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function elementText(node: XmlNode | undefined): string | null {
  if (!node || node.kind !== "element") return null;
  return node.children
    .filter((c) => c.kind === "text")
    .map((c) => (c as { value: string }).value)
    .join(" ")
    .trim();
}

export type XmlRowInput = { node: XmlNode };

/**
 * Extract canonical fields from a <listing> element. Child elements map to
 * canonical fields; repeated <image>/<images>/<tag> collect; an
 * <attributes> container's children map to per-vertical attribute keys;
 * attributes ON the <listing> element are accepted as attribute keys ONLY
 * when the name matches the attribute schema prefix `attr:` semantics —
 * concretely, any listing-element attribute whose name is a known
 * ATTRIBUTE_KEY is accepted; everything else is ignored (reported).
 */
export function extractXmlRow(node: XmlNode): {
  fields: Record<string, string>;
  images: string[];
  tags: string[];
  attributes: Record<string, string>;
  ignored: string[];
} {
  const fields: Record<string, string> = {};
  const images: string[] = [];
  const tags: string[] = [];
  const attributes: Record<string, string> = {};
  const ignored: string[] = [];
  if (node.kind !== "element") {
    return { fields, images, tags, attributes, ignored };
  }

  for (const [name, value] of Object.entries(node.attributes)) {
    if ((ATTRIBUTE_KEYS as readonly string[]).includes(name)) {
      attributes[name] = value;
    } else {
      ignored.push(`@${name}`);
    }
  }

  for (const child of node.children) {
    if (child.kind !== "element") continue;
    const name = child.name.toLowerCase();
    if (name === "attributes") {
      for (const attrChild of child.children) {
        if (attrChild.kind !== "element") continue;
        const key = attrChild.name.toLowerCase();
        const value = elementText(attrChild) ?? "";
        if ((ATTRIBUTE_KEYS as readonly string[]).includes(key)) {
          attributes[key] = value;
        } else {
          ignored.push(`attributes.${attrChild.name}`);
        }
      }
      continue;
    }
    const mapped = RESOLVED_ALIASES[name];
    if (mapped === "image" || mapped === "images") {
      const value = elementText(child);
      if (value) images.push(value);
      continue;
    }
    if (mapped === "tags") {
      const value = elementText(child);
      if (value) tags.push(...value.split(/[,;]/).map((t) => t.trim()).filter(Boolean));
      continue;
    }
    if (mapped && !mapped.startsWith("attribute:")) {
      const value = elementText(child);
      if (value != null) fields[mapped] = value;
      continue;
    }
    if (mapped && mapped.startsWith("attribute:")) {
      const value = elementText(child);
      if (value != null) attributes[mapped.slice("attribute:".length)] = value;
      continue;
    }
    if ((ATTRIBUTE_KEYS as readonly string[]).includes(name)) {
      attributes[name] = elementText(child) ?? "";
      continue;
    }
    ignored.push(child.name);
  }
  return { fields, images, tags, attributes, ignored };
}

export function buildImportPreview(input: {
  source: ImportSource;
  columns: string[];
  rows: Array<{
    line: number;
    fields: Record<string, string>;
    images: string[];
    tags: string[];
    attributes: Record<string, string>;
    ignored: string[];
  }>;
}): ImportPreviewResult {
  const mapping = input.columns.map((c) => ({
    column: c,
    field: mapColumn(c).field,
    ignored: mapColumn(c).ignored,
  }));
  const rows: ImportRowReport[] = [];
  const summary: ImportSummary = {
    total: input.rows.length,
    ok: 0,
    warnings: 0,
    errors: 0,
    byCategory: {},
  };

  for (const raw of input.rows) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const get = (field: string): string | null =>
      raw.fields[field] != null ? String(raw.fields[field]) : null;

    const title = get("title");
    if (title == null || title.trim().length < 2) errors.push("Trūksta pavadinimo (min 2 simboliai).");
    else if (title.trim().length > IMPORT_MAX_TITLE) {
      errors.push(`Pavadinimas viršija ${IMPORT_MAX_TITLE} simbolių.`);
    }

    const priceRaw = get("price");
    const price = parsePrice(priceRaw);
    if (price == null) {
      errors.push("Trūksta arba netinkama kaina (skaičius, pvz. 10900 arba 10900,50).");
    }

    const location = get("location");
    if (location == null || location.trim().length === 0) {
      errors.push("Trūksta vietos (miestas).");
    }

    const description = get("description");
    if (description != null && description.trim().length > IMPORT_MAX_DESCRIPTION) {
      errors.push(`Aprašymas viršija ${IMPORT_MAX_DESCRIPTION} simbolių.`);
    }

    const categoryRaw = get("category");
    const category = coerceListingCategoryForDb(
      categoryRaw == null || categoryRaw.trim() === "" ? "other" : categoryRaw
    );
    if (!category) {
      errors.push("Kategorijos nepavyko nustatyti.");
    } else if (categoryRaw && categoryRaw.trim() && category !== categoryRaw.trim().toLowerCase()) {
      warnings.push(`Kategorija „${categoryRaw.trim()}“ konvertuota į „${category}“.`);
    }
    for (const [key, value] of Object.entries(raw.attributes)) {
      if (isFormulaInjectionCell(value)) {
        errors.push(`Atributo „${key}“ reikšmė prasideda pavojingu simboliu.`);
      }
    }
    for (const v of [title, location, description, priceRaw]) {
      if (v != null && isFormulaInjectionCell(v)) {
        errors.push("Laukas prasideda pavojingu simboliu (=, +, -, @, tab).");
        break;
      }
    }

    // Canonical per-vertical attribute validation (privileged capabilities).
    if (category && Object.keys(raw.attributes).length > 0) {
      const attrCheck = validateListingAttributes(category, raw.attributes);
      if (!attrCheck.ok) {
        for (const issue of attrCheck.issues) {
          warnings.push(`Atributas: ${issue.message}`);
        }
      }
    }

    const verdict: ImportRowVerdict =
      errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ok";
    if (verdict === "ok") summary.ok += 1;
    else if (verdict === "warning") summary.warnings += 1;
    else summary.errors += 1;
    if (category) {
      summary.byCategory[category] = (summary.byCategory[category] ?? 0) + 1;
    }

    rows.push({
      line: raw.line,
      verdict,
      errors,
      warnings,
      ignoredFields: raw.ignored,
      title: title?.trim() || null,
      price,
      priceLabel: get("priceLabel")?.trim() || null,
      category,
      location: location?.trim() || null,
      description: description?.trim() || null,
      tags: raw.tags,
      images: raw.images,
      attributes: raw.attributes,
    });
  }

  const reportText = buildReportText({
    source: input.source,
    mapping,
    rows,
    summary,
  });

  return { source: input.source, columns: input.columns, mapping, rows, summary, reportText };
}

export function buildReportText(input: {
  source: ImportSource;
  mapping: Array<{ column: string; field: string | null; ignored: boolean }>;
  rows: ImportRowReport[];
  summary: ImportSummary;
}): string {
  const lines: string[] = [];
  lines.push("VAUTO masinio importo ataskaita");
  lines.push(`Formatas: ${input.source.toUpperCase()}`);
  lines.push(
    `Santrauka: ${input.summary.total} eilučių — tinkamos: ${input.summary.ok}, su įspėjimais: ${input.summary.warnings}, klaidingos: ${input.summary.errors}.`
  );
  if (Object.keys(input.summary.byCategory).length > 0) {
    lines.push(
      "Kategorijos: " +
        Object.entries(input.summary.byCategory)
          .map(([c, n]) => `${c}: ${n}`)
          .join(", ")
    );
  }
  lines.push("");
  lines.push("Stulpelių susiejimas:");
  for (const m of input.mapping) {
    lines.push(`  ${m.column} → ${m.ignored ? "(ignoruojamas)" : m.field ?? "(ignoruojamas)"}`);
  }
  lines.push("");
  for (const row of input.rows) {
    const status =
      row.verdict === "ok" ? "OK" : row.verdict === "warning" ? "ĮSPĖJIMAS" : "KLAIDA";
    lines.push(`Eilutė ${row.line}: ${status}`);
    for (const e of row.errors) lines.push(`  [klaida] ${e}`);
    for (const w of row.warnings) lines.push(`  [įspėjimas] ${w}`);
    for (const f of row.ignoredFields) lines.push(`  [ignoruojamas laukas] ${f}`);
  }
  lines.push("");
  lines.push(
    "Pastaba: importas patenka tik į juodraščių būseną ir niekada nepublikuojamas automatiškai."
  );
  return lines.join("\r\n");
}

/** Gate: import persistence is fail-closed (draft status does not exist yet). */
export function bulkImportEnabled(
  env: { NODE_ENV?: string; VAUTO_ENABLE_BULK_IMPORT?: string } = process.env
): boolean {
  // Even with the env opt-in the durable persistence layer is NOT implemented
  // (server has no 'draft' listing status). Fail-closed: never report true.
  if (env.NODE_ENV === "production") return false;
  return false;
}
