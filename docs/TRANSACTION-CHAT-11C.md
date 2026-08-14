# Stage 11C — Transaction Chat 1.0

## Status

Context-bound unified timeline for human messages + server domain events.  
**Chat is NOT authoritative** for transaction / offer / payment state.  
**No Stage 11D Negotiation Copilot.**

`chatVersion`: **`1.0`**

## Architecture

`USER_MESSAGE` + `DOMAIN_EVENT` (from 11A/11B) → unified timeline

Text such as „sutinku su 700 €“ is **only text**. Agreement requires 11B accept → 11A `AGREED`.

## Rules

- Client sends only `text`, optional `attachmentIds`, `idempotencyKey`
- Server sets `senderId`, `createdAt`, `messageType`
- Client **cannot** create `DOMAIN_EVENT`
- Strict participant IDOR (buyer/seller only) → 404 for strangers
- Cursor pagination: `before=<cursor>`, `limit<=50`
- Unique `(transaction_id, sender_id, idempotency_key)` for user messages
- XSS: store sanitized text; expose `textSafe` (HTML-escaped)

## HTTP

- `GET /api/transactions/:id/timeline`
- `POST /api/transactions/:id/messages`
- `POST /api/transactions/:id/read`

## Migration

`server/migrations/041_transaction_chat_1.0.sql`

## Tests

```bash
npm run test:transaction-chat --prefix server
```
