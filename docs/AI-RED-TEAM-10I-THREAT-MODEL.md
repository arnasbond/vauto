# AI Red Team — Threat Model (Etapas 10I / 10J)

## Scope

Full VAUTO AI Stage 10 chain:

`FOUNDATION → 10A Intent → 10B Search → 10C Sell → 10D Market → 10E Score → 10F Match → 10G Compare → 10H Watch`

**10J adds:** production `/api/stage10` routes, PostgreSQL `AiWatchRepository`, listing event hooks, SSRF DNS/redirect.

**Out of scope:** Stage 11 product features.

## Actors

| Actor | Capability | Primary goals |
|-------|------------|---------------|
| Anonymous attacker | Unauthenticated HTTP / public surfaces | Prompt injection, SSRF via image URL, schema fuzz |
| Authenticated buyer | Own prefs / watches / match | IDOR on other users' watches/notifications |
| Authenticated seller | Own drafts / listings | Leak private listings into search/compare; score gaming |
| Malicious seller | Listing text / OCR / photos | Indirect injection, fake specs, price poisoning |
| Bot attacker | High-volume events | Watch spam, fake views/favorites, race duplicates |
| Malicious image/OCR payload | Vision / OCR path | Instruction override via OCR; MIME confusion |
| Malicious external URL | Image fetch | SSRF to localhost / metadata / RFC1918 / DNS rebind / redirect-to-private |
| Replay / race attacker | Concurrent requests | Double notify, TOCTOU on watch delete, concurrent price update |

## Controls (10J)

- Auth middleware on all `/api/stage10/*` (except health is still behind requireAuth mount)
- Watch SQL: `WHERE id = $1 AND user_id = $2`
- Notification fingerprint `UNIQUE (user_id, event_fingerprint)`
- `resolveAndValidateOutboundUrl` + `safeOutboundFetch` (manual redirects, re-validate each hop)

## Explicit non-goals

Stage 11 — **NOT STARTED**.
