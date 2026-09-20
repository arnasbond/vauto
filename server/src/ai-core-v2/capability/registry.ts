/**
 * VAUTO AI Core v2 — capability registry.
 *
 * A thin, explicit registry of capability contracts. It does NOT decide what
 * the user meant; it only exposes what capabilities exist, their
 * consequences, and their typed contracts.
 */
import type {
  CapabilityContract,
  CapabilityDescription,
} from "./capability.js";

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
      consequence: c.consequence,
    }));
  }
}
