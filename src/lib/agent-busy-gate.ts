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
 */
export function createAgentBusyGate(onBusyChange: (busy: boolean) => void) {
  let foregroundInFlight = 0;
  let backgroundInFlight = 0;
  const queue: QueuedSend[] = [];

  const syncBusy = () => {
    onBusyChange(foregroundInFlight > 0 || backgroundInFlight > 0);
  };

  return {
    get locked(): boolean {
      return foregroundInFlight > 0;
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
      syncBusy();
      return true;
    },

    release(skipBusyCheck?: boolean): void {
      if (skipBusyCheck) {
        backgroundInFlight = Math.max(0, backgroundInFlight - 1);
      } else {
        foregroundInFlight = Math.max(0, foregroundInFlight - 1);
      }
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
