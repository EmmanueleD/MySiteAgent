# Skill Registry — MySiteAgent

_Generated: 2026-03-20_

**Orchestrator use only.** Read this registry once per session to resolve skill paths, then pass pre-resolved paths directly to each sub-agent's launch prompt. Sub-agents receive the path and load the skill directly — they do NOT read this registry.

## Skills

No non-SDD custom skills found in user-level (`~/.claude/skills/`) or project-level directories.
All discovered skills are SDD framework skills (excluded from this registry per convention).

| Name | Path | Trigger |
|------|------|---------|
| — | — | No custom skills registered |

## Convention Files

| File | Path | Purpose |
|------|------|---------|
| CLAUDE.md | `/home/emmanuele/Documenti/e14e/MySiteAgent/CLAUDE.md` | Project guidance: architecture overview, guardian rules, tool use protocol, language conventions |
| MAIN-BLUEPRINT.md | `/home/emmanuele/Documenti/e14e/MySiteAgent/.docs/MAIN-BLUEPRINT.md` | Full architecture blueprint, agent flow, Engram integration, roadmap |
| AGENTS.md | `/home/emmanuele/Documenti/e14e/MySiteAgent/.docs/AGENTS.md` | Operational contracts for each agent (Planner, Coder, Guardian, Executor) |

## Notes

- Project is in **Phase 0 (pre-implementation)** — no `src/`, `package.json`, or Astro scaffold exists yet.
- No `.agent/skills/` or project-level `.claude/skills/` directory found.
- SDD skills available at `~/.claude/skills/`: sdd-explore, sdd-propose, sdd-spec, sdd-design, sdd-tasks, sdd-apply, sdd-verify, sdd-archive, sdd-init.
