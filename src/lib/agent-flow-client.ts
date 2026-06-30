/**
 * Unified client bridge for global agent flow events (P7).
 * Replaces per-vertical notify* hosts with one orchestrated pipeline.
 */
import type { AgentFlowDialogue, AgentFlowEvent } from "@/lib/agent-flow-wizard-orchestrator";
import {
  buildWardrobePhotosReceivedMessage,
  buildWardrobeProfileImportedMessage,
  resolveAgentFlowDialogue,
  wardrobePhotosReceivedChips,
  wardrobeProfileImportedChips,
} from "@/lib/agent-flow-wizard-orchestrator";
import type { AgentGreetingOptions } from "@/lib/vauto-agent-client";

let agentFlowHost: ((dialogue: AgentFlowDialogue) => void) | null = null;

let lastFlowGreetingKey = "";
let lastFlowGreetingAt = 0;

export function registerAgentFlowHost(fn: ((dialogue: AgentFlowDialogue) => void) | null): void {
  agentFlowHost = fn;
}

function pushFlowDialogue(dialogue: AgentFlowDialogue, dedupeKey?: string): void {
  const key = dedupeKey ?? dialogue.message.trim().slice(0, 64);
  const now = Date.now();
  if (key && key === lastFlowGreetingKey && now - lastFlowGreetingAt < 2500) {
    return;
  }
  lastFlowGreetingKey = key;
  lastFlowGreetingAt = now;
  agentFlowHost?.(dialogue);
}

/** Primary API — emit a global flow event; orchestrator resolves message + chips. */
export function notifyAgentFlow(event: AgentFlowEvent): void {
  const dialogue = resolveAgentFlowDialogue(event);
  if (!dialogue) return;
  pushFlowDialogue(dialogue, `${event.kind}:${dialogue.message.slice(0, 40)}`);
}

export function notifyAgentFlowDialogue(
  dialogue: AgentFlowDialogue,
  dedupeKey?: string
): void {
  pushFlowDialogue(dialogue, dedupeKey);
}

// --- Backward-compatible wardrobe bridges ---

export function notifyWardrobeBulkImportOpened(
  message: string,
  options?: Omit<AgentGreetingOptions, "openSheet">
): void {
  pushFlowDialogue(
    { message, openSheet: true, quickReplies: options?.quickReplies },
    `wardrobe_open:${message.slice(0, 40)}`
  );
}

export function notifyWardrobePhotosReceived(itemCount: number, photoCount = 1): void {
  pushFlowDialogue({
    message: buildWardrobePhotosReceivedMessage(itemCount, photoCount),
    openSheet: true,
    quickReplies: wardrobePhotosReceivedChips(itemCount),
  });
}

export function notifyWardrobeProfileImported(itemCount: number): void {
  if (itemCount <= 0) return;
  pushFlowDialogue({
    message: buildWardrobeProfileImportedMessage(itemCount),
    openSheet: true,
    quickReplies: wardrobeProfileImportedChips(itemCount),
  });
}

export function notifyWardrobePublishComplete(publishedCount: number): void {
  notifyAgentFlow({
    kind: "listing_publish_success",
    category: "clothing",
    publishedCount,
  });
}

export function notifyListingPublishComplete(
  category: import("@/lib/types").ListingCategory | undefined,
  publishedCount: number
): void {
  notifyAgentFlow({
    kind: "listing_publish_success",
    category,
    publishedCount,
  });
}
