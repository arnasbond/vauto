import type { ReportCategory, ReportMessage, SupportReport, UserProfile } from "@/lib/types";
import { categoryToUrgency, REPORT_CATEGORIES } from "@/lib/reports";

export interface ReportAiAnalysis {
  summary: string;
  suggestedCategory?: ReportCategory;
  suggestedReply: string;
  urgencyNote: string;
  confidence: number;
}

const AUTO_ACK: Record<ReportCategory, string> = {
  fraud:
    "Gavome jūsų pranešimą apie sukčiavimą. Moderacija peržiūrės per 24 val. Jei reikia skubiai — palikite telefono numerį.",
  bad_info:
    "Ačiū už pranešimą apie neteisingą informaciją. Patikrinsime skelbimą ir susisieksime, jei reikės patikslinimų.",
  chat_abuse:
    "Gavome pranešimą apie pokalbio pažeidimą. Peržiūrėsime pokalbio istoriją ir imsimės veiksmų.",
  general_feedback:
    "Ačiū už atsiliepimą! Jūsų pasiūlymas padeda tobulinti Vauto. Atsakysime, kai turėsime naujienų.",
  technical_issue:
    "Gavome techninės problemos pranešimą. Palaikymo komanda peržiūrės ir atsakys per 24 val.",
  account_billing:
    "Gavome pranešimą dėl paskyros ar mokėjimų. Palaikymo komanda susisieks per 1–2 darbo dienas.",
};

const CATEGORY_KEYWORDS: Record<ReportCategory, RegExp[]> = {
  fraud: [/sukčiav|apgav|pavedim|sąskait|pinigų praš/i, /scam|fraud/i],
  bad_info: [/neteising|klaiding|ne tas model|kaina net/i, /melag|fake/i],
  chat_abuse: [/įžeid|grasin|spamas|piktnaudžiav/i, /abuse|insult/i],
  general_feedback: [/pasiūlym|patinka|norėčiau|feedback/i],
  technical_issue: [/neveik|klaida|bug|strig|lūž|crash|error|neįsikrauna/i],
  account_billing: [/mokėj|pinigin|wallet|sąskait|prenumerat|apmokė/i],
};

export function analyzeReportText(
  comment: string,
  selectedCategory: ReportCategory
): ReportAiAnalysis {
  const text = comment.trim();
  let best: ReportCategory = selectedCategory;
  let bestScore = 0;

  for (const [cat, patterns] of Object.entries(CATEGORY_KEYWORDS) as [
    ReportCategory,
    RegExp[],
  ][]) {
    const score = patterns.filter((re) => re.test(text)).length;
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }

  const suggestedCategory = bestScore > 0 && best !== selectedCategory ? best : undefined;
  const catLabel =
    REPORT_CATEGORIES.find((c) => c.id === (suggestedCategory ?? selectedCategory))?.label ??
    selectedCategory;

  const urgencyNote =
    selectedCategory === "fraud" || selectedCategory === "chat_abuse"
      ? "Kritinis prioritetas — rekomenduojama reaguoti per 4 val."
      : selectedCategory === "technical_issue"
        ? "Techninė problema — patikrinkite ar kartojasi."
        : "Standartinis SLA: iki 24 val.";

  const suggestedReply = buildAdminReplyDraft(selectedCategory, text);

  return {
    summary: `Kategorija: ${catLabel}. ${urgencyNote}${
      suggestedCategory ? ` AI siūlo perkelti į „${REPORT_CATEGORIES.find((c) => c.id === suggestedCategory)?.label}“.` : ""
    }`,
    suggestedCategory,
    suggestedReply,
    urgencyNote,
    confidence: Math.min(0.95, 0.45 + bestScore * 0.2),
  };
}

export function buildAdminReplyDraft(
  category: ReportCategory,
  comment: string
): string {
  const snippet = comment.slice(0, 80).trim();
  switch (category) {
    case "fraud":
      return `Sveiki, gavome jūsų pranešimą dėl galimo sukčiavimo („${snippet}…“). Laikinai sustabdėme skelbimą peržiūrai. Papildomai informuokite, jei buvo prašyta pervesti pinigus.`;
    case "chat_abuse":
      return `Sveiki, peržiūrėjome pokalbio fragmentą. Jei situacija kartosis — praneškite dar kartą. Galime apriboti vartotojo prieigą.`;
    case "bad_info":
      return `Sveiki, patikrinsime skelbimo duomenis ir prireikus paprašysime pardavėjo patikslinti informaciją.`;
    case "technical_issue":
      return `Sveiki, ačiū už pranešimą apie techninę problemą. Ar galite patikslinti įrenginį ir veiksmus iki klaidos?`;
    case "account_billing":
      return `Sveiki, peržiūrėsime jūsų paskyros / mokėjimo užklausą ir atsakysime el. paštu ar telefonu.`;
    default:
      return `Sveiki, ačiū už atsiliepimą! Įrašėme jūsų pasiūlymą produkto komandai.`;
  }
}

