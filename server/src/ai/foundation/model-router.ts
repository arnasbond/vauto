/**
 * VAUTO AI Foundation — provider-agnostic model router.
 * Business code must resolve models via this layer (never hardcode Gemini/Claude/OpenAI).
 */

export type AiTaskClass = "FAST" | "VISION" | "REASONING" | "FALLBACK";

export type AiProviderId =
  | "gemini"
  | "openai"
  | "anthropic"
  | "unknown";

export type AiModelRoute = {
  provider: AiProviderId;
  model: string;
  taskClass: AiTaskClass;
  /** True when the primary env for the requested class was missing and FALLBACK was used. */
  fallbackUsed: boolean;
  /** Env key that supplied the model string. */
  sourceEnv: string;
};

const TASK_ENV: Record<Exclude<AiTaskClass, "FALLBACK">, string> = {
  FAST: "AI_MODEL_FAST",
  VISION: "AI_MODEL_VISION",
  REASONING: "AI_MODEL_REASONING",
};

const FALLBACK_ENV = "AI_MODEL_FALLBACK";

/** Infer provider family from a model id string (config only — not a hard dependency). */
export function inferProviderFromModel(model: string): AiProviderId {
  const m = model.trim().toLowerCase();
  if (!m) return "unknown";
  if (m.includes("gemini") || m.startsWith("models/gemini")) return "gemini";
  if (
    m.includes("gpt") ||
    m.includes("o1") ||
    m.includes("o3") ||
    m.includes("o4") ||
    m.startsWith("text-embedding")
  ) {
    return "openai";
  }
  if (m.includes("claude") || m.includes("anthropic")) return "anthropic";
  return "unknown";
}

function readEnv(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env[name];
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type ResolveAiModelOptions = {
  /** Override process.env (tests). */
  env?: NodeJS.ProcessEnv;
  /**
   * When true (default), missing primary model falls back to AI_MODEL_FALLBACK.
   * When false, throws if primary is unset.
   */
  allowFallback?: boolean;
};

/**
 * Resolve provider + model for a task class from env configuration.
 * Does not call any LLM — routing / config only.
 */
export function resolveAiModel(
  taskClass: AiTaskClass,
  options: ResolveAiModelOptions = {}
): AiModelRoute {
  const env = options.env ?? process.env;
  const allowFallback = options.allowFallback !== false;

  if (taskClass === "FALLBACK") {
    const model = readEnv(FALLBACK_ENV, env);
    if (!model) {
      throw new Error(
        `AI model router: ${FALLBACK_ENV} is not configured`
      );
    }
    return {
      provider: inferProviderFromModel(model),
      model,
      taskClass: "FALLBACK",
      fallbackUsed: false,
      sourceEnv: FALLBACK_ENV,
    };
  }

  const primaryEnv = TASK_ENV[taskClass];
  const primary = readEnv(primaryEnv, env);
  if (primary) {
    return {
      provider: inferProviderFromModel(primary),
      model: primary,
      taskClass,
      fallbackUsed: false,
      sourceEnv: primaryEnv,
    };
  }

  if (!allowFallback) {
    throw new Error(
      `AI model router: ${primaryEnv} is not configured and fallback is disabled`
    );
  }

  const fallback = readEnv(FALLBACK_ENV, env);
  if (!fallback) {
    throw new Error(
      `AI model router: ${primaryEnv} missing and ${FALLBACK_ENV} is not configured`
    );
  }

  return {
    provider: inferProviderFromModel(fallback),
    model: fallback,
    taskClass,
    fallbackUsed: true,
    sourceEnv: FALLBACK_ENV,
  };
}

/** Alias required by product stages (e.g. Intent Engine 10A). */
export const getAiModel = resolveAiModel;

/** Convenience: list configured routes for ops / health (no secrets). */
export function listConfiguredAiModels(
  env: NodeJS.ProcessEnv = process.env
): Partial<Record<AiTaskClass, AiModelRoute | null>> {
  const out: Partial<Record<AiTaskClass, AiModelRoute | null>> = {};
  for (const taskClass of ["FAST", "VISION", "REASONING", "FALLBACK"] as const) {
    try {
      out[taskClass] = resolveAiModel(taskClass, {
        env,
        allowFallback: taskClass === "FALLBACK" ? false : true,
      });
      if (taskClass !== "FALLBACK" && out[taskClass]?.fallbackUsed) {
        // Prefer showing null primary when only fallback exists
        const primaryEnv = TASK_ENV[taskClass];
        if (!readEnv(primaryEnv, env)) {
          out[taskClass] = resolveAiModel(taskClass, { env, allowFallback: true });
        }
      }
    } catch {
      out[taskClass] = null;
    }
  }
  return out;
}
