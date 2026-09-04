/** Stage 13A — canonical marketplace category domain types. */

export const VERTICAL_IDS = [
  "TRANSPORT",
  "REAL_ESTATE",
  "ELECTRONICS",
  "SERVICES",
  "JOBS",
  "HOME_GARDEN",
  "CLOTHING",
  "OTHER",
] as const;

export type VerticalId = (typeof VERTICAL_IDS)[number];

/** Stable UI / data-attribute slugs (12A/12B). Not the domain ID. */
export const VERTICAL_UI_SLUGS = [
  "transport",
  "real_estate",
  "electronics",
  "services",
  "jobs",
  "home",
  "clothing",
  "other",
] as const;

export type VerticalUiSlug = (typeof VERTICAL_UI_SLUGS)[number];

export const LISTING_KINDS = [
  "PHYSICAL_GOOD",
  "VEHICLE",
  "REAL_ESTATE",
  "SERVICE",
  "JOB_POSTING",
] as const;

export type ListingKind = (typeof LISTING_KINDS)[number];

export const ATTRIBUTE_TYPES = [
  "string",
  "number",
  "boolean",
  "enum",
  "multi_enum",
  "date",
  "range",
  "location",
] as const;

export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

export type AttributeDefinition = {
  key: string;
  label: string;
  type: AttributeType;
  required: boolean;
  filterable: boolean;
  searchable: boolean;
  sortable: boolean;
  options?: readonly string[];
  unit?: string;
  min?: number;
  max?: number;
};

export type CategoryCapabilities = {
  supportsOffers: boolean;
  supportsNegotiation: boolean;
  supportsPlatformPayment: boolean;
  supportsDeposit: boolean;
  supportsShipping: boolean;
  supportsPickup: boolean;
  supportsAppointments: boolean;
  supportsApplications: boolean;
  supportsMilestones: boolean;
  supportsDeliveryTracking: boolean;
  supportsReviews: boolean;
  supportsQuantity: boolean;
  supportsPrice: boolean;
  supportsRecurringService: boolean;
};

export type MarketplaceVertical = {
  id: VerticalId;
  uiSlug: VerticalUiSlug;
  label: string;
  description: string;
  listingKind: ListingKind;
  searchQuery: string;
  capabilities: CategoryCapabilities;
  attributes: readonly AttributeDefinition[];
};

export type AttributeValues = Record<string, string | number | boolean | string[] | undefined>;

export type AttributeValidationIssue = {
  key: string;
  code:
    | "unknown_category"
    | "required"
    | "invalid_type"
    | "invalid_enum"
    | "min"
    | "max"
    | "range_order";
  message: string;
};

export type AttributeValidationResult =
  | { ok: true }
  | { ok: false; issues: AttributeValidationIssue[] };
