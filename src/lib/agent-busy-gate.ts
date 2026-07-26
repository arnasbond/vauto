import type { WakeWordAgentResult } from "@/lib/voice-intent-engine";

type QueuedSend = {
  text: string;
  options?: {
    skipBusyCheck?: boolean;
    skipUserBubble?: boolean;
    fromSearchBar?: boolean;
    pendingImageUrls?: string[];
  };
  resolve: (result: WakeWordAgentResult) => void;
};

const MAX_QUEUE = 3;
const MAX_BACKGROUND = 1;

/**
 * Synchronous in-flight gate for sendAgentMessage — prevents React busy state races.
 * Foreground turns serialize; skipBusyCheck uses a bounded background lane (max 1).
 *
 * After Vision early_ack, `unlockUiForBackgroundAnalysis()` soft-unlocks the composer
 * while the stream stays in-flight (locked). Follow-ups enqueue without aborting Vision.
 */
export function createAgentBusyGate(onBusyChange: (busy: boolean) => void) {
  let foregroundInFlight = 0;
  let backgroundInFlight = 0;
  let uiSoftUnlocked = false;
  const queue: QueuedSend[] = [];

  const syncBusy = () => {
    const workInFlight = foregroundInFlight > 0 || backgroundInFlight > 0;
    onBusyChange(workInFlight && !uiSoftUnlocked);
  };

  return {
    get locked(): boolean {
      return foregroundInFlight > 0;
    },

    /** True after Vision/doc early_ack — composer must stay usable. */
    get uiSoftUnlocked(): boolean {
      return uiSoftUnlocked;
    },

    tryAcquire(skipBusyCheck?: boolean): boolean {
      if (skipBusyCheck) {
        if (backgroundInFlight >= MAX_BACKGROUND) return false;
        backgroundInFlight += 1;
        syncBusy();
        return true;
      }
      if (foregroundInFlight > 0) return false;
      foregroundInFlight = 1;
      uiSoftUnlocked = false;
      syncBusy();
      return true;
    },

    release(skipBusyCheck?: boolean): void {
      if (skipBusyCheck) {
        backgroundInFlight = Math.max(0, backgroundInFlight - 1);
      } else {
        foregroundInFlight = Math.max(0, foregroundInFlight - 1);
      }
      if (foregroundInFlight === 0 && backgroundInFlight === 0) {
        uiSoftUnlocked = false;
      }
      syncBusy();
    },

    /**
     * Vision / document analysis continues in the background, but the chat
     * input + send button must not stay disabled (matches early_ack copy).
     */
    unlockUiForBackgroundAnalysis(): void {
      if (foregroundInFlight === 0 && backgroundInFlight === 0) return;
      uiSoftUnlocked = true;
      syncBusy();
    },

    enqueue(
      text: string,
      options: QueuedSend["options"],
      resolve: (result: WakeWordAgentResult) => void
    ): "queued" | "full" {
      if (queue.length >= MAX_QUEUE) return "full";
      queue.push({ text, options, resolve });
      return "queued";
    },

    drainNext(): QueuedSend | undefined {
      return queue.shift();
    },

    queueLength(): number {
      return queue.length;
    },
  };
}

export const AGENT_BUSY_MESSAGE = "AI agentas užimtas — bandykite po akimirkos";
export const AGENT_QUEUE_FULL_MESSAGE =
  "Per daug laukiančių užklausų — palaukite akimirką ir bandykite dar kartą.";
