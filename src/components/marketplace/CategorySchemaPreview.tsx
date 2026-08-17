"use client";

import {
  canUsePlatformPayment,
  canUseShipping,
  getCategorySchema,
  type VerticalId,
} from "@vauto/shared/marketplace-domain";

export function CategorySchemaPreview({ verticalId }: { verticalId: VerticalId }) {
  const schema = getCategorySchema(verticalId);
  if (!schema) return null;
  const payment = canUsePlatformPayment(verticalId);
  const shipping = canUseShipping(verticalId);

  return (
    <div
      className="mt-3 rounded-2xl border border-[var(--ds-border-subtle)] bg-[var(--ds-surface-card)] px-3 py-3 text-left"
      data-category-schema={schema.id}
      data-listing-kind={schema.listingKind}
    >
      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ds-text-muted)]">
        {schema.label} — laukai
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5" data-schema-attributes>
        {schema.attributes.map((attr) => (
          <li
            key={attr.key}
            data-attr-key={attr.key}
            className="rounded-full border border-[var(--ds-border-subtle)] px-2.5 py-1 text-[12px] text-[var(--ds-text-primary)]"
          >
            {attr.label}
          </li>
        ))}
      </ul>
      {!payment ? (
        <p
          className="mt-2 text-[12px] leading-snug text-[var(--ds-text-muted)]"
          data-no-platform-payment
        >
          Šioje kategorijoje platformos mokėjimas netaikomas.
        </p>
      ) : null}
      {!shipping ? (
        <p
          className="mt-1.5 text-[12px] leading-snug text-[var(--ds-text-muted)]"
          data-no-shipping
        >
          Siunta šiai kategorijai netaikoma.
        </p>
      ) : null}
    </div>
  );
}
