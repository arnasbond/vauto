const STORAGE_KEY = "vauto_openai_api_key";

export function getOpenAiKey(): string | null {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem(STORAGE_KEY) ??
    process.env.NEXT_PUBLIC_OPENAI_API_KEY ??
    null
  );
}

export function setOpenAiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key.trim());
}

export function clearOpenAiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasOpenAiKey(): boolean {
  const key = getOpenAiKey();
  return Boolean(key && key.startsWith("sk-"));
}
