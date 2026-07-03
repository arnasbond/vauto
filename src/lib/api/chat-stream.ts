import { getDataApiBaseUrl } from "@/lib/api/config";
import { getAuthHeaders } from "@/lib/auth/session";
import type { ChatThread } from "@/lib/types";

export type ChatStreamEvent =
  | { type: "connected" }
  | { type: "chat_message"; thread: ChatThread }
  | { type: "chat_updated"; thread: ChatThread };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function connectChatStream(
  onEvent: (event: ChatStreamEvent) => void,
  onStatus?: (connected: boolean) => void
): () => void {
  const base = getDataApiBaseUrl();
  if (!base || typeof window === "undefined") return () => {};

  let aborted = false;
  let controller = new AbortController();

  async function readStream(): Promise<void> {
    while (!aborted) {
      try {
        const res = await fetch(`${base}/api/chats/stream`, {
          headers: {
            ...getAuthHeaders(),
            Accept: "text/event-stream",
          },
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          onStatus?.(false);
          await sleep(5000);
          continue;
        }

        onStatus?.(true);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";

          for (const chunk of chunks) {
            const dataLine = chunk
              .split("\n")
              .find((line) => line.startsWith("data: "));
            if (!dataLine) continue;
            try {
              onEvent(JSON.parse(dataLine.slice(6)) as ChatStreamEvent);
            } catch {
              /* ignore malformed */
            }
          }
        }
      } catch {
        if (aborted) break;
        onStatus?.(false);
        await sleep(4000);
      }
    }
  }

  void readStream();

  return () => {
    aborted = true;
    controller.abort();
    controller = new AbortController();
    onStatus?.(false);
  };
}
