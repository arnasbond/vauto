# VAUTO Execution Contract

Mandatory workflow for ALL future VAUTO development.

## Workflow

```
implement
→ relevant unit/integration/E2E tests
→ independent/audit gate where applicable
→ commit
→ push
→ CI
→ production deploy (deploy-on-green)
→ verify live production
→ owner/testers real-time testing
→ feedback/iteration
```

## Rules

- **Certified work must not remain only in mutable worktree or local-only commits.** Each completed stage must have a traceable commit and rollback path.
- **Production is the shared real-time test environment** for the owner/testers.
- Do not use preview as a mandatory intermediate environment unless a future task explicitly requires it.
- **Do not bypass CI.** Deploy-on-green only.
- **If production differs from certified state: STOP and diagnose.** Do not continue into a new stage after a failed production gate.
- Never hide failing tests, delete evidence to make checks green, or weaken assertions to pass visuals.
- Stage 11 frozen boundaries and certified invariants remain protected.

## Three-Control Model

- **Owner** = product/business direction and real-user judgment.
- **ChatGPT** = roadmap / architecture / independent audit / project coordination.
- **Cursor/DeepSeek** = technical executor + technical red-team.

### Cursor/DeepSeek duties

- SHALL challenge assumptions when repository evidence contradicts them.
- MAY STOP based on technical evidence.
- MUST NOT independently rewrite the roadmap, frozen boundaries, or product doctrine.
