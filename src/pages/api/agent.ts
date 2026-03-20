import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';
import { validateEnv, getGitHubConfig } from '../../lib/env.js';
import { runPlanner } from '../../lib/agents/planner.js';
import { runAgentLoop } from '../../lib/agent-loop.js';
import { runExecutor, type ExecutorFile } from '../../lib/executor.js';

export const prerender = false;

interface AgentRequestBody {
  request?: unknown;
}


const PROJECT_ROOT =
  ((import.meta.env['PROJECT_ROOT'] as string | undefined) ?? process.env['PROJECT_ROOT']) ??
  process.cwd();

export const POST: APIRoute = async ({ request }) => {
  try {
    validateEnv();
  } catch (err) {
    console.error('[api/agent] Environment validation failed:', err);
    return jsonResponse(500, {
      success: false,
      summary: '',
      files_modified: [],
      errors: ['Configurazione del server non valida. Contatta l\'amministratore.'],
      pr_url: null,
      pr_number: null,
      branch: null,
      preview_url: null,
    });
  }

  let body: AgentRequestBody;
  try {
    body = (await request.json()) as AgentRequestBody;
  } catch {
    return jsonResponse(400, {
      success: false,
      summary: '',
      files_modified: [],
      errors: ['Corpo della richiesta non valido. Invia JSON con campo "request".'],
      pr_url: null,
      pr_number: null,
      branch: null,
      preview_url: null,
    });
  }

  const userRequest = body.request;
  if (typeof userRequest !== 'string' || userRequest.trim() === '') {
    return jsonResponse(400, {
      success: false,
      summary: '',
      files_modified: [],
      errors: ['Campo \'request\' mancante o vuoto'],
      pr_url: null,
      pr_number: null,
      branch: null,
      preview_url: null,
    });
  }

  try {
    // --- Agent loop (Planner + Coder + Guardian) ---
    const plannerResult = await runPlanner(userRequest.trim());
    const loopResult = await runAgentLoop(plannerResult.systemPrompt, userRequest.trim());

    if (!loopResult.success) {
      return jsonResponse(200, {
        success: false,
        summary: loopResult.summary,
        files_modified: loopResult.filesModified,
        errors: loopResult.errors,
        pr_url: null,
        pr_number: null,
        branch: null,
        preview_url: null,
      });
    }

    // --- Executor (Phase 1 — optional) ---
    const githubConfig = getGitHubConfig();
    let pr_url: string | null = null;
    let pr_number: number | null = null;
    let branch: string | null = null;
    let preview_url: string | null = null;

    if (githubConfig && loopResult.filesModified.length > 0) {
      // Read the content of modified files from disk to pass to the Executor
      const files: ExecutorFile[] = [];
      for (const filePath of loopResult.filesModified) {
        const absolutePath = path.resolve(PROJECT_ROOT, filePath);
        try {
          const content = fs.readFileSync(absolutePath, 'utf-8');
          files.push({ path: filePath, content, action: 'modify' });
        } catch {
          // Skip files that can't be read (shouldn't happen after a successful write)
        }
      }

      if (files.length > 0) {
        const trimmedRequest = userRequest.trim();
        const prTitle = trimmedRequest.length > 70
          ? trimmedRequest.substring(0, 67) + '...'
          : trimmedRequest;
        const prBody = [
          `## Richiesta\n${trimmedRequest}`,
          `## Modifiche\n${loopResult.summary}`,
          `## File modificati\n${loopResult.filesModified.map(f => `- \`${f}\``).join('\n')}`,
          `\n---\n*Generato da MySiteAgent*`,
        ].join('\n\n');

        const executorResult = await runExecutor(
          { files, metadata: { intent: trimmedRequest, pr_title: prTitle, pr_body: prBody, summary_for_user: loopResult.summary } },
          githubConfig
        );

        if (!executorResult.skipped && executorResult.success) {
          pr_url = executorResult.pr_url;
          pr_number = executorResult.pr_number;
          branch = executorResult.branch;
          preview_url = executorResult.preview_url;
        } else if (!executorResult.skipped && !executorResult.success) {
          console.error('[api/agent] Executor failed:', executorResult.error);
          // Non-fatal: the local writes succeeded, we just couldn't open a PR
        }
      }
    }

    return jsonResponse(200, {
      success: true,
      summary: loopResult.summary,
      files_modified: loopResult.filesModified,
      errors: [],
      pr_url,
      pr_number,
      branch,
      preview_url,
    });
  } catch (err) {
    console.error('[api/agent] Unexpected error:', err);
    return jsonResponse(500, {
      success: false,
      summary: '',
      files_modified: [],
      errors: ['Errore interno del server. Riprova.'],
      pr_url: null,
      pr_number: null,
      branch: null,
      preview_url: null,
    });
  }
};

export const GET: APIRoute = () =>
  jsonResponse(405, { error: 'Metodo non consentito. Usa POST.' });

export const PUT: APIRoute = () =>
  jsonResponse(405, { error: 'Metodo non consentito. Usa POST.' });

export const DELETE: APIRoute = () =>
  jsonResponse(405, { error: 'Metodo non consentito. Usa POST.' });

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
