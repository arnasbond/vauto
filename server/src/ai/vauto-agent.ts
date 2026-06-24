import {
  AGENT_FUNCTION_DECLARATIONS,
  executeAgentTool,
  type AgentSideEffect,
  type AgentToolContext,
} from "./agent-tools.js";
import { buildAgentSystemInstruction } from "./agent-system-instruction.js";
import {
  resolveGeminiApiKey,
} from "../load-env.js";
import {
  AgentRouteError,
  fetchWithTimeout,
  isAbortError,
} from "./agent-errors.js";

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
    currentView?: string;
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
- Jei kategorija vehicles / AUTOMOBILIAI — iš balso ar teksto VISADA ištrauk make (markė), model (modelis), year (metai) ir perduok postNewListing (atskirais laukais arba attributes). Pvz. „BMW 520 2018“ → make=BMW, model=520, year=2018, category=vehicles.
- Automobiliams paklausk: „Ar norėtumėte įvesti VIN kodą, kad Regitra duomenys užsipildytų automatiškai?"
- Prieš publikavimą paklausk: „Ar keliate skelbimą kaip privatus asmuo, ar kaip įmonė/verslas?"
- Jei vartotojas neprisijungęs (isAuthenticated=false) — pasiūlyk: „Sukurkime nemokamą paskyrą vienu spustelėjimu, kad galėtumėte sekti peržiūras ir žinutes."

PAIEŠKA:
- Ieškant prekės — searchListings su tinkamais parametrais.
- Jei rezultatų 0 — parašyk: „Šiuo metu tokios prekės neturime. Spustelkite žemiau esantį mygtuką 'Įtraukti į pageidavimų sąrašą' – aš stebėsiu rinką ir informuosiu jus tiesiogiai, kai tik atsiras toks skelbimas." ir iškviesk registerWanted.

KITI ĮRANKIAI:
- analyzeMarketPrice — rinkos kainos patarimas.
- trackUserError — proaktyvus klaidų sprendimas.
- blockListing — administratoriui.
- showZeroUiScreen — pagrindinis Zero-UI ekranas (marketplace, listing_preview, business_dashboard, admin_panel).
- navigate_view — legacy perjungimas (pageidavimui naudok showZeroUiScreen).

KETINIMO ATPAŽINIMAS (PRIVALOMA — nekeisk paieška, jei vartotojas nori kelti skelbimą):
- Pardavimas / skelbimo kėlimas („noriu kelti skelbimą“, „parduodu“, „įdėti skelbimą“) → postNewListing + showZeroUiScreen(listing_preview). NIEKADA searchListings.
- Paieška / pirkimas → searchListings + showZeroUiScreen(marketplace).
- Verslo statistika („mano skelbimų statistika“, „peržiūros“, „skambučiai“) → showZeroUiScreen(business_dashboard).
- Admin moderavimas („patvirtinti skelbimus“, „moderuoti“) → showZeroUiScreen(admin_panel) (tik admin).
- Jei vartotojas aiškiai nori kelti skelbimą — nepridėk žodžio „ieškoti“ ir nekeisk jo užklausos į paieškos režimą.

Būk glaustas, profesionalus, šiltas, be emoji. Visada atsakyk lietuviškai.`;

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"] as const;
const MAX_TOOL_ROUNDS = 5;
const GEMINI_AGENT_TIMEOUT_MS = 28_000;

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
  const key = resolveGeminiApiKey();
  if (!key) {
    throw new AgentRouteError(
      "agent_unavailable",
      "GEMINI_API_KEY not configured on server",
      503
    );
  }

  try {
    const res = await fetchWithTimeout(
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
      },
      GEMINI_AGENT_TIMEOUT_MS
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new AgentRouteError(
        "gemini_error",
        `Gemini ${model} returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
        res.status >= 500 ? 502 : 503
      );
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
  } catch (e) {
    if (e instanceof AgentRouteError) throw e;
    if (isAbortError(e)) {
      throw new AgentRouteError(
        "timeout",
        "Gemini API užklausa užtruko. Sumažinkite admin kontekstą arba bandykite vėliau.",
        504
      );
    }
    throw new AgentRouteError(
      "gemini_error",
      e instanceof Error ? e.message : "Gemini API klaida",
      502
    );
  }
}

export async function runVautoAgent(req: VautoAgentRequest): Promise<VautoAgentResponse> {
  try {
    return await runVautoAgentInner(req);
  } catch (e) {
    if (e instanceof AgentRouteError) throw e;
    throw new AgentRouteError(
      "agent_unavailable",
      e instanceof Error ? e.message : "AI agentas laikinai nepasiekiamas",
      503
    );
  }
}

async function runVautoAgentInner(req: VautoAgentRequest): Promise<VautoAgentResponse> {
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
  if (req.context.currentView) {
    wizardBits.push(`currentView=${req.context.currentView}`);
  }
  if (wizardBits.length) {
    contents.unshift({
      role: "user",
      parts: [{ text: `[Vedlio kontekstas: ${wizardBits.join("; ")}]` }],
    });
  }

  const toolCalls: { name: string; result: unknown }[] = [];
  let sideEffect: AgentSideEffect | undefined;
  let navigateEffect: AgentSideEffect | undefined;
  let finalText = "";

  const hasGemini = Boolean(resolveGeminiApiKey());
  let lastGeminiError: AgentRouteError | null = null;

  if (!hasGemini) {
    throw new AgentRouteError(
      "agent_unavailable",
      "GEMINI_API_KEY nenustatytas serveryje",
      503
    );
  }

  if (hasGemini) {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let parts: GeminiPart[] = [];
      let text = "";

      for (const model of GEMINI_MODELS) {
        try {
          const turn = await geminiAgentTurn(contents, model, systemInstruction);
          parts = turn.parts;
          text = turn.text;
          lastGeminiError = null;
          break;
        } catch (e) {
          lastGeminiError =
            e instanceof AgentRouteError
              ? e
              : new AgentRouteError(
                  "gemini_error",
                  e instanceof Error ? e.message : "Gemini API klaida",
                  502
                );
          console.warn(`[vauto-agent] ${model}:`, lastGeminiError.message);
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
        if (fx) {
          if (fx.type === "navigate") navigateEffect = fx;
          else if (!sideEffect) sideEffect = fx;
        }
        responseParts.push({ functionResponse: { name, response: result } });
      }

      contents.push({ role: "user", parts: responseParts });

      if (text) finalText = text;
    }
  }

  if (!finalText) {
    if (lastGeminiError) {
      throw new AgentRouteError(
        lastGeminiError.code,
        `Gemini API klaida: ${lastGeminiError.message}`,
        lastGeminiError.status
      );
    }
    throw new AgentRouteError(
      "agent_unavailable",
      "Gemini agentas negalėjo sugeneruoti atsakymo. Bandykite dar kartą.",
      503
    );
  }

  if (!finalText.trim()) {
    throw new AgentRouteError(
      "agent_unavailable",
      "AI agentas negalėjo sugeneruoti atsakymo. Bandykite dar kartą.",
      503
    );
  }

  return {
    ok: true,
    reply: finalText,
    toolCalls,
    actions: navigateEffect ?? sideEffect ?? { type: "none" },
  };
}
