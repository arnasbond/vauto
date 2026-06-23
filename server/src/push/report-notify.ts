import { getAdminUserIds } from "../repository.js";
import type { ApiSupportReport } from "../types.js";
import { notifyUsersFcm } from "./fcm.js";
import {
  emailAdminsNewReport,
  emailAdminsUserFollowUp,
  emailReporterReply,
} from "./report-email.js";
import { sendWebPushToUsers } from "./web-push.js";

function lastStaffMessage(report: ApiSupportReport): string | null {
  const messages = report.messages;
  if (!Array.isArray(messages) || !messages.length) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as { role?: string; text?: string };
    if (msg.role === "admin" || msg.role === "ai" || msg.role === "system") {
      return typeof msg.text === "string" ? msg.text : null;
    }
  }
  return null;
}

export async function notifyAdminsNewReport(
  report: ApiSupportReport
): Promise<void> {
  const adminIds = await getAdminUserIds();
  const tasks: Promise<unknown>[] = [emailAdminsNewReport(report)];
  if (adminIds.length) {
    tasks.push(
      sendWebPushToUsers(adminIds, {
        title: "Vauto — naujas pranešimas",
        body: `${report.reporterName}: ${report.comment.slice(0, 120)}`,
        url: `/profile/?report=${encodeURIComponent(report.id)}`,
        tag: `report-${report.id}`,
      }),
      notifyUsersFcm(adminIds, {
        title: "Vauto — naujas pranešimas",
        body: `${report.reporterName}: ${report.comment.slice(0, 120)}`,
        url: `/profile/?report=${encodeURIComponent(report.id)}`,
      })
    );
  }
  await Promise.allSettled(tasks);
}

export async function notifyReporterReply(
  report: ApiSupportReport
): Promise<void> {
  const preview = lastStaffMessage(report);
  if (!preview) return;

  await Promise.allSettled([
    sendWebPushToUsers([report.reporterId], {
      title: "Vauto — atsakymas į pranešimą",
      body: preview.slice(0, 140),
      url: `/profile/?support=${encodeURIComponent(report.id)}`,
      tag: `report-reply-${report.id}`,
    }),
    notifyUsersFcm([report.reporterId], {
      title: "Vauto — atsakymas į pranešimą",
      body: preview.slice(0, 140),
      url: `/profile/?support=${encodeURIComponent(report.id)}`,
    }),
    emailReporterReply(report, preview),
  ]);
}

export async function notifyAdminsUserFollowUp(
  report: ApiSupportReport
): Promise<void> {
  const adminIds = await getAdminUserIds();
  const tasks: Promise<unknown>[] = [emailAdminsUserFollowUp(report)];
  if (adminIds.length) {
    tasks.push(
      sendWebPushToUsers(adminIds, {
        title: "Vauto — papildymas prie pranešimo",
        body: `${report.reporterName}: ${report.comment.slice(0, 120)}`,
        url: `/profile/?report=${encodeURIComponent(report.id)}`,
        tag: `report-followup-${report.id}`,
      }),
      notifyUsersFcm(adminIds, {
        title: "Vauto — papildymas prie pranešimo",
        body: `${report.reporterName}: ${report.comment.slice(0, 120)}`,
        url: `/profile/?report=${encodeURIComponent(report.id)}`,
      })
    );
  }
  await Promise.allSettled(tasks);
}
