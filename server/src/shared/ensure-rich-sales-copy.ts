/**
 * P0-2 — Guarantee Pass-2 / benchmark rich sales copy is attached before
 * PrePublish finalize and live publish. Never ship empty Vision stubs.
 */

import {
  buildVehicleBenchmarkSalesCopy,
  type SalesCopyDraft,
} from "./vehicle-sales-copy.js";
import { enrichVehicleVisionDraft } from "./vehicle-vision-enrich.js";

/** Minimum chars for a description to count as rich (not a Vision caption stub). */
export const MIN_RICH_SALES_COPY_CHARS = 80;

export type RichSalesCopyDraft = SalesCopyDraft & {
  attributes?: Record<string, string | string[] | undefined>;
};

function attrString(
  attrs: Record<string, string | string[] | undefined> | undefined,
  key: string
): string {
  if (!attrs) return "";
  const raw = attrs[key];
  return Array.isArray(raw) ? raw.map(String).join(", ") : String(raw ?? "");
}

function stringifyAttrs(
  attrs: Record<string, string | string[] | undefined>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(attrs).map(([k, v]) => [
      k,
      Array.isArray(v) ? v.map(String).join(", ") : String(v ?? ""),
    ])
  );
}

/** Strip markdown/emoji chrome, empty template slots, and invented cities. */
export function scrubSalesCopyMarkdown(text: string): string {
  let t = text
    .replace(/\*\*/g, "")
    .replace(/^🚗\s*/gm, "")
    .replace(/^🌟\s*/gm, "")
    .replace(/^💡\s*/gm, "")
    // Never keep prompt label literals at the start of description.
    .replace(/^(Pavadinimas|Title|Antraštė|Aprašymas)\s*:\s*/i, "")
    .replace(/^(Pavadinimas|Title|Antraštė)\s*:\s*.+\n+/i, "");
  // Incomplete fillers: „Atnaujinkite savo .“ / „skirti .“
  t = t.replace(/\b(savo|skirti|skirta|skirtas|tinka|dėl|su)\s+\./gi, "");
  t = t.replace(/\b[\p{L}]{2,24}\s+\.\s*(?=[A-ZĄČĘĖĮŠŲŪŽ])/gu, "");
  t = t.replace(/\s+\.\s+/g, " ");
  // Invented locative cities (Kaune) — omit unless later grounded by caller.
  t = t.replace(
    /\b(Kaune|Vilniuje|Klaipėdoje|Šiauliuose|Panevėžyje)\b/gi,
    ""
  );
  return t
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function looksLikeVehicleSalesDraft(draft: RichSalesCopyDraft): boolean {
  const cat = String(draft.category ?? "").toLowerCase();
  const attrs = draft.attributes ?? {};
  if (
    cat === "vehicles" ||
    cat === "transport" ||
    cat === "automobiliai" ||
    cat === "AUTOMOBILIAI".toLowerCase()
  ) {
    return true;
  }
  return Boolean(
    attrString(attrs, "make") ||
      attrString(attrs, "vin") ||
      attrString(attrs, "plate") ||
      attrString(attrs, "licensePlate") ||
      attrString(attrs, "powerKw")
  );
}

export function isRichSalesCopyText(raw: string | undefined | null): boolean {
  const t = String(raw ?? "").trim();
  if (!t || t.length < MIN_RICH_SALES_COPY_CHARS) return false;
  // Ultra-thin stub patterns that must never go live.
  if (/^parduodama\s+prekė$/i.test(t)) return false;
  if (/^skelbimas$/i.test(t)) return false;
  return true;
}

/**
 * True when draft already has salesCopyGenerated + a rich description body.
 */
export function draftHasRichSalesCopyAttached(draft: RichSalesCopyDraft): boolean {
  const generated =
    String(attrString(draft.attributes, "salesCopyGenerated")).toLowerCase() ===
    "true";
  return generated && isRichSalesCopyText(draft.description);
}

/**
 * True when publish/PrePublish must materialize Pass-2 / deferred / vehicle copy first.
 */
export function draftNeedsRichSalesCopyMaterialization(
  draft: RichSalesCopyDraft
): boolean {
  if (draftHasRichSalesCopyAttached(draft)) return false;
  const deferred = attrString(draft.attributes, "deferredSalesDescription").trim();
  const desc = String(draft.description ?? "").trim();
  if (deferred || !isRichSalesCopyText(desc)) return true;
  // Description present but flag missing — still materialize to stamp salesCopyGenerated.
  return String(attrString(draft.attributes, "salesCopyGenerated")).toLowerCase() !== "true";
}

/**
 * Materialize Pass-2 deferred copy (or vehicle benchmark) onto the draft
 * BEFORE PrePublish / Publikuoti / Publikuok finalization.
 *
 * Priority:
 * 1. Already rich + salesCopyGenerated → keep (clear deferred leftover)
 * 2. Vehicles → buildVehicleBenchmarkSalesCopy from facts
 * 3. deferredSalesDescription (Pass-2 stash from Vision Step 2)
 * 4. Existing non-empty description
 * 5. Title fallback (last resort — still stamps salesCopyGenerated)
 */
export function ensureRichSalesCopyBeforePublish<T extends RichSalesCopyDraft>(
  draft: T
): T {
  const attrsIn = { ...(draft.attributes ?? {}) };
  const deferred = attrString(attrsIn, "deferredSalesDescription").trim().slice(0, 4000);
  const currentDesc = String(draft.description ?? "").trim();

  if (draftHasRichSalesCopyAttached(draft)) {
    if (!deferred) return draft;
    const cleaned = stringifyAttrs(attrsIn);
    delete cleaned.deferredSalesDescription;
    return { ...draft, attributes: cleaned };
  }

  let nextTitle = draft.title;
  let nextDescription = currentDesc;
  let nextAttrs: Record<string, string | string[] | undefined> = { ...attrsIn };

  if (looksLikeVehicleSalesDraft(draft)) {
    const enriched = enrichVehicleVisionDraft({
      title: draft.title,
      description: deferred || draft.description,
      price: draft.price,
      location: draft.location,
      category: draft.category,
      attributes: { ...attrsIn },
    });
    const salesCopy = buildVehicleBenchmarkSalesCopy({
      title: enriched.title ?? draft.title,
      description: deferred || draft.description,
      price: draft.price,
      location: draft.location,
      category: draft.category,
      attributes: enriched.attributes,
    });
    nextTitle = enriched.title || draft.title;
    nextDescription = scrubSalesCopyMarkdown(salesCopy);
    nextAttrs = { ...(enriched.attributes ?? attrsIn) };
  } else {
    const preferred =
      (isRichSalesCopyText(deferred) && deferred) ||
      (isRichSalesCopyText(currentDesc) && currentDesc) ||
      deferred ||
      currentDesc ||
      String(draft.title ?? "").trim() ||
      "Parduodama prekė";
    nextDescription = scrubSalesCopyMarkdown(preferred);
  }

  const stamped = stringifyAttrs({
    ...nextAttrs,
    salesCopyGenerated: "true",
  });
  delete stamped.deferredSalesDescription;

  return {
    ...draft,
    title: nextTitle,
    description: nextDescription,
    attributes: stamped,
  };
}
