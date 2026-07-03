# FAILURE_MAP.md
All fail points derived from code paths and observed test behavior.

## AI
| Fail point | Symptom | Mitigation in code | Gap |
|------------|---------|-------------------|-----|
| GEMINI_API_KEY missing | 503 server; client→mock | Graceful 503 | User sees mock data **RISK** |
| Gemini 25s timeout | AiSafeguardError timeout | Manual fallback form | No retry |
| Model flash→lite failure | 500 or fallback model | Model list | No circuit breaker |
| Invalid JSON response | Parse error | Fence extraction | User error |
| Client key exposed/abused | Quota exhaustion | Rate limit 8/min | Key in browser **RISK** |
| Cloudinary missing | upload_media 503 | Error returned | Upload fails |
| Double Gemini call | Cost/latency | None | Architecture debt |
| Embedding backfill fail | Partial index | Boot continues | Search quality degrades |

## OCR
**NOT IMPLEMENTED** — failures same as AI vision path.

## Payments
| Fail point | Symptom | Mitigation | Gap |
|------------|---------|------------|-----|
| STRIPE_SECRET_KEY missing | Checkout disabled | `isStripeEscrowLive false` | Feature off |
| Webhook signature invalid | 400 | Reject event | Stripe retries |
| Webhook secret missing | 503 | No processing | Payments stuck |
| Connect account missing | Transfer may fail | Code branch in stripe-b2b | Seller payout **RISK** |
| Manual capture never confirmed | Funds held indefinitely | None visible | **RISK** |
| Duplicate webhook | Double DB write | Upsert logic (verify) | No idempotency table |
| User abandons checkout | cancel_url redirect | No server cleanup | Orphan escrow offered state |
| Refund requested | **NOT IMPLEMENTED** | — | CRIT gap |

## Shipping
| Fail point | Symptom | Mitigation | Gap |
|------------|---------|------------|-----|
| Carrier API unavailable | N/A — always mock | Fake label returned | **RISK** user trust |
| Invalid locker ID | Not validated against real API | Accepts any | — |
| Label generation error | 500 | Single try | No retry |
| Tracking never updates | Stale UI | Manual status fields | No carrier webhook |

## Portal sync
| Fail point | Symptom | Mitigation | Gap |
|------------|---------|------------|-----|
| Playwright crash | last_error on link | next_sync_at reschedule | Slow recovery |
| Portal HTML change | Scrape parse fail | Error stored | No alert |
| PORTAL_SCRAPER_DISABLED | Import fails | Env flag | Feature off |
| Cron batch limit 6 | Backlog grows | Next day retry | **sync bottleneck** |
| Multi-instance race | Duplicate scrape | batchRunning per process | **RISK** multi replica |
| Gemini timeout on import | Partial import | Error on link | — |
| User URL malicious | Scraper compromise | Auth required | SSRF **RISK** |

## Uploads
| Fail point | Symptom | Mitigation | Gap |
|------------|---------|------------|-----|
| 25mb body limit | 413 | Error handler | DoS still possible |
| Invalid image format | sharp error | 400/500 | — |
| Cloudinary upload fail | 503 | Error to client | No retry |
| Camera permission denied | Client error | Capacitor handling | — |

## Notifications
| Fail point | Symptom | Mitigation | Gap |
|------------|---------|------------|-----|
| VAPID keys missing | Push disabled | health flag false | Silent |
| FCM JSON missing | Native push off | health flag | — |
| RESEND_API_KEY missing | No email alert | health flag | Admin unaware |
| Invalid push subscription | send fails | Per-call catch (verify) | No DLQ |
| SSE client disconnect | Stream ends | Heartbeat interval | — |

## Auth
| Fail point | Symptom | Mitigation | Gap |
|------------|---------|------------|-----|
| Twilio missing | OTP fails | Demo OTP in non-prod | Prod blocks login |
| JWT expired | 401 | Client re-login | — |
| JWT dev secret in prod | Forgery | env-check exit | **CRIT** if bypassed |
| x-user-id header | Impersonation | Prod disabled default | Misconfig **RISK** |
| Google token invalid | 401 social login | verify in prod | — |
| profile_type unset | Redirect /auth-gate | SessionAutoLoginGuard | UX friction |
| localStorage cleared | Guest mode | Re-auth | — |

## Database
| Fail point | Symptom | Mitigation | Gap |
|------------|---------|------------|-----|
| DATABASE_URL down | 503 /api/health | Error JSON | Full outage |
| Connection pool exhausted | 500 | pg pool defaults | No metrics |
| Migration not run | Runtime SQL errors | schema_migrations | Deploy process |

## Infrastructure
| Fail point | Symptom | Mitigation | Gap |
|------------|---------|------------|-----|
| Render cold start | Timeouts | None | **CRIT** |
| Render free sleep | First request slow | Platform | Upgrade needed |
| Vercel static only | No SSR | By design | SEO limits |

## Missing cross-cutting
- Idempotency keys — **NOT IMPLEMENTED**
- Dead-letter queues — **NOT IMPLEMENTED**
- Centralized monitoring/alerting — **NOT IMPLEMENTED**
