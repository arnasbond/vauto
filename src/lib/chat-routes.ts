/** Vienas kanoninis pokalbio URL — naudoti visur (push, agent, deep link). */
export function chatThreadPath(chatId: string): string {
  return `/pokalbiai/?id=${encodeURIComponent(chatId)}`;
}
