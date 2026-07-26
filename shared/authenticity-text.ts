/**
 * Client + server text authenticity detectors (no Node deps).
 * Keep aligned with server/src/ai/authenticity-shield.ts.
 */

export const REPLICA_HARD_BLOCK_REPLY =
  "VAUTO platformoje klastočių, replikų ir neoriginalių prekių pardavimas yra draudžiamas.";

const EXPLICIT_REPLICA_RE =
  /\b(replika|replik[aąos]|replica|replicas|padirbin\w*|neoriginal\w*|counterfeit|knock[\s-]?off|fakes?|klastot\w*|подделк\w*|фейк\w*)\b/i;

const REPLICA_RATIO_RE = /\b1\s*:\s*1(\s*(copy|kopija|replica|replika))?\b/i;

const REPLICA_KOPIJA_RE =
  /\b(aaa\s+)?(super\s+)?kopija\b|\bne\s+original(as|i|ūs|us|us)?\b|\bnot\s+original\b|\bunoriginal\b/i;

export function detectExplicitReplicaClaim(text: string): boolean {
  const t = String(text ?? "").trim();
  if (!t) return false;
  if (EXPLICIT_REPLICA_RE.test(t)) return true;
  if (REPLICA_RATIO_RE.test(t)) return true;
  if (REPLICA_KOPIJA_RE.test(t)) return true;
  return false;
}
