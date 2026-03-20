import Anthropic from '@anthropic-ai/sdk';
import { readFileTool } from './tools/read-file.js';
import { queryContextTool } from './tools/query-context.js';
import { createWriteFileTool } from './tools/write-file.js';
import { TOOL_DEFINITIONS } from './tools/definitions.js';
import { GuardianAbortError } from './errors.js';

// Re-export for consumers that import GuardianAbortError from agent-loop
export { GuardianAbortError };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentLoopResult {
  success: boolean;
  summary: string;
  filesModified: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// System prompt constants
// ---------------------------------------------------------------------------

export const CODER_SYSTEM_INSTRUCTIONS = `Sei il Coder Agent di MySiteAgent. Il tuo compito è applicare modifiche ai file del sito Astro seguendo regole precise.

## Regole operative

1. **Leggi prima di scrivere**: Chiama SEMPRE read_file prima di write_file sullo stesso percorso per avere il contenuto aggiornato.

2. **Consulta il contesto**: Chiama SEMPRE query_context quando sei incerto su nomi di token, props dei componenti o vincoli di design. Esempi: "colore primario", "token spacing", "props componente Hero".

3. **Contenuto completo**: write_file deve ricevere SEMPRE il file completo — mai diff parziali, mai contenuto troncato con "...". Se il file è lungo, includi tutto.

4. **Token CSS obbligatori**: Tutti i valori CSS devono usare la sintassi var(--nome-token) da tokens.css. Esempi: var(--color-primary), var(--space-md), var(--radius-lg).

5. **Pattern vietati**: Non usare mai:
   - Colori hex hardcoded (#3B82F6, ecc.)
   - Valori in pixel (15px, 24px, ecc.)
   - eval(), new Function(), innerHTML =
   - Gestori eventi inline (onclick=, onload=, ecc.)
   - fetch() verso URL esterni
   - Commenti TODO, testo Lorem ipsum, segnaposto PLACEHOLDER

6. **Guardian**: Ogni write_file è validato automaticamente dal Guardian. Se ricevi un errore con violations, correggi TUTTI i problemi indicati e riprova. Hai massimo 3 tentativi per file.

7. **Testo in italiano**: Tutto il testo visibile agli utenti finali deve essere in italiano.

## Ordine di lavoro suggerito

1. Chiama query_context per recuperare token e spec rilevanti
2. Chiama read_file per leggere il file da modificare
3. Prepara il contenuto completo corretto
4. Chiama write_file con il file completo
5. Se Guardian blocca, correggi e riprova`;

// ---------------------------------------------------------------------------
// Agent loop
// ---------------------------------------------------------------------------

const MAX_ITERATIONS = 20;

/**
 * Runs the Claude API Tool Use agent loop.
 *
 * @param systemPrompt - System prompt (from Planner, includes context)
 * @param userRequest - The user's natural language content request
 * @returns AgentLoopResult with success status, summary, modified files, and errors
 */
export async function runAgentLoop(
  systemPrompt: string,
  userRequest: string
): Promise<AgentLoopResult> {
  const apiKey = (import.meta.env['ANTHROPIC_API_KEY'] as string | undefined) ?? process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    return {
      success: false,
      summary: '',
      filesModified: [],
      errors: ['ANTHROPIC_API_KEY non configurata.'],
    };
  }

  const anthropic = new Anthropic({ apiKey });
  const model = ((import.meta.env['ANTHROPIC_MODEL'] as string | undefined) ?? process.env['ANTHROPIC_MODEL']) ?? 'claude-opus-4-5';

  const retryTracker = new Map<string, number>();
  const filesModified: string[] = [];
  const writeFileTool = createWriteFileTool(retryTracker);

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userRequest },
  ];

  let iteration = 0;

  try {
    while (iteration < MAX_ITERATIONS) {
      const response = await anthropic.messages.create({
        model,
        system: systemPrompt,
        messages,
        tools: TOOL_DEFINITIONS,
        max_tokens: 4096,
      });

      // -------------------------------------------------------------------
      // Handle stop reasons
      // -------------------------------------------------------------------

      if (response.stop_reason === 'end_turn') {
        // Extract text from the final response
        const textBlocks = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map(b => b.text);

        const summary = textBlocks.join('\n').trim() ||
          'Operazione completata.';

        return {
          success: true,
          summary,
          filesModified,
          errors: [],
        };
      }

      if (response.stop_reason === 'max_tokens') {
        return {
          success: false,
          summary: '',
          filesModified,
          errors: ['La risposta dell\'AI è stata troncata. Prova con una richiesta più semplice.'],
        };
      }

      if (response.stop_reason !== 'tool_use') {
        return {
          success: false,
          summary: '',
          filesModified,
          errors: [`Risposta inattesa dall'AI: stop_reason=${response.stop_reason}`],
        };
      }

      // -------------------------------------------------------------------
      // Process tool_use blocks
      // -------------------------------------------------------------------

      // Append assistant message
      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        const toolUseId = block.id;
        const toolName = block.name;
        const toolInput = block.input as Record<string, unknown>;

        let resultContent: string;
        let isError = false;

        if (toolName === 'read_file') {
          const filePath = String(toolInput['path'] ?? '');
          const result = readFileTool(filePath);

          if ('error' in result) {
            resultContent = JSON.stringify(result);
            isError = true;
          } else {
            resultContent = JSON.stringify(result);
          }
        } else if (toolName === 'write_file') {
          const filePath = String(toolInput['path'] ?? '');
          const content = String(toolInput['content'] ?? '');
          const action = String(toolInput['action'] ?? 'modify') as 'create' | 'modify' | 'delete';

          const result = writeFileTool(filePath, content, action);

          if ('error' in result) {
            resultContent = JSON.stringify(result);
            isError = true;
          } else {
            // Success — track the modified file
            if (!filesModified.includes(filePath)) {
              filesModified.push(filePath);
            }
            resultContent = JSON.stringify(result);
          }
        } else if (toolName === 'query_context') {
          const query = String(toolInput['query'] ?? '');
          const result = queryContextTool(query);
          resultContent = JSON.stringify(result);
        } else {
          resultContent = JSON.stringify({ error: `Tool sconosciuto: ${toolName}` });
          isError = true;
        }

        const toolResult: Anthropic.ToolResultBlockParam = {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: resultContent,
          ...(isError && { is_error: true }),
        };
        toolResults.push(toolResult);
      }

      // Append tool results as user message
      messages.push({ role: 'user', content: toolResults });

      iteration++;

      // Check iteration limit
      if (iteration >= MAX_ITERATIONS) {
        return {
          success: false,
          summary: '',
          filesModified,
          errors: ['Limite massimo di iterazioni raggiunto (20). L\'operazione è stata interrotta.'],
        };
      }
    }

    // Fallback (should not reach here)
    return {
      success: false,
      summary: '',
      filesModified,
      errors: ['Limite massimo di iterazioni raggiunto (20). L\'operazione è stata interrotta.'],
    };
  } catch (err) {
    if (err instanceof GuardianAbortError) {
      return {
        success: false,
        summary: '',
        filesModified,
        errors: [
          'Impossibile applicare la modifica: le regole di design non sono state rispettate dopo 3 tentativi. ' +
          'Dettaglio: ' + err.violations.join('; '),
        ],
      };
    }

    console.error('[agent-loop] Unexpected error:', err);
    return {
      success: false,
      summary: '',
      filesModified,
      errors: ['Errore nella comunicazione con l\'AI. Riprova tra qualche istante.'],
    };
  }
}
