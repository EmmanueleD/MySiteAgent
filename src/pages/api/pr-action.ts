import type { APIRoute } from 'astro';
import { getGitHubConfig } from '../../lib/env.js';
import { approvePR, cancelPR } from '../../lib/executor.js';

export const prerender = false;

interface PrActionRequestBody {
  action?: unknown;
  pr_number?: unknown;
  branch?: unknown;
  pr_title?: unknown;
  intent?: unknown;
}

interface PrActionResponse {
  success: boolean;
  message: string;
  errors: string[];
}

export const POST: APIRoute = async ({ request }) => {
  const githubConfig = getGitHubConfig();
  if (!githubConfig) {
    return jsonResponse(503, {
      success: false,
      message: '',
      errors: ['GitHub non configurato. Aggiungi GITHUB_TOKEN, GITHUB_OWNER e GITHUB_REPO nel file .env'],
    });
  }

  let body: PrActionRequestBody;
  try {
    body = (await request.json()) as PrActionRequestBody;
  } catch {
    return jsonResponse(400, {
      success: false,
      message: '',
      errors: ['Corpo della richiesta non valido.'],
    });
  }

  const action = body.action;
  const prNumber = typeof body.pr_number === 'number' ? body.pr_number : null;
  const branch = typeof body.branch === 'string' ? body.branch : null;

  if ((action !== 'approve' && action !== 'cancel') || !prNumber || !branch) {
    return jsonResponse(400, {
      success: false,
      message: '',
      errors: ['Parametri mancanti o non validi: action, pr_number, branch.'],
    });
  }

  try {
    if (action === 'approve') {
      const title = typeof body.pr_title === 'string' ? body.pr_title : 'Modifica approvata';
      const intent = typeof body.intent === 'string' ? body.intent : '';
      const result = await approvePR(prNumber, branch, title, intent, githubConfig);
      if (!result.success) {
        return jsonResponse(500, {
          success: false,
          message: '',
          errors: [result.error ?? 'Errore durante il merge.'],
        });
      }
      return jsonResponse(200, {
        success: true,
        message: 'Modifiche applicate con successo.',
        errors: [],
      });
    } else {
      const result = await cancelPR(prNumber, branch, githubConfig);
      if (!result.success) {
        return jsonResponse(500, {
          success: false,
          message: '',
          errors: [result.error ?? 'Errore durante l\'annullamento.'],
        });
      }
      return jsonResponse(200, {
        success: true,
        message: 'Richiesta annullata.',
        errors: [],
      });
    }
  } catch (err) {
    console.error('[api/pr-action] Unexpected error:', err);
    return jsonResponse(500, {
      success: false,
      message: '',
      errors: ['Errore interno del server. Riprova.'],
    });
  }
};

function jsonResponse(status: number, body: PrActionResponse | { error: string }): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
