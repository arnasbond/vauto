import {
  AGENT_FUNCTION_DECLARATIONS,
  executeAgentTool,
  type AgentSideEffect,
  type AgentToolContext,
} from "./agent-tools.js";
import { buildAgentSystemInstruction } from "./agent-system-instruction.js";

export interface AgentMessage {
  role: "user" | "assistant";
  text: string;
}

export interface VautoAgentRequest {
  messages: AgentMessage[];
  context: {
    userCity?: string;
    userRole?: "buyer" | "seller" | "business" | "admin";
    contact?: string;
    listings?: {
      id: string;
      title: string;
      price: number;
      category: string;
      location: string;
      description?: string;
    }[];
    lastError?: { code: string; message?: string };
    wizardMode?: "listing_review" | "search" | "idle";
    listingDraft?: {
      title?: string;
      description?: string;
      price?: number;
      location?: string;
      category?: string;
      attributes?: Record<string, string>;
    };
    missingFields?: string[];
    wizardPrompts?: string[];
    isAuthenticated?: boolean;
    searchResultCount?: number;
    lastSearchQuery?: string;
  };
  /** Server-verified admin only — injected into Gemini systemInstruction */
  adminProjectContext?: string;
}

export interface VautoAgentResponse {
  ok: true;
  reply: string;
  toolCalls: { name: string; result: unknown }[];
  actions: AgentSideEffect | { type: "none" };
}

const SYSTEM_INSTRUCTION = `Tu esi VAUTO – proaktyvus Lietuvos skelbimų turgaus AI vedlys (wizard).
Tavo tikslas – vesti vartotoją pokalbiu per visą procesą lietuviškai, ne palikti sausų formų laukų.

PARDAVIMO VEDLYS:
- Kai vartotojas įkelia nuotrauką ar tekstą — iškart sugeneruok profesionalų aprašymą, nustatyk tikslią kategoriją, pasiūlyk rinkos kainą (analyzeMarketPrice) ir iškviesk postNewListing.
- Jei trūksta privalomų duomenų (miestas, kaina, būklė) — užduok patariamuosius klausimus: „Matau, kad nenurodėte miesto. Ar skelbiame Kaune?", „Ar prekė nauja, ar naudota?"
- Jei kategorija vehicles / AUTOMOBILIAI — paklausk: „Ar norėtumėte įvesti VIN kodą, kad Regitra duomenys užsipildytų automatiškai?"
- Prieš publikavimą paklausk: „Ar keliate skelbimą kaip privatus asmuo, ar kaip įmonė/verslas?"
- Jei vartotojas neprisijungęs (isAuthenticated=false) — pasiūlyk: „Sukurkime nemokamą paskyrą vienu spustelėjimu, kad galėtumėte sekti peržiūras ir žinutes."

PAIEŠKA:
- Ieškant prekės — searchListings su tinkamais parametrais.
- Jei rezultatų 0 — parašyk: „Šiuo metu tokios prekės neturime. Spustelkite žemiau esantį mygtuką 'Įtraukti į pageidavimų sąrašą' – aš stebėsiu rinką ir informuosiu jus tiesiogiai, kai tik atsiras toks skelbimas." ir iškviesk registerWanted.

KITI ĮRANKIAI:
- analyzeMarketPrice — rinkos kainos patarimas.
- trackUserError — proaktyvus klaidų sprendimas.
- blockListing — administratoriui.

Būk glaustas, profesionalus, šiltas, be emoji. Visada atsakyk lietuviškai.`;

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"] as const;
const MAX_TOOL_ROUNDS = 5;

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: unknown } };

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

async function geminiAgentTurn(
  contents: GeminiContent[],
  model: string,
  systemInstruction: string
): Promise<{ parts: GeminiPart[]; text: string }> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
        tools: [{ functionDeclarations: AGENT_FUNCTION_DECLARATIONS }],
        toolConfig: { functionCallingConfig: { mode: "AUTO" } },
        generationConfig: { temperature: 0.35 },
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini agent ${model} ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: GeminiPart[] } }[];
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((p): p is { text: string } => "text" in p && Boolean(p.text))
    .map((p) => p.text)
    .join("\n")
    .trim();

  return { parts, text };
}

