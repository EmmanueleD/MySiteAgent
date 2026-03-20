import fs from 'node:fs';
import type { GitHubConfig } from './github-client.js';

/**
 * Returns GitHub config if all three variables are set and non-placeholder, otherwise null.
 * GitHub integration is optional — Phase 0 works without it.
 */
export function getGitHubConfig(): GitHubConfig | null {
  const token = (import.meta.env['GITHUB_TOKEN'] as string | undefined) ?? process.env['GITHUB_TOKEN'];
  const owner = (import.meta.env['GITHUB_OWNER'] as string | undefined) ?? process.env['GITHUB_OWNER'];
  const repo = (import.meta.env['GITHUB_REPO'] as string | undefined) ?? process.env['GITHUB_REPO'];
  if (!token || !owner || !repo) return null;
  // Skip placeholder values from .env.example
  if (token.startsWith('your_') || owner.startsWith('your_') || repo.startsWith('your_')) return null;
  return { token, owner, repo };
}

/**
 * Validates all required environment variables at startup.
 * Throws with a clear message if any required variable is missing or
 * if ENGRAM_DB_PATH does not point to an existing file.
 *
 * Call this once at server startup (e.g., imported in the API route).
 */
function getEnv(key: string): string | undefined {
  return (import.meta.env[key] as string | undefined) ?? process.env[key];
}

export function validateEnv(): void {
  const required = ['ANTHROPIC_API_KEY', 'ADMIN_PASSWORD', 'ENGRAM_DB_PATH'] as const;

  for (const key of required) {
    const value = getEnv(key);
    if (!value || value.trim() === '') {
      throw new Error(
        `Missing required environment variable: ${key}. ` +
        `Copy .env.example to .env and fill in all required values.`
      );
    }
  }

  const engramPath = getEnv('ENGRAM_DB_PATH')!;
  if (!fs.existsSync(engramPath)) {
    throw new Error(
      `ENGRAM_DB_PATH does not point to an existing file: ${engramPath}`
    );
  }
}
