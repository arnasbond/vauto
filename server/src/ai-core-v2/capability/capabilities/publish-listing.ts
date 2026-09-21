/**
 * VAUTO AI Core v2.4 — publishListing capability (CONSEQUENTIAL).
 *
 * Publishes a confirmed listing draft. This is the Human-in-the-Loop
 * confirmation boundary: without an authenticated seller AND explicit
 * confirmation, execution is refused (authorization / confirmation_required).
 *
 * IMPORTANT — real publishing is DISABLED. Until Core v2 can pass the complete,
 * user-reviewed authoritative listing draft into the existing trusted
 * publishing boundary (`repository.insertListing`), even a confirmed request
 * fails closed as `unavailable` and NEVER persists a listing. Confirmation is
 * authorization to publish the REVIEWED state; it is not permission to
 * reconstruct or approximate that state. The capability declaration, operation
 * class, and confirmation boundary are kept so the contract is stable.
 */
import type {
  CapabilityContext,
  CapabilityContract,
  CapabilityResult,
} from "../capability.js";

export interface PublishListingArgs {
  title: string;
  category: string;
  description?: string;
  price?: number;
  city?: string;
  attributes?: Record<string, string>;
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

export const publishListingCapability: CapabilityContract<
  PublishListingArgs,
  { id: string }
> = {
  name: "publishListing",
  description:
    "Paskelbti patvirtintą skelbimą (CONSEQUENTIAL — reikalauja žmogaus patvirtinimo).",
  operation: "CONSEQUENTIAL",
  requiresConfirmation: true,
  validate(raw: unknown): PublishListingArgs {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("publishListing args must be an object");
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
    _args: PublishListingArgs,
    ctx: CapabilityContext
  ): Promise<CapabilityResult<{ id: string }>> {
    if (!ctx.authUserId) {
      return {
        ok: false,
        failureKind: "authorization",
        error: "publish requires an authenticated seller",
      };
    }
    if (!ctx.confirmed) {
      return {
        ok: false,
        failureKind: "confirmation_required",
        error: "publish requires explicit user confirmation",
      };
    }
    // Fail closed: real publishing is disabled until the authoritative,
    // user-reviewed listing draft can be passed to the trusted publish boundary.
    return {
      ok: false,
      failureKind: "unavailable",
      error: "publishing disabled until authoritative listing draft is integrated",
    };
  },
};
