import { queryContextTool } from '../tools/query-context.js';
import { CODER_SYSTEM_INSTRUCTIONS } from '../agent-loop.js';

export interface PlannerResult {
  systemPrompt: string;
  contextSources: string[];
}

/**
 * Static summary of Guardian rules injected into the system prompt.
 * Informs Claude what will be blocked so it writes compliant code from the start.
 */
const GUARDIAN_RULES_SUMMARY = `## Regole Guardian (obbligatorie)

Il Guardian valida ogni write_file. Questi pattern causano blocco immediato:

- Colori hex hardcoded: #RRGGBB — usa var(--color-*)
- Colori rgb()/rgba()/hsl() diretti — usa var(--color-*)
- Valori px hardcoded: 15px, 24px, ecc. — usa var(--space-*) o classi Tailwind
- eval(), new Function() — vietati per sicurezza
- .innerHTML = — vietato per sicurezza
- Gestori eventi inline: onclick=, onload=, ecc. — vietati
- fetch() verso URL esterni (https://...) — vietato
- import() verso URL esterni — vietato
- Commenti TODO (//// TODO o <!-- TODO)
- Testo Lorem ipsum, [TODO], PLACEHOLDER
- Contenuto troncato che termina con ...
- Prop non documentate nelle spec del componente
- Componenti senza spec file corrispondente in src/components/specs/`;

/**
 * Planner stub for Phase 0.
 *
 * Does NOT make a Claude API call. Instead:
 * 1. Queries Engram for relevant context (top 3 results)
 * 2. Assembles a system prompt with instructions + Guardian rules + Engram context
 * 3. Returns the enriched system prompt for the agent loop
 *
 * @param userRequest - The natural language content request from the user
 * @returns PlannerResult with enriched system prompt and context sources
 */
export async function runPlanner(userRequest: string): Promise<PlannerResult> {
  // Query Engram for relevant context (top 3 results)
  const contextResult = queryContextTool(userRequest, 3);
  const results = contextResult.results;
  const contextSources = results.map(r => r.topic_key);

  // Build context section
  let contextSection: string;
  if (results.length > 0) {
    const contextEntries = results
      .map(r => `### ${r.title} (${r.topic_key})\n\n${r.content}`)
      .join('\n\n---\n\n');
    contextSection = `## Contesto di Design (da Engram)\n\n${contextEntries}`;
  } else {
    contextSection =
      '## Contesto di Design\n\n' +
      '(Nessun contesto disponibile — indicizza il progetto con index-engram.ts prima di usare il sistema)';
  }

  const systemPrompt = [
    CODER_SYSTEM_INSTRUCTIONS,
    '',
    GUARDIAN_RULES_SUMMARY,
    '',
    contextSection,
  ].join('\n');

  return {
    systemPrompt,
    contextSources,
  };
}
