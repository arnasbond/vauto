"use client";

import {
  buildAssistantPrompt,
  getAdaptiveConfig,
  getMissingCriticalFields,
  listingToAdaptiveKey,
} from "@/lib/adaptive-categories";
import type { AiExtractedListing } from "@/lib/types";
import { AiAssistantPrompt } from "./AiAssistantPrompt";
import { BaseFieldsEditor } from "./BaseFieldsEditor";
import { CategoryFieldsEditor } from "./CategoryFieldsEditor";
import { ConfirmationShell } from "./ConfirmationShell";

interface AdaptiveConfirmationProps {
  draft: AiExtractedListing;
  previewImage: string | null;
  onUpdate: (patch: Partial<AiExtractedListing>) => void;
  onAttributeChange: (key: string, value: string | string[]) => void;
  onCancel: () => void;
  onPublish: () => void;
}

export function AdaptiveConfirmation({
  draft,
  previewImage,
  onUpdate,
  onAttributeChange,
  onCancel,
  onPublish,
}: AdaptiveConfirmationProps) {
  const adaptiveKey = listingToAdaptiveKey(draft.category);
  const config = getAdaptiveConfig(adaptiveKey);
  const attributes = draft.attributes ?? {};
  const needsPrice = draft.price <= 0;

  const missingKeys = getMissingCriticalFields(adaptiveKey, attributes, {
    price: draft.price,
    description: draft.description,
  });
  const assistantMessage = buildAssistantPrompt(adaptiveKey, missingKeys);
  const canPublish = missingKeys.length === 0;

  const publishLabel = !canPublish
    ? "Užpildykite privalomus laukus"
    : needsPrice
      ? "Įveskite kainą"
      : "Taip, viskas gerai — Publikuoti";

  const layoutMap = {
    "technical-grid": "grid" as const,
    "tag-social": "tags" as const,
    "service-profile": "stack" as const,
    "estate-sheet": "sheet" as const,
    universal: "stack" as const,
  };

  const categorySection = config.fields.length > 0 && (
    <div className="mb-4">
      {config.layout === "technical-grid" && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Techninė specifikacija
        </p>
      )}
      {config.layout === "estate-sheet" && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          NT parametrai
        </p>
      )}
      {config.layout === "service-profile" && (
        <div className="mb-3 rounded-xl border border-[var(--vauto-blue)]/30 bg-[var(--vauto-blue)]/10 p-3">
          <p className="text-xs font-medium text-[var(--vauto-blue)]">
            Paslaugų teikėjo profilis
          </p>
        </div>
      )}
      <CategoryFieldsEditor
        fields={config.fields}
        attributes={attributes}
        onChange={onAttributeChange}
        layout={layoutMap[config.layout]}
        missingKeys={missingKeys}
      />
    </div>
  );

  const baseFields = config.baseFields.filter(
    (f) => f !== "description" || adaptiveKey === "universal"
  );

  return (
    <ConfirmationShell
      config={config}
      draft={draft}
      previewImage={previewImage}
      needsPrice={needsPrice}
      canPublish={canPublish && !needsPrice}
      publishLabel={publishLabel}
      onCancel={onCancel}
      onPublish={onPublish}
      assistantPrompt={
        assistantMessage ? (
          <AiAssistantPrompt message={assistantMessage} />
        ) : null
      }
    >
      {categorySection}
      {adaptiveKey === "universal" && (
        <BaseFieldsEditor
          draft={draft}
          fields={config.baseFields}
          needsPrice={needsPrice}
          onUpdate={onUpdate}
        />
      )}
      {adaptiveKey !== "universal" && (
        <BaseFieldsEditor
          draft={draft}
          fields={baseFields as ("title" | "price" | "location" | "contact")[]}
          needsPrice={needsPrice}
          onUpdate={onUpdate}
          variant="compact"
        />
      )}
    </ConfirmationShell>
  );
}