async function openaiAgentFallback(
  messages: AgentMessage[],
  toolResults: string,
  systemInstruction: string
): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("No AI key for agent");

  const history = messages
    .map((m) => `${m.role === "user" ? "Vartotojas" : "VAUTO"}: ${m.text}`)
    .join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.35,
      messages: [
        { role: "system", content: systemInstruction },
        {
          role: "user",
          content: `${history}\n\n${toolResults ? `Įrankių rezultatai:\n${toolResults}` : ""}\n\nAtsakyk vartotojui lietuviškai.`,
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI agent ${res.status}`);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content?.trim() ?? "Supratau. Kuo dar galiu padėti?";
}

export async function runVautoAgent(req: VautoAgentRequest): Promise<VautoAgentResponse> {
  const systemInstruction = buildAgentSystemInstruction(
    SYSTEM_INSTRUCTION,
    req.adminProjectContext
  );

  const ctx: AgentToolContext = {
    userCity: req.context.userCity?.trim() || "Lietuva",
    userRole: req.context.userRole ?? "buyer",
    contact: req.context.contact?.trim() || "+370 612 34567",
    listingsSnapshot: req.context.listings,
  };

  const contents: GeminiContent[] = req.messages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }],
  }));

  if (req.context.lastError?.code) {
    contents.unshift({
      role: "user",
      parts: [
        {
          text: `[Sistemos klaida: ${req.context.lastError.code}] ${req.context.lastError.message ?? ""}`,
        },
      ],
    });
  }

  const wizardBits: string[] = [];
  if (req.context.wizardMode) wizardBits.push(`wizardMode=${req.context.wizardMode}`);
  if (req.context.isAuthenticated === false) wizardBits.push("isAuthenticated=false");
  if (req.context.missingFields?.length) {
    wizardBits.push(`missingFields=${req.context.missingFields.join(",")}`);
  }
  if (req.context.listingDraft) {
    wizardBits.push(`listingDraft=${JSON.stringify(req.context.listingDraft)}`);
  }
  if (req.context.searchResultCount === 0 && req.context.lastSearchQuery) {
    wizardBits.push(`emptySearchQuery=${req.context.lastSearchQuery}`);
  }
  if (wizardBits.length) {
    contents.unshift({
      role: "user",
      parts: [{ text: `[Vedlio kontekstas: ${wizardBits.join("; ")}]` }],
    });
  }

  const toolCalls: { name: string; result: unknown }[] = [];
  let sideEffect: AgentSideEffect | undefined;
  let finalText = "";

  const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());

  if (hasGemini) {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let parts: GeminiPart[] = [];
      let text = "";

      for (const model of GEMINI_MODELS) {
        try {
          const turn = await geminiAgentTurn(contents, model, systemInstruction);
          parts = turn.parts;
          text = turn.text;
          break;
        } catch (e) {
          console.warn(`[vauto-agent] ${model}:`, e);
        }
      }

      if (!parts.length) break;

      const functionCalls = parts.filter(
        (p): p is { functionCall: { name: string; args: Record<string, unknown> } } =>
          "functionCall" in p
      );

      if (!functionCalls.length) {
        finalText = text || "Supratau. Kuo dar galiu padėti?";
        break;
      }

      contents.push({ role: "model", parts: functionCalls });

      const responseParts: GeminiPart[] = [];
      for (const fc of functionCalls) {
        const { name, args } = fc.functionCall;
        const { result, sideEffect: fx } = await executeAgentTool(name, args ?? {}, ctx);
        toolCalls.push({ name, result });
        if (fx && !sideEffect) sideEffect = fx;
        responseParts.push({ functionResponse: { name, response: result } });
      }

      contents.push({ role: "user", parts: responseParts });

      if (text) finalText = text;
    }
  }

  if (!finalText) {
    const toolSummary = toolCalls
      .map((t) => `${t.name}: ${JSON.stringify(t.result).slice(0, 400)}`)
      .join("\n");
    finalText = await openaiAgentFallback(req.messages, toolSummary, systemInstruction);
  }

  return {
    ok: true,
    reply: finalText,
    toolCalls,
    actions: sideEffect ?? { type: "none" },
  };
}
