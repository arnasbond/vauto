import { analyzeReportWithAi, applyAnalysisToReport } from "../ai/report-analysis.js";
import { publishReportEvent } from "../reports/report-bus.js";
import { getReportById, upsertReport } from "../repository.js";
import type { ApiSupportReport } from "../types.js";

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

  const updated = applyAnalysisToReport(report, analysis);
  await upsertReport(updated);
  publishReportEvent("report_updated", updated);
  return updated;
}
