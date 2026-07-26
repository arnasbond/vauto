/** Shared LT→ASCII fold for intent matchers (client + server). */

export function foldLtIntent(raw: string): string {
  return String(raw ?? "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[.!?,…:;]+$/g, "")
    .trim()
    .replace(/ą/g, "a")
    .replace(/č/g, "c")
    .replace(/ę/g, "e")
    .replace(/ė/g, "e")
    .replace(/į/g, "i")
    .replace(/š/g, "s")
    .replace(/ų/g, "u")
    .replace(/ū/g, "u")
    .replace(/ž/g, "z");
}
