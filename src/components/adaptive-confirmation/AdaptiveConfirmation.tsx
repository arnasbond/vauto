"use client";

import {
  buildAssistantPrompt,
  getAdaptiveConfig,
  getMissingCriticalFields,
  listingToAdaptiveKey,
} from "@/lib/adaptive-categories";
import type { AiExtractedListing } from "@/lib/types";
import { verifyVin } from "@/lib/trust";
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

const categoryPanelClass =
  "rounded-2xl border border-white/5 bg-black/20 p-4";

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
      : "Viskas gerai, publikuoti skelbimą";

  const layoutMap = {
    "technical-grid": "grid" as const,
    "tag-social": "tags" as const,
    "service-profile": "stack" as const,
    "estate-sheet": "sheet" as const,
    universal: "stack" as const,
  };

  const vinValue =
    typeof attributes.vin === "string" ? attributes.vin : undefined;
  const vinOk = vinValue ? verifyVin(vinValue) : false;

  const categoryFields = config.fields.filter(
    (f) => !(adaptiveKey === "vehicles" && f.key === "vin" && vinOk)
  );

  const categorySection = categoryFields.length > 0 && (
    <div className={categoryPanelClass}>
      {adaptiveKey === "vehicles" && vinValue && (
        <div className="mb-3 flex flex-col gap-2 border-b border-white/5 pb-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/40">Kėbulo numeris (VIN)</span>
            {vinOk && (
              <span className="text-xs font-bold text-[var(--vauto-teal)]">
                ✅ Patikrintas fone
              </span>
            )}
          </div>
          <input
            type="text"
            value={vinValue}
            readOnly
            className="w-full rounded-lg bg-white/5 p-2 text-xs text-white/60"
          />
        </div>
      )}

      {adaptiveKey === "services" && (
        <p className="mb-3 text-xs text-[var(--vauto-teal)]">
          🛡️ Suteikiamas Verifikuoto Meistro ženkliukas po moderacijos
        </p>
      )}

      <CategoryFieldsEditor
        fields={categoryFields}
        attributes={attributes}
        onChange={onAttributeChange}
        layout={layoutMap[config.layout]}
        missingKeys={missingKeys}
        variant="inline"
      />
    </div>
  );

  const baseFields = config.baseFields.filter(
    (f) => f !== "description" || adaptiveKey === "universal"
  );

  const baseEditor =
    adaptiveKey === "universal" ? (
      <BaseFieldsEditor
        draft={draft}
        fields={config.baseFields}
        needsPrice={needsPrice}
        onUpdate={onUpdate}
        variant="inline"
      />
    ) : (
      <BaseFieldsEditor
        draft={draft}
        fields={baseFields as ("title" | "price" | "location" | "contact")[]}
        needsPrice={needsPrice}
        onUpdate={onUpdate}
        variant="inline"
      />
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
      {baseEditor}
      {categorySection}
    </ConfirmationShell>
  );
}
