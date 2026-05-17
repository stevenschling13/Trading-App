# Sentinel Worklog

> Cross-session context persistence. Updated by every AI agent at session start and end.
> Prevents context loss, circular debugging, and repeated failed approaches.
>
> **Rule**: Read this file at session start. Update it at session end.

## Active Context

_Last updated: 2026-04-18_

### Current Architecture Decisions

- **Web → Engine**: All calls go through `apps/web/src/lib/engine-fetch.ts` (same-origin proxy)
- **Web → Agents**: All calls go through `apps/web/src/lib/agents-client.ts`
- **Deployment**: Vercel (web) + Railway (engine + agents) + Supabase (database)
- **Task coordination**: GitHub issue assignment + PR linkage (primary). `docs/ai/state/project-state.md` is secondary/generated — do not treat as live truth.

### Known Working Patterns

- `pnpm lint && pnpm test && pnpm build` for Node workspace validation
- `pnpm lint:engine && pnpm format:check:engine && pnpm test:engine` for Python engine
- `pnpm guardian` to run PR Guardian checks locally before creating a PR
- `turbo --ui stream` required for CI/scripting (TUI mode swallows output otherwise)
- `pnpm install` may prompt interactively — answer Y if it asks to rebuild node_modules

### Known Gotchas

- Node 24.x triggers `typescript-estree` warnings (supports <6.0.0) — cosmetic, non-blocking
- TypeScript 6.0.2 is bleeding edge — some ecosystem tools emit warnings
- `apps/web/.next/cache` can grow large — `pnpm clean` if builds are slow
- `proxy.ts` and `middleware.ts` cannot coexist in Next.js — use only `proxy.ts`

---

## Failed Approaches Log

> Record approaches that were tried and failed. Prevents agents from re-trying the same thing.

| Date       | Agent    | What Was Tried                                                | Why It Failed                                                           | Lesson                                                     |
| ---------- | -------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| 2026-04-09 | Multiple | 8 overlapping PRs from 3 agents                               | No coordination — agents didn't check for in-flight work                | Always check open PRs before starting work                 |
| 2026-04-09 | Codex    | PR #297 used `BrokerInterface` class name                     | Hallucinated — actual class is `BrokerAdapter`                          | Run `pnpm typecheck` before creating PR                    |
| 2026-04-09 | Codex    | PR #295 added `middleware.ts` alongside `proxy.ts`            | Next.js rejects coexistence of middleware + proxy                       | Check existing patterns before introducing new ones        |
| 2026-04-09 | Codex    | PR #297 touched 64 files across 5 subsystems                  | Too broad — impossible to review safely                                 | Keep PRs under 20 files, one concern per PR                |
| 2026-04-17 | Audit    | Guardian/pre-PR scripts enforced `middleware.ts` as high-risk | `proxy.ts` replaced `middleware.ts`; coexistence is rejected by Next.js | Always check `proxy.ts` is the current request gating file |

---

## Session Log

> Brief entry per agent session. Most recent first.

### 2026-05-15 — Codex (test gap detection: deploy/runtime guards)

**Goal**: Add focused regression tests for recent deploy/runtime fixes that landed without automated coverage.

**What changed**:

- Added `scripts/runtime-package-contract.test.mjs` to lock two recent fixes in place:
  - root `prepare` stays `husky || true` for prod installs without Husky
  - agents OpenTelemetry imports remain in `dependencies`, not `devDependencies`
- Added `scripts/health-check-redirect.test.mjs` to execute the real `scripts/health-check.sh` against a local 308 redirect and confirm it follows through to the final 200 response instead of failing early on the redirect status.

**Validation**:

- `node --test scripts/runtime-package-contract.test.mjs` ✅
- `node --test scripts/health-check-redirect.test.mjs` ✅
- `git diff --check` ✅
- `pnpm --filter @sentinel/agents test -- runtime-package-contract.test.ts` could not run because this worktree does not have package-local `node_modules`
- `pnpm --filter @sentinel/agents lint` is currently failing from the same missing-dependencies state plus pre-existing TypeScript issues in the worktree environment

