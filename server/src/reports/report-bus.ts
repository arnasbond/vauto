import type { Response } from "express";
import type { ApiSupportReport } from "../types.js";

export type ReportStreamEvent =
  | { type: "connected" }
  | { type: "report_created"; report: ApiSupportReport }
  | { type: "report_updated"; report: ApiSupportReport };

interface StreamClient {
  userId: string;
  role: string;
  res: Response;
  heartbeat: ReturnType<typeof setInterval>;
}

const clients = new Set<StreamClient>();

function shouldReceive(client: StreamClient, report: ApiSupportReport): boolean {
  if (client.role === "admin") return true;
  return client.userId === report.reporterId;
}

function writeEvent(client: StreamClient, event: ReportStreamEvent): void {
  try {
    client.res.write(`data: ${JSON.stringify(event)}\n\n`);
  } catch {
    clients.delete(client);
    clearInterval(client.heartbeat);
  }
}

export function subscribeReportStream(
  userId: string,
  role: string,
  res: Response
): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  const client: StreamClient = {
    userId,
    role,
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

export function publishReportEvent(
  kind: "report_created" | "report_updated",
  report: ApiSupportReport
): void {
  const event: ReportStreamEvent = { type: kind, report };
  for (const client of [...clients]) {
    if (shouldReceive(client, report)) {
      writeEvent(client, event);
    }
  }
}
