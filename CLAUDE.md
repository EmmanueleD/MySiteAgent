# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MySiteAgent is an AI-powered CMS for Astro websites. It exposes an `/ai-admin` route where non-technical content managers submit natural-language requests; the system translates them into code changes, creates a GitHub PR with deploy preview, and merges on user approval.

Full architecture and specifications are in [`.docs/MAIN-BLUEPRINT.md`](.docs/MAIN-BLUEPRINT.md) and [`.docs/AGENTS.md`](.docs/AGENTS.md). Read these before implementing any feature.

## Development Stage

**Phase 0 is implemented.** The local tool-use loop (agent → Guardian → filesystem writes) works end-to-end. GitHub integration (Executor, create_branch, create_pr) is not yet implemented.

## Build Commands

```bash
npm run dev              # Astro dev server
npm run build            # astro check + astro build
npm run lint             # astro check (TypeScript / Astro type checking)
npm run preview          # Serve the built output

# Engram knowledge base
ENGRAM_DB_PATH=~/.engram/engram.db npm run index-engram   # Index tokens, specs, .impeccable.md into Engram

# Tests
npx vitest               # Run all tests
npx vitest run src/lib/__tests__/guardian.test.ts   # Run a single test file
```

## Architecture

Multi-agent orchestration with Claude API native Tool Use (not JSON-from-text parsing):

| Agent | Responsibility |
|-------|----------------|
| **Planner** | Parses user request, breaks into tasks, validates feasibility |
| **Coder** | Executes file read/write via Tool Use (the main agent loop) |
| **Guardian** | Intercepts every `write_file`; blocks violations before they are written |
| **Executor** | GitHub operations: branch, commit, PR (Phase 1 — not yet implemented) |

All agents share context via **Engram** (SQLite + FTS5 via `better-sqlite3`), injecting only relevant context per request.

## Code Structure

```
src/
  lib/
    agent-loop.ts          ← Main Claude API tool-use loop (Coder agent)
    guardian.ts            ← Synchronous content validator, called inline by write_file tool
    errors.ts              ← GuardianAbortError (thrown when retry limit reached)
    session.ts             ← Session/auth helpers
    env.ts                 ← Environment variable validation
    agents/
      planner.ts           ← Planner agent (produces structured task breakdown)
    tools/
      definitions.ts       ← Tool schemas passed to Claude API
      read-file.ts         ← read_file tool implementation
      write-file.ts        ← write_file tool: sandbox check → Guardian → fs.writeFileSync
      sandbox.ts           ← Path traversal guard (ALLOWED_ROOTS: src/, public/, content/)
      query-context.ts     ← Queries Engram SQLite DB via FTS5
  pages/
    api/agent.ts           ← AI orchestrator endpoint (POST)
    ai-admin.astro         ← Admin UI
    ai-admin/login.astro   ← Login page
  middleware.ts            ← Auth guard for /ai-admin routes
  styles/tokens.css        ← Single source of truth for design tokens
  components/
    *.astro
    specs/[Name].md        ← Component spec required for every component
scripts/
  index-engram.ts          ← Indexes tokens.css + component specs + .impeccable.md into Engram
.docs/
  MAIN-BLUEPRINT.md        ← Full product specification
  AGENTS.md                ← Agent contracts (inputs, outputs, decision rules)
.impeccable.md             ← Design principles & vocabulary for AI context
```

## Tool Use Protocol

The Coder agent uses these tools (Claude native Tool Use API):

```typescript
read_file(path: string)
write_file(path: string, content: string, action: "create" | "modify" | "delete")
query_context(query: string)   // Queries Engram for tokens/specs/design context
```

**Invariants**:
- Always `read_file` before `write_file` on the same path
- Always `query_context` when uncertain about tokens, specs, or design constraints
- File content in `write_file` must always be **complete** — never diffs or partial content
- `write_file` is sandboxed to `src/`, `public/`, `content/` — absolute paths and path traversal are blocked

## Guardian Validation Rules

Guardian intercepts every `write_file` and **blocks** writes that contain:

- Hardcoded hex colors (`#[0-9a-fA-F]{3,8}`), `rgb()`, `rgba()`, `hsl()`
- Hardcoded pixel values (`15px`, `24px`, etc.)
- `eval()`, `new Function()`, `innerHTML =`
- Inline event handlers (`onclick=`, `onload=`)
- `fetch()` to external URLs or dynamic external imports
- TODO comments, placeholder text, or truncated content (last line ending with `...`)
- `.astro` files without a corresponding `src/components/specs/[Name].md`
- Props on a component not documented in the component's spec file

**Required in every write**:
- CSS values must come from `src/styles/tokens.css` CSS custom properties
- Tailwind classes must map to token variables (e.g., `bg-primary` → `var(--color-primary)`)

**Retry limit**: Guardian allows at most 3 attempts per file path. On the 3rd failure, `GuardianAbortError` is thrown and the entire agent loop aborts.

## Required Environment Variables

```
ANTHROPIC_API_KEY
GITHUB_TOKEN          # Phase 1 (GitHub integration) — not yet used
GITHUB_OWNER          # Phase 1
GITHUB_REPO           # Phase 1
ADMIN_PASSWORD
ENGRAM_DB_PATH        # Absolute path to Engram SQLite DB (e.g. ~/.engram/engram.db)
```

Optional:
```
ANTHROPIC_MODEL       # Defaults to claude-opus-4-5
PROJECT_ROOT          # Defaults to cwd(); set when running tools outside the project dir
```

## Language Conventions

| Context | Language |
|---------|----------|
| UI messages to end users | Italian (no jargon) |
| Branch names, variables, component names | English, kebab-case |
| PR titles and bodies | Italian |
| Code comments | English |
| Documentation (user-facing) | Italian |