**Decisions**: Kept the tests dependency-free under `node:test` instead of Vitest so they can run in this worktree without broad install/setup changes.

### 2026-04-18 — Claude (AI workflow playbooks)

**Goal**: Land the three "adopt now" doc deliverables from the April 2026 deep-research audit that Phases 1–4 (PRs #349–#352) did not cover.

**What changed**:

- Added `docs/playbooks/repo-aware-ai-coding-playbook.md` — default task-brief template, model-role guidance, changed-scope validation, stop conditions, handoff standard.
- Added `docs/playbooks/contract-safe-change-playbook.md` — when to invoke, risk matrix, path checklist, per-surface validation matrix, rollback notes.
- Added `docs/research/vibe-coding-2026-for-sentinel.md` — durable decision record for why the AI workflow is shaped the way it is; what was adopted, deferred, and rejected.

**Validation**: Docs-only. `git diff --check` clean.

**Decisions**: Deferred PR E (Turbo remote cache + signing) and the web route-handler observability fix to separate branches — both are out of scope for a docs branch and the observability fix touches app source.

### 2026-04-17 — Codex (Vercel deploy alignment)

**Goal**: Verify current Vercel deployment findings and remediate repo-side deployment workflow/canonical URL issues with minimal risk.

**What changed**:

- Rewrote `.github/workflows/vercel-preview-smoke.yml` to resolve deployment URLs from GitHub Deployments API for the current SHA (`Preview` on PRs, `Production` on `main`) instead of relying on `VERCEL_PREVIEW_SMOKE_URL`.
- Added `scripts/resolve-vercel-deployment-url.sh` helper to poll deployment status and return environment URL + state.
- Replaced static `apps/web/public/robots.txt` with dynamic `apps/web/src/app/robots.ts` so sitemap URL follows canonical URL helper logic.
- Added narrowly-scoped `tasks.build.passThroughEnv` entries (`CRON_SECRET`, `ALPACA_WEBHOOK_SECRET`) in `turbo.json` for runtime-only server route secrets without broadening cache keys.
- Updated `docs/runbooks/preview.md` with the new CI preview-smoke URL resolution behavior.

**Validation**: `bash -n scripts/resolve-vercel-deployment-url.sh scripts/health-check.sh scripts/smoke-test.sh`; `pnpm exec prettier --check .github/workflows/vercel-preview-smoke.yml turbo.json apps/web/src/app/robots.ts docs/runbooks/preview.md`; `pnpm --filter @sentinel/web lint`; `pnpm --filter @sentinel/web build`; `git diff --check`.

**Decisions**: Kept deployment/env-contract changes narrow due high risk; documented unresolved dashboard-only actions separately rather than making speculative repo changes.

### 2026-04-10 — Copilot (PR Guardian System)

**Goal**: Build automated guardrails to prevent AI agent drift and quality issues.

**What changed**:

- Created `scripts/pr-guardian.mjs` — 7-check automated PR quality gate
- Created `.github/workflows/pr-guardian.yml` — CI enforcement
- Created `.github/agents/repo-guardian.agent.md` — on-demand audit agent
- Updated `AGENTS.md` with PR quality gates and self-validation checklist
- Updated `.github/copilot-instructions.md` with scope/freshness rules
- Updated `.github/pull_request_template.md` with agent metadata fields

**Validation**: lint (3/3 pass), test (1122/1122 pass), build (3/3 pass)

**Decisions**: Delta-based file health (not absolute), import checks advisory-only,
overlap/staleness fail only with high-risk paths.

**Next steps**: Add pre-PR validation script, WORKLOG, worktree management, enhanced agent-ops.

### 2026-04-09 — Copilot (PR Audit & Consolidation)

**Goal**: Audit all 8 open PRs, validate main, close stale PRs.

**What changed**: Closed all 8 open PRs (#301, #300, #298, #297, #295, #288, #287, #283).
Deleted 8 stale remote branches. Validated main at `e42c779`.

**Validation**: install, lint (3/3), test (1596 total), build (3/3) — all pass.

**Decisions**: All 8 PRs superseded by consolidated merge PR #303. No cherry-picks needed.
