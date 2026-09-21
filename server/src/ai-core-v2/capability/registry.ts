/**
 * VAUTO AI Core v2 — capability registry.
 *
 * A thin, explicit registry of capability contracts. It does NOT decide what
 * the user meant; it only exposes what capabilities exist, their operation
 * class, and their typed contracts.
 */
import type {
  CapabilityContract,
  CapabilityDescription,
} from "./capability.js";
import { searchListingsCapability } from "./capabilities/search-listings.js";
import { listingDetailsCapability } from "./capabilities/listing-details.js";
import { prepareListingDraftCapability } from "./capabilities/prepare-listing-draft.js";
import { publishListingCapability } from "./capabilities/publish-listing.js";

export class CapabilityRegistry {
  private readonly contracts = new Map<string, CapabilityContract<unknown, unknown>>();

  register<TArgs, TData>(contract: CapabilityContract<TArgs, TData>): void {
    if (this.contracts.has(contract.name)) {
      throw new Error(`capability already registered: ${contract.name}`);
    }
    this.contracts.set(
      contract.name,
      contract as CapabilityContract<unknown, unknown>
    );
  }

  get<TArgs, TData>(name: string): CapabilityContract<TArgs, TData> | undefined {
    return this.contracts.get(name) as CapabilityContract<TArgs, TData> | undefined;
  }

  has(name: string): boolean {
    return this.contracts.has(name);
  }

  /** Read-only descriptions for the reasoning layer. */
  describe(): CapabilityDescription[] {
    return [...this.contracts.values()].map((c) => ({
      name: c.name,
      description: c.description,
      operation: c.operation,
      requiresConfirmation: c.requiresConfirmation,
    }));
  }
}

/**
 * The marketplace capability set for Core v2: READ → PREPARE → CONSEQUENTIAL.
 * Reuses existing services via thin adapters (no duplicated marketplace logic).
 */
export function createMarketplaceRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  registry.register(searchListingsCapability);
  registry.register(listingDetailsCapability);
  registry.register(prepareListingDraftCapability);
  registry.register(publishListingCapability);
  return registry;
}
