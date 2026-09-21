/**
 * VAUTO AI Core v2.4 — prepareListingDraft capability (PREPARE).
 *
 * Stages a listing-draft PREVIEW from user-stated facts. Pure normalization —
 * no persistence, no final consequential mutation. The draft is a
 * MODEL_INFERRED proposal (not yet authoritative): it becomes authoritative
 * only through the CONSEQUENTIAL publish boundary with explicit confirmation.
 */
import type {
  CapabilityContext,
  CapabilityContract,
  CapabilityResult,
} from "../capability.js";

export interface PrepareListingDraftArgs {
  title: string;
  category: string;
  description?: string;
  price?: number;
  city?: string;
  attributes?: Record<string, string>;
}

export interface ListingDraftData {
  title: string;
  category: string;
  description: string;
  price?: number;
  location?: string;
  attributes: Record<string, string>;
  status: "draft";
}

function reqString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function optString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") throw new Error("expected a string");
  const t = value.trim();
  return t || undefined;
}

function optPrice(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("price must be a non-negative number");
  }
  return value;
}

function optAttributes(value: unknown): Record<string, string> {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("attributes must be an object");
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v == null) continue;
    out[k] = String(v).trim();
  }
  return out;
}

export const prepareListingDraftCapability: CapabilityContract<
  PrepareListingDraftArgs,
  ListingDraftData
> = {
  name: "prepareListingDraft",
  description:
    "Paruošti skelbimo juodraščio peržiūrą iš vartotojo pateiktų faktų (neišsaugoma, nepatvirtinama).",
  operation: "PREPARE",
  validate(raw: unknown): PrepareListingDraftArgs {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("prepareListingDraft args must be an object");
    }
    const r = raw as Record<string, unknown>;
    return {
      title: reqString(r.title, "title"),
      category: reqString(r.category, "category"),
      description: optString(r.description),
      price: optPrice(r.price),
      city: optString(r.city),
      attributes: optAttributes(r.attributes),
    };
  },
  async execute(
    args: PrepareListingDraftArgs,
    _ctx: CapabilityContext
  ): Promise<CapabilityResult<ListingDraftData>> {
    // PREPARE: deterministic normalization only — no DB, no mutation.
    return {
      ok: true,
      provenance: "MODEL_INFERRED",
      data: {
        title: args.title,
        category: args.category,
        description: args.description ?? "",
        price: args.price,
        location: args.city,
        attributes: args.attributes ?? {},
        status: "draft",
      },
    };
  },
};
