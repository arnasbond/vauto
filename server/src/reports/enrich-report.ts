import {
  analyzeReportWithAi,
  applyAnalysisToReport,
  shouldAutoReply,
} from "../ai/report-analysis.js";
import { notifyReporterReply } from "../push/report-notify.js";
import { publishReportEvent } from "../reports/report-bus.js";
import { getReportById, upsertReport } from "../repository.js";
import type { ApiSupportReport } from "../types.js";

function appendAutoAdminReply(
  report: ApiSupportReport,
  text: string
): ApiSupportReport {
  const message = {
    id: `rm-${Date.now()}-ai-auto`,
    senderId: "vauto-admin-ai",
    senderName: "Vauto komanda",
    role: "ai",
    text,
    timestamp: new Date().toISOString(),
    auto: true,
  };
  const messages = [
    ...(Array.isArray(report.messages) ? report.messages : []),
    message,
  ];
  return {
    ...report,
    messages,
    unreadByAdmin: false,
    unreadByReporter: true,
    updatedAt: message.timestamp,
  };
}

export async function enrichReportWithAi(
  reportOrId: ApiSupportReport | string
): Promise<ApiSupportReport | null> {
  const report =
    typeof reportOrId === "string"
      ? await getReportById(reportOrId)
      : reportOrId;
  if (!report) return null;

  const analysis = await analyzeReportWithAi({
    comment: report.comment,
    category: report.category,
    listingTitle: report.listingTitle,
    chatPreview: report.chatPreview,
  });

  let updated = applyAnalysisToReport(report, analysis);

  if (shouldAutoReply(analysis) && updated.status === "open") {
    updated = appendAutoAdminReply(updated, analysis.suggestedReply);
  }

  await upsertReport(updated);
  publishReportEvent("report_updated", updated);

  if (updated.unreadByReporter) {
    void notifyReporterReply(updated);
  }

  return updated;
}
