import {
  AGENT_FUNCTION_DECLARATIONS,
  executeAgentTool,
  type AgentSideEffect,
  type AgentToolContext,
} from "./agent-tools.js";

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
  };
}

export interface VautoAgentResponse {
  ok: true;
  reply: string;
  toolCalls: { name: string; result: unknown }[];
  actions: AgentSideEffect | { type: "none" };
}

const SYSTEM_INSTRUCTION = `Tu esi VAUTO – išmanusis Lietuvos skelbimų turgaus asistentas.
Tavo tikslas – pilnai aptarnauti vartotoją, verslą ir administratorių lietuviškai.
Jei vartotojas nori parduoti daiktą — išklausyk, surink techninius duomenis, sugeneruok profesionalų skelbimo tekstą ir iškviesk postNewListing įrankį.
Jei ieško prekės — iškviesk searchListings su tinkamais parametrais (kaina, miestas, kategorija).
Jei verslo klientas klausia apie kainą ar peržiūras — naudok analyzeMarketPrice.
Jei fone pastebi sistemos klaidą — trackUserError ir proaktyviai pasiūlyk sprendimą.
Administratoriui — blockListing įtartiniams skelbimams.
Būk glaustas, profesionalus, be emoji. Visada atsakyk lietuviškai.`;

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
  model: string
): Promise<{ parts: GeminiPart[]; text: string }> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
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
  toolResults: string
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
        { role: "system", content: SYSTEM_INSTRUCTION },
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
          const turn = await geminiAgentTurn(contents, model);
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
    finalText = await openaiAgentFallback(req.messages, toolSummary);
  }

  return {
    ok: true,
    reply: finalText,
    toolCalls,
    actions: sideEffect ?? { type: "none" },
  };
}
