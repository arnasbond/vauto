import { apiAiHealthCheck } from "@/lib/api/client";
import { hasOpenAiKey } from "@/lib/openai-settings";

export async function resolveAiModeLabel(): Promise<string> {
  const health = await apiAiHealthCheck();
  if (health?.openai) return "GPT-4o-mini · Vauto serveris";
  if (hasOpenAiKey()) return "GPT-4o-mini · asmeninis raktas";
  return "Demo režimas";
}
