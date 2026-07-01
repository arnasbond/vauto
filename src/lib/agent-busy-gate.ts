import type { WakeWordAgentResult } from "@/lib/voice-intent-engine";

type QueuedSend = {
  text: string;
  options?: {
    skipBusyCheck?: boolean;
    fromSearchBar?: boolean;
    pendingImageUrls?: string[];
  };
  resolve: (result: WakeWordAgentResult) => void;
};

const MAX_QUEUE = 3;

/**
 * Synchronous in-flight gate for sendAgentMessage — prevents React busy state races.
 * Optional FIFO queue for non-skip requests that arrive while agent is working.
 */
export function createAgentBusyGate(onBusyChange: (busy: boolean) => void) {
  let inFlight = 0;
  const queue: QueuedSend[] = [];

  const syncBusy = () => {
    onBusyChange(inFlight > 0);
  };

  return {
    get locked(): boolean {
      return inFlight > 0;
    },

    tryAcquire(skipBusyCheck?: boolean): boolean {
      if (skipBusyCheck) return true;
      if (inFlight > 0) return false;
      inFlight = 1;
      syncBusy();
      return true;
    },

    release(skipBusyCheck?: boolean): void {
      if (skipBusyCheck) return;
      inFlight = Math.max(0, inFlight - 1);
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
