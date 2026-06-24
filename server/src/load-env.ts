import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Load server/.env, then repo root .env, then cwd .env (first wins per file). */
const envPaths = [
  path.resolve(moduleDir, "../.env"),
  path.resolve(moduleDir, "../../.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "server/.env"),
];

for (const envPath of envPaths) {
  dotenv.config({ path: envPath });
}

export function resolveGeminiApiKey(): string | undefined {
  const key =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.AI_KEY?.trim() ||
    process.env.GOOGLE_AI_API_KEY?.trim();
  return key || undefined;
}

export function hasAgentAiKey(): boolean {
  return Boolean(resolveGeminiApiKey());
}

export function hasAiKey(): boolean {
  return hasAgentAiKey();
}
