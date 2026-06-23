import { apiAiHealthCheck } from "@/lib/api/client";
import { hasOpenAiKey } from "@/lib/openai-settings";

export async function resolveAiModeLabel(): Promise<string> {
  const health = await apiAiHealthCheck();
  if (health?.openai) {
    const label =
      health.mode === "gemini"
        ? "Gemini · Vauto serveris"
        : "GPT-4o-mini · Vauto serveris";
    return label;
  }
  if (hasOpenAiKey()) return "GPT-4o-mini · asmeninis raktas";
  return "Demo režimas";
}
