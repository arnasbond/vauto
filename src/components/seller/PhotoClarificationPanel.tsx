"use client";

import { AgentQuickReplyChips } from "@/components/home/AgentChatBubble";
import {
  buildPhotoClarificationMessage,
  extractVisionChoiceChips,
  shouldClarifyPhotoUpload,
} from "@/lib/vision-choice-chips";
import type { AiExtractedListing } from "@/lib/types";

export function PhotoClarificationPanel({
  draft,
  onSelectChip,
}: {
  draft: AiExtractedListing;
  onSelectChip: (chip: string) => void;
}) {
  if (!shouldClarifyPhotoUpload(draft)) return null;

  const chips = extractVisionChoiceChips(draft, "sell");
  if (chips.length < 2) return null;

  return (
    <div className="photo-clarification-panel mb-4 rounded-xl border border-[var(--vauto-primary)]/20 bg-[var(--vauto-card-bg)] px-3.5 py-3">
      <p className="mb-2 text-[13px] leading-relaxed text-[var(--vauto-text-main)]">
        {buildPhotoClarificationMessage(draft)}
      </p>
      <AgentQuickReplyChips options={chips} onSelect={onSelectChip} embedded />
    </div>
  );
}