export function getAutoAckMessage(category: ReportCategory): string {
  return AUTO_ACK[category];
}

export function enrichNewReport(
  data: {
    category: ReportCategory;
    comment: string;
    listingId?: string;
    listingTitle?: string;
    chatId?: string;
    reportedUserId?: string;
    chatPreview?: string;
  },
  user: UserProfile
): SupportReport {
  const createdAt = new Date().toISOString();
  const analysis = analyzeReportText(data.comment, data.category);
  const category = analysis.suggestedCategory ?? data.category;
  const autoAck = getAutoAckMessage(category);

  const userMessage: ReportMessage = {
    id: `rm-${Date.now()}-user`,
    senderId: user.id,
    senderName: user.name,
    role: "user",
    text: data.comment,
    timestamp: createdAt,
  };

  const systemMessage: ReportMessage = {
    id: `rm-${Date.now()}-auto`,
    senderId: "vauto-system",
    senderName: "Vauto",
    role: "system",
    text: autoAck,
    timestamp: new Date(Date.now() + 500).toISOString(),
    auto: true,
  };

  return {
    id: `rep-${Date.now()}`,
    reporterId: user.id,
    reporterName: user.name,
    reporterEmail: user.email,
    reporterPhone: user.phone,
    category,
    urgency: categoryToUrgency(category),
    status: "open",
    comment: data.comment,
    listingId: data.listingId,
    listingTitle: data.listingTitle,
    chatId: data.chatId,
    reportedUserId: data.reportedUserId,
    chatPreview: data.chatPreview,
    createdAt,
    updatedAt: createdAt,
    messages: [userMessage, systemMessage],
    aiSummary: analysis.summary,
    aiSuggestedReply: analysis.suggestedReply,
    unreadByAdmin: true,
    unreadByReporter: false,
  };
}

export function appendUserReply(
  report: SupportReport,
  user: UserProfile,
  text: string
): SupportReport {
  const message: ReportMessage = {
    id: `rm-${Date.now()}-user`,
    senderId: user.id,
    senderName: user.name,
    role: "user",
    text,
    timestamp: new Date().toISOString(),
  };
  return {
    ...report,
    comment: text,
    messages: [...(report.messages ?? []), message],
    updatedAt: message.timestamp,
    unreadByAdmin: true,
    unreadByReporter: false,
  };
}

export function appendAdminReply(
  report: SupportReport,
  admin: UserProfile,
  text: string,
  auto = false
): SupportReport {
  const message: ReportMessage = {
    id: `rm-${Date.now()}-admin`,
    senderId: admin.id,
    senderName: admin.name,
    role: auto ? "ai" : "admin",
    text,
    timestamp: new Date().toISOString(),
    auto,
  };
  return {
    ...report,
    messages: [...(report.messages ?? []), message],
    updatedAt: message.timestamp,
    unreadByAdmin: false,
    unreadByReporter: true,
  };
}

export function reportMetadata(report: SupportReport): Record<string, unknown> {
  return {
    reporterEmail: report.reporterEmail,
    reporterPhone: report.reporterPhone,
    reportedUserName: report.reportedUserName,
    messages: report.messages ?? [],
    aiSummary: report.aiSummary,
    aiSuggestedReply: report.aiSuggestedReply,
    unreadByAdmin: report.unreadByAdmin ?? false,
    unreadByReporter: report.unreadByReporter ?? false,
    updatedAt: report.updatedAt ?? report.createdAt,
  };
}

export function applyReportMetadata(
  report: SupportReport,
  metadata: Record<string, unknown> | null | undefined
): SupportReport {
  if (!metadata || typeof metadata !== "object") return report;
  return {
    ...report,
    reporterEmail: (metadata.reporterEmail as string) ?? report.reporterEmail,
    reporterPhone: (metadata.reporterPhone as string) ?? report.reporterPhone,
    reportedUserName: (metadata.reportedUserName as string) ?? report.reportedUserName,
    messages: (metadata.messages as ReportMessage[]) ?? report.messages ?? [],
    aiSummary: (metadata.aiSummary as string) ?? report.aiSummary,
    aiSuggestedReply: (metadata.aiSuggestedReply as string) ?? report.aiSuggestedReply,
    unreadByAdmin: (metadata.unreadByAdmin as boolean) ?? report.unreadByAdmin,
    unreadByReporter:
      (metadata.unreadByReporter as boolean) ?? report.unreadByReporter,
    updatedAt: (metadata.updatedAt as string) ?? report.updatedAt,
  };
}
