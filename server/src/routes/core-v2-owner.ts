/**
 * VAUTO AI Core v2.5 — OWNER-ONLY test entry (READ-only).
 *
 * An internal, ops-gated route that lets the VAUTO owner talk to Core v2
 * against REAL marketplace data (searchListings / listingDetails) while normal
 * users stay on Current Core. This is a product test entry, NOT production
 * migration and NOT the public AI route.
 *
 * READ-only: the registry exposes only searchListings + listingDetails. Any
 * request for publishListing / mutations / transactions resolves to an unknown
 * capability and fails closed.
 *
 * NEVER exposes API keys. The reasoning provider and authority verifier are
 * created server-side from the configured credential.
 */
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { requireOpsSecret } from "../middleware/ops-secret.js";
import {
  runBuyerTurn,
  createReadOnlyBuyerRegistry,
  type BuyerSession,
} from "../ai-core-v2/journey/conversation.js";
import { createGeminiSemanticClaimProvider, semanticDecisionToReasoningDecision } from "../ai-core-v2/provider/semantic-claim.js";
import { createGeminiAuthorityVerifier } from "../ai-core-v2/loop/authority-verifier.js";
import { CORE_V2_MODEL } from "../ai-core-v2/provider/model-config.js";
import { emptyMarketplaceState } from "../ai-core-v2/state/marketplace-state.js";
import type { ReasoningProvider } from "../ai-core-v2/reasoning/reasoning-contract.js";

export const coreV2OwnerRouter = Router();

/** In-memory, isolated owner-test session store (single owner; not a product architecture). */
const sessions = new Map<string, BuyerSession>();

function buildReasoningProvider(): ReasoningProvider {
  const semantic = createGeminiSemanticClaimProvider({ model: CORE_V2_MODEL });
  return async (input) => semanticDecisionToReasoningDecision(await semantic(input));
}

coreV2OwnerRouter.post("/chat", requireOpsSecret, async (req, res) => {
  const body = (req.body ?? {}) as { message?: unknown; sessionId?: unknown };
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    res.status(400).json({ ok: false, code: "invalid_request", error: "message is required" });
    return;
  }

  const sessionId =
    typeof body.sessionId === "string" && body.sessionId.trim()
      ? body.sessionId.trim()
      : randomUUID();

  let session = sessions.get(sessionId);
  if (!session) {
    session = { state: emptyMarketplaceState(), history: [], resultContext: { listings: [] } };
    sessions.set(sessionId, session);
  }

  const t0 = Date.now();
  try {
    const rec = await runBuyerTurn(session, message, {
      provider: buildReasoningProvider(),
      verifier: createGeminiAuthorityVerifier({ model: CORE_V2_MODEL }),
      buildRegistry: createReadOnlyBuyerRegistry,
    });

    const latencyMs = Date.now() - t0;
    const capSummary = rec.capabilityCalls
      .map((c) => `${c.name}:${c.ok ? "ok" : c.error ?? "fail"}`)
      .join(",");
    // Server-side observability only — no keys, no auth headers, no personal data.
    console.log(
      `[core-v2-owner] session=${sessionId.slice(0, 8)} latency=${latencyMs}ms ` +
        `caps=[${capSummary || "none"}] hasText=${Boolean(rec.decision.text)} ` +
        `patches=${rec.decision.statePatches?.length ?? 0}`
    );

    res.json({
      ok: true,
      sessionId,
      reply: rec.assistantText,
      capabilities: rec.capabilityCalls.map((c) => ({ name: c.name, ok: c.ok, error: c.error })),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[core-v2-owner] session=${sessionId.slice(0, 8)} error=${reason}`);
    res.status(500).json({ ok: false, code: "internal_error", error: "Core v2 turn failed" });
  }
});

/** Minimal owner test chat page — static form only (no data). The chat endpoint below is the protected boundary. */
coreV2OwnerRouter.get("/", (_req, res) => {
  res.type("html").send(OWNER_TEST_PAGE);
});

const OWNER_TEST_PAGE = `<!doctype html>
<html lang="lt">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VAUTO Core v2 — Owner Test</title>
<style>body{font-family:system-ui;max-width:640px;margin:2rem auto;padding:0 1rem} #log div{margin:.4rem 0;padding:.5rem;border-radius:6px} .u{background:#eef} .a{background:#efe} input{width:70%;padding:.5rem} button{padding:.5rem 1rem}</style>
</head>
<body>
<h1>VAUTO Core v2 — Owner Test (READ-only)</h1>
<p>Distinct from Current Core. Search + listing details only.</p>
<div id="log"></div>
<input id="msg" placeholder="Rašykite natūraliai…" />
<button id="send">Siųsti</button>
<script>
let sessionId = null;
const log = document.getElementById('log');
function add(role, text){ const d=document.createElement('div'); d.className=role==='u'?'u':'a'; d.textContent=text; log.appendChild(d); window.scrollTo(0,document.body.scrollHeight); }
async function send(){
  const msg = document.getElementById('msg').value.trim(); if(!msg) return;
  document.getElementById('msg').value=''; add('u', msg);
  const token = localStorage.getItem('vauto_access_token_v1');
  if(!token){ add('a','Prisijunkite kaip administratorius, tada bandykite dar kartą.'); return; }
  try {
    const r = await fetch('/api/ops/core-v2/chat', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token}, body: JSON.stringify({ message: msg, sessionId }) });
    const j = await r.json();
    if(j.ok){ sessionId = j.sessionId; add('a', j.reply || '(tuščia)'); } else { add('a', 'KLAIDA: ' + (j.error||j.code)); }
  } catch(e){ add('a', 'TINKLO KLAIDA'); }
}
document.getElementById('send').onclick = send;
document.getElementById('msg').addEventListener('keydown', e => { if(e.key==='Enter') send(); });
</script>
</body></html>`;
