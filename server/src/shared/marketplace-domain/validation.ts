import type {
  AttributeDefinition,
  AttributeValidationIssue,
  AttributeValidationResult,
  AttributeValues,
  VerticalId,
} from "./types.js";
import { getVertical } from "./registry.js";
import { resolveVerticalId } from "./legacy.js";

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(String(value).replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asString(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return asString(value) === "";
}

function validateField(
  def: AttributeDefinition,
  raw: unknown
): AttributeValidationIssue | null {
  if (isEmpty(raw)) {
    if (def.required) {
      return { key: def.key, code: "required", message: `Laukas „${def.label}“ privalomas.` };
    }
    return null;
  }

  if (def.type === "number") {
    const n = asNumber(raw);
    if (n === null) {
      return { key: def.key, code: "invalid_type", message: `Laukas „${def.label}“ turi būti skaičius.` };
    }
    if (def.min !== undefined && n < def.min) {
      return { key: def.key, code: "min", message: `Laukas „${def.label}“ negali būti mažesnis nei ${def.min}.` };
    }
    if (def.max !== undefined && n > def.max) {
      return { key: def.key, code: "max", message: `Laukas „${def.label}“ negali būti didesnis nei ${def.max}.` };
    }
    return null;
  }

  if (def.type === "enum") {
    const s = asString(raw);
    if (def.options && !def.options.includes(s)) {
      return {
        key: def.key,
        code: "invalid_enum",
        message: `Laukas „${def.label}“ priima tik nurodytas reikšmes.`,
      };
    }
    return null;
  }

  if (def.type === "multi_enum") {
    const values = Array.isArray(raw) ? raw.map((v) => String(v)) : [asString(raw)];
    if (def.options && values.some((v) => !def.options!.includes(v))) {
      return {
        key: def.key,
        code: "invalid_enum",
        message: `Laukas „${def.label}“ priima tik nurodytas reikšmes.`,
      };
    }
    return null;
  }

  if (def.type === "boolean") {
    if (typeof raw !== "boolean" && raw !== "true" && raw !== "false") {
      return { key: def.key, code: "invalid_type", message: `Laukas „${def.label}“ turi būti taip/ne.` };
    }
  }

  return null;
}

export function validateListingAttributes(
  category: unknown,
  values: AttributeValues
): AttributeValidationResult {
  const id = resolveVerticalId(category);
  if (!id) {
    return {
      ok: false,
      issues: [
        {
          key: "category",
          code: "unknown_category",
          message: "Nežinoma kategorija — privilegijuotos galimybės netaikomos.",
        },
      ],
    };
  }

  const vertical = getVertical(id);
  const issues: AttributeValidationIssue[] = [];

  for (const def of vertical.attributes) {
    const issue = validateField(def, values[def.key]);
    if (issue) issues.push(issue);
  }

  if (id === "JOBS") {
    const min = asNumber(values.salaryMin);
    const max = asNumber(values.salaryMax);
    if (min !== null && max !== null && min > max) {
      issues.push({
        key: "salaryMax",
        code: "range_order",
        message: "Atlygio minimumas negali būti didesnis už maksimumą.",
      });
    }
  }

  return issues.length ? { ok: false, issues } : { ok: true };
}

export function assertKnownVertical(id: VerticalId): VerticalId {
  return getVertical(id).id;
}
