/**
 * VAUTO AI Core v2.4 — publishListing capability (CONSEQUENTIAL).
 *
 * Publishes a confirmed listing draft. This is the Human-in-the-Loop
 * confirmation boundary: without an authenticated seller AND explicit
 * confirmation, execution is refused (authorization / confirmation_required).
 * On confirmation it bridges to the existing `insertListing` service (thin
 * adapter) — it never re-implements marketplace persistence.
 */
import { randomUUID } from "node:crypto";
import { insertListing } from "../../../repository.js";
import type { ApiListing } from "../../../types.js";
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

/** Injectable persistence boundary — defaults to the existing repository service. */
export type PublishPersistFn = (listing: ApiListing) => Promise<void>;

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

export function createPublishListingCapability(
  persist: PublishPersistFn = insertListing
): CapabilityContract<PublishListingArgs, { id: string }> {
  return {
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
      args: PublishListingArgs,
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
      const id = randomUUID();
      const listing: ApiListing = {
        id,
        sellerId: ctx.authUserId,
        title: args.title,
        price: args.price ?? 0,
        location: args.city ?? "",
        distanceKm: 0,
        image: "",
        images: [],
        category: args.category,
        tags: [],
        createdAt: new Date().toISOString(),
        description: args.description,
        attributes: args.attributes,
        status: "active",
        banned: false,
      };
      try {
        await persist(listing);
        return { ok: true, provenance: "TOOL_DERIVED", data: { id } };
      } catch (err) {
        return {
          ok: false,
          failureKind: "recoverable",
          error: err instanceof Error ? err.message : "publish failed",
        };
      }
    },
  };
}

export const publishListingCapability = createPublishListingCapability();
