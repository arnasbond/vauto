/** Shared helpers for multi-object vision parsing (seller upload + buyer photo search). */

import { localizeVisionObjectLabel } from "../shared/vision-object-labels.js";

export interface DetectedVisionObject {
  label: string;
  category?: string;
  confidence?: number;
}

const SELL_CHIP_PREFIX = "Parduoti ";
const SEARCH_CHIP_PREFIX = "Ieškoti ";

/**
 * Tech passport / registration / receipts are OCR evidence — never sellable
 * multi-object chips (car + passport must continue to Step 1 specs).
 */
const DOCUMENT_LIKE_LABEL =
  /\b(technin(?:is|io)?\s+pasas|tech[_\s-]?passport|registracijos\s+liudijim|registracij(?:a|os)|registration(?:\s+certificate)?|pasas|passport|kvitas|receipt|invoice|sąskaita|dokument(?:as|o|ų)|id[_\s-]?card|asmen(?:s|inis)\s+dokument)\b/i;

export function isDocumentLikeVisionLabel(label: string): boolean {
  const t = label.trim();
  if (!t) return false;
  const noun = t.replace(/^(parduoti|ieškoti|ieskoti)\s+/i, "").trim();
  return DOCUMENT_LIKE_LABEL.test(noun) || DOCUMENT_LIKE_LABEL.test(t);
}

export function filterSellableDetectedObjects(
  objects: DetectedVisionObject[]
): DetectedVisionObject[] {
  return objects.filter((o) => !isDocumentLikeVisionLabel(o.label));
}

export function filterSellableChoiceChips(chips: string[]): string[] {
  return chips.filter((c) => !isDocumentLikeVisionLabel(c));
}

function normalizeChipLabel(raw: string, mode: "sell" | "search"): string {
  const localized = localizeVisionObjectLabel(raw);
  if (!localized) return "";
  const lower = localized.toLowerCase();
  if (
    lower.startsWith("parduoti ") ||
    lower.startsWith("ieškoti ") ||
    lower.startsWith("ieskoti ")
  ) {
    return localized.charAt(0).toUpperCase() + localized.slice(1);
  }
  const prefix = mode === "sell" ? SELL_CHIP_PREFIX : SEARCH_CHIP_PREFIX;
  const noun = localized.replace(/^(parduoti|ieškoti|ieskoti)\s+/i, "").trim();
  if (!noun) return "";
  return `${prefix}${noun.charAt(0).toLowerCase()}${noun.slice(1)}`;
}

export function parseDetectedObjects(raw: unknown): DetectedVisionObject[] {
  if (!Array.isArray(raw)) return [];
  const out: DetectedVisionObject[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const label = localizeVisionObjectLabel(String(r.label ?? r.name ?? ""));
    if (!label || label.length < 2) continue;
    if (isDocumentLikeVisionLabel(label)) continue;
    const confidenceRaw = Number(r.confidence);
    out.push({
      label,
      category: r.category ? String(r.category).trim() : undefined,
      confidence: Number.isFinite(confidenceRaw) ? Math.min(1, Math.max(0, confidenceRaw)) : undefined,
    });
  }
  return out.slice(0, 6);
}

export function parseChoiceChips(raw: unknown, mode: "sell" | "search" = "sell"): string[] {
  const fromArray = Array.isArray(raw)
    ? raw.map((v) => normalizeChipLabel(String(v), mode)).filter(Boolean)
    : typeof raw === "string"
      ? raw
          .split(/[,;|]/)
          .map((s) => normalizeChipLabel(s, mode))
          .filter(Boolean)
      : [];
  return filterSellableChoiceChips([...new Set(fromArray)]).slice(0, 4);
}

export function chipsFromDetectedObjects(
  objects: DetectedVisionObject[],
  mode: "sell" | "search" = "sell"
): string[] {
  const chips = filterSellableDetectedObjects(objects)
    .map((o) => normalizeChipLabel(o.label, mode))
    .filter((c) => c.length >= 6);
  return [...new Set(chips)].slice(0, 4);
}

export function buildSemanticAlternatives(
  filters: Record<string, string | undefined>,
  visualSummary?: string
): string[] {
  const tokens = [
    filters.color,
    filters.clothingType,
    filters.bodyType,
    filters.brand,
    filters.propertyType,
    filters.furnishing,
  ]
    .filter(Boolean)
    .map((t) => String(t).trim());

  const base = visualSummary?.trim() || tokens.join(" ");
  if (!base) return [];

  const color = filters.color?.trim();
  const type =
    filters.clothingType?.trim() ||
    filters.bodyType?.trim() ||
    filters.propertyType?.trim() ||
    filters.brand?.trim();

  const alts: string[] = [];
  if (color && type) alts.push(`${color} ${type}`);
  if (type) alts.push(type);
  if (color) alts.push(`${color} prekė`);
  if (base && base !== type) alts.push(base);

  return [...new Set(alts.map((a) => a.trim()).filter((a) => a.length >= 3))].slice(0, 4);
}

export function buildMultiObjectClarificationPrompt(
  _sceneContext: string | undefined,
  objects: DetectedVisionObject[],
  mode: "sell" | "search" = "sell"
): string {
  // Never mention background/scene (paving, house, trees) — sellable objects only.
  void _sceneContext;
  const labels = objects.map((o) => o.label).filter(Boolean);
  if (labels.length >= 2) {
    const joined = labels.slice(0, 3).join(", ");
    const primary = labels[0];
    if (mode === "sell") {
      return (
        `Matau kelis objektus: ${joined}. Jei parduodame „${primary}" — pasirinkite žemiau. ` +
        `Galite ir atsiųsti aiškesnę etiketės / kampo nuotrauką, kad įtraukčiau visas specifikacijas.`
      );
    }
    return `Nuotraukoje matau kelis objektus: ${joined}. Ką norite ieškoti?`;
  }
  return "";
}
