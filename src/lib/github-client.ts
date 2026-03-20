/**
 * Minimal GitHub REST API v3 client using native fetch.
 * Handles authentication and exponential backoff retries on 429/5xx.
 */

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}

export type GitHubResponse<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; status: number; message: string };

const GITHUB_API = 'https://api.github.com';

/**
 * Makes a GitHub API request with exponential backoff retry on 429/5xx.
 * Attempts: 1 immediate + 2 retries with delays 1s → 2s.
 */
export async function githubFetch<T = unknown>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  apiPath: string,
  config: GitHubConfig,
  body?: unknown
): Promise<GitHubResponse<T>> {
  const url = `${GITHUB_API}${apiPath}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let delay = 1000;
  let lastError: GitHubResponse<T> = { ok: false, status: 0, message: 'Unknown error' };

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (attempt > 1) await sleep(delay);
    delay *= 2;

    let response: Response;
    try {
      const init: RequestInit = { method, headers };
      if (body !== undefined) init.body = JSON.stringify(body);
      response = await fetch(url, init);
    } catch (err) {
      lastError = { ok: false, status: 0, message: `Network error: ${String(err)}` };
      continue;
    }

    // Retry on rate limit or transient server errors
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      const text = await response.text().catch(() => '');
      lastError = { ok: false, status: response.status, message: text };
      continue;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      let message = text;
      try {
        const json = JSON.parse(text) as { message?: string };
        if (json.message) message = json.message;
      } catch { /* ignore parse errors */ }
      return { ok: false, status: response.status, message };
    }

    // 204 No Content (e.g., branch delete)
    if (response.status === 204) {
      return { ok: true, data: null as T, status: 204 };
    }

    try {
      const data = await response.json() as T;
      return { ok: true, data, status: response.status };
    } catch {
      return { ok: false, status: response.status, message: 'Invalid JSON response' };
    }
  }

  return lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
