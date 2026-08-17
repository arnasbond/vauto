import { FAIL_CLOSED_CAPABILITIES } from "./capabilities";
import { resolveVerticalId } from "./legacy";
import { getVertical } from "./registry";
import type {
  AttributeDefinition,
  CategoryCapabilities,
  MarketplaceVertical,
  VerticalId,
} from "./types";

export function getCategorySchema(id: unknown): MarketplaceVertical | null {
  const verticalId = resolveVerticalId(id);
  if (!verticalId) return null;
  return getVertical(verticalId);
}

export function getFilterableAttributes(id: unknown): readonly AttributeDefinition[] {
  return getCategorySchema(id)?.attributes.filter((a) => a.filterable) ?? [];
}

export function getSearchableAttributes(id: unknown): readonly AttributeDefinition[] {
  return getCategorySchema(id)?.attributes.filter((a) => a.searchable) ?? [];
}

export function getSortableAttributes(id: unknown): readonly AttributeDefinition[] {
  return getCategorySchema(id)?.attributes.filter((a) => a.sortable) ?? [];
}

export function getCategoryCapabilities(id: unknown): CategoryCapabilities {
  const schema = getCategorySchema(id);
  return schema ? schema.capabilities : FAIL_CLOSED_CAPABILITIES;
}

export function canStartOffer(category: unknown): boolean {
  return getCategoryCapabilities(category).supportsOffers;
}

export function canUsePlatformPayment(category: unknown): boolean {
  return getCategoryCapabilities(category).supportsPlatformPayment;
}

export function canUseShipping(category: unknown): boolean {
  return getCategoryCapabilities(category).supportsShipping;
}

export function canApply(category: unknown): boolean {
  return getCategoryCapabilities(category).supportsApplications;
}

export function listingWizardAttributeKeys(id: VerticalId): readonly string[] {
  return getVertical(id).attributes.map((a) => a.key);
}
