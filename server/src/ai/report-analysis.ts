import type { ApiSupportReport } from "../types.js";

const REPORT_CATEGORIES = new Set([
  "fraud",
  "bad_info",
  "chat_abuse",
  "general_feedback",
  "technical_issue",
  "account_billing",
]);

const CATEGORY_LABELS: Record<string, string> = {
  fraud: "Sukčiavimas",
  bad_info: "Neteisinga informacija",
  chat_abuse: "Piktnaudžiavimas pokalbyje",
  general_feedback: "Bendras atsiliepimas",
  technical_issue: "Techninė problema",
  account_billing: "Paskyra ir mokėjimai",
};

const CATEGORY_KEYWORDS: Record<string, RegExp[]> = {
  fraud: [/sukčiav|apgav|pavedim|sąskait|pinigų praš/i, /scam|fraud/i],
  bad_info: [/neteising|klaiding|ne tas model|kaina net/i, /melag|fake/i],
  chat_abuse: [/įžeid|grasin|spamas|piktnaudžiav/i, /abuse|insult/i],
  general_feedback: [/pasiūlym|patinka|norėčiau|feedback/i],
  technical_issue: [/neveik|klaida|bug|strig|lūž|crash|error|neįsikrauna/i],
  account_billing: [/mokėj|pinigin|wallet|sąskait|prenumerat|apmokė/i],
};

export interface ReportAiAnalysis {
  category: string;
  summary: string;
  suggestedReply: string;
  urgencyNote: string;
  confidence: number;
  aiPowered: boolean;
}

export function categoryToUrgency(category: string): string {
  if (category === "fraud" || category === "chat_abuse") return "critical";
  if (category === "bad_info" || category === "account_billing") return "feedback";
  return "general";
}

function buildReplyDraft(category: string, comment: string): string {
  const snippet = comment.slice(0, 80).trim();
  switch (category) {
    case "fraud":
      return `Sveiki, gavome jūsų pranešimą dėl galimo sukčiavimo („${snippet}…“). Laikinai sustabdėme skelbimą peržiūrai.`;
    case "chat_abuse":
      return `Sveiki, peržiūrėjome pokalbio fragmentą. Jei situacija kartosis — praneškite dar kartą.`;
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

function urgencyNoteFor(category: string): string {
  if (category === "fraud" || category === "chat_abuse") {
    return "Kritinis prioritetas — rekomenduojama reaguoti per 4 val.";
  }
  if (category === "technical_issue") {
    return "Techninė problema — patikrinkite ar kartojasi.";
  }
  return "Standartinis SLA: iki 24 val.";
}

function analyzeWithRules(input: {
  comment: string;
  category: string;
}): ReportAiAnalysis {
  const text = input.comment.trim();
  let best = input.category;
  let bestScore = 0;

  for (const [cat, patterns] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = patterns.filter((re) => re.test(text)).length;
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }

  const category =
    bestScore > 0 && REPORT_CATEGORIES.has(best) ? best : input.category;
  const catLabel = CATEGORY_LABELS[category] ?? category;
  const note = urgencyNoteFor(category);

  return {
    category,
    summary: `Kategorija: ${catLabel}. ${note}`,
    suggestedReply: buildReplyDraft(category, text),
    urgencyNote: note,
    confidence: Math.min(0.95, 0.45 + bestScore * 0.2),
    aiPowered: false,
  };
}

async function chatJson(
  key: string,
  messages: object[]
): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages,
      temperature: 0.2,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty OpenAI response");
  return JSON.parse(content) as Record<string, unknown>;
}

async function analyzeWithOpenAI(
  key: string,
  input: {
    comment: string;
    category: string;
    listingTitle?: string;
    chatPreview?: string;
  }
): Promise<ReportAiAnalysis> {
  const raw = await chatJson(key, [
    {
      role: "system",
      content: `Tu esi Vauto moderacijos asistentas. Analizuok vartotojo pranešimą lietuviškai.
Grąžink JSON:
{
  "category": "fraud|bad_info|chat_abuse|general_feedback|technical_issue|account_billing",
  "summary": "1-2 sakiniai administratoriui",
  "suggestedReply": "profesionalus atsakymas vartotojui lietuviškai",
  "urgencyNote": "SLA / prioriteto pastaba lietuviškai",
  "confidence": 0.0-1.0
}`,
    },
    {
      role: "user",
      content: `Pasirinkta kategorija: ${input.category}
Skelbimas: ${input.listingTitle ?? "—"}
Pokalbio fragmentas: ${input.chatPreview ?? "—"}
Pranešimas: ${input.comment}`,
    },
  ]);

  const category = REPORT_CATEGORIES.has(String(raw.category))
    ? String(raw.category)
    : input.category;

  return {
    category,
    summary: String(raw.summary ?? "").slice(0, 2000),
    suggestedReply: String(raw.suggestedReply ?? buildReplyDraft(category, input.comment)).slice(
      0,
      4000
    ),
    urgencyNote: String(raw.urgencyNote ?? urgencyNoteFor(category)).slice(0, 500),
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0.75)),
    aiPowered: true,
  };
}

export async function analyzeReportWithAi(input: {
  comment: string;
  category: string;
  listingTitle?: string;
  chatPreview?: string;
}): Promise<ReportAiAnalysis> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (key) {
    try {
      return await analyzeWithOpenAI(key, input);
    } catch {
      /* rule fallback */
    }
  }
  return analyzeWithRules(input);
}

export function applyAnalysisToReport(
  report: ApiSupportReport,
  analysis: ReportAiAnalysis
): ApiSupportReport {
  return {
    ...report,
    category: analysis.category,
    urgency: categoryToUrgency(analysis.category),
    aiSummary: analysis.summary,
    aiSuggestedReply: analysis.suggestedReply,
    aiPowered: analysis.aiPowered,
    updatedAt: new Date().toISOString(),
  };
}
