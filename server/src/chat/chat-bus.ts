import type { Response } from "express";
import type { ApiChatThread } from "../types.js";

export type ChatStreamEvent =
  | { type: "connected" }
  | { type: "chat_message"; thread: ApiChatThread }
  | { type: "chat_updated"; thread: ApiChatThread };

interface StreamClient {
  userId: string;
  res: Response;
  heartbeat: ReturnType<typeof setInterval>;
}

const clients = new Set<StreamClient>();

function writeEvent(client: StreamClient, event: ChatStreamEvent): void {
  try {
    client.res.write(`data: ${JSON.stringify(event)}\n\n`);
  } catch {
    clients.delete(client);
    clearInterval(client.heartbeat);
  }
}

export function subscribeChatStream(userId: string, res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  const client: StreamClient = {
    userId,
    res,
    heartbeat: setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        clients.delete(client);
        clearInterval(client.heartbeat);
      }
    }, 20_000),
  };

  clients.add(client);
  writeEvent(client, { type: "connected" });

  res.on("close", () => {
    clients.delete(client);
    clearInterval(client.heartbeat);
  });
}

export function publishChatStreamEvent(
  userIds: string[],
  event: Exclude<ChatStreamEvent, { type: "connected" }>
): void {
  const targets = new Set(userIds.filter(Boolean));
  for (const client of [...clients]) {
    if (targets.has(client.userId)) {
      writeEvent(client, event);
    }
  }
}
