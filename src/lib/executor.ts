/**
 * Executor — Phase 1
 *
 * Takes the files produced by the Coder agent and pushes them to GitHub:
 * creates a branch, commits the files, opens a PR, and polls for a deploy preview URL.
 *
 * Activated only when GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO are configured.
 */

import { githubFetch, type GitHubConfig } from './github-client.js';

export interface ExecutorFile {
  path: string;
  content: string;
  action: 'create' | 'modify' | 'delete';
}

export interface ExecutorMetadata {
  intent: string;
  pr_title: string;
  pr_body: string;
  summary_for_user: string;
}

export interface ExecutorInput {
  files: ExecutorFile[];
  metadata: ExecutorMetadata;
}

export type ExecutorResult =
  | { skipped: true }
  | { skipped: false; success: true; pr_url: string; pr_number: number; branch: string; preview_url: string | null }
  | { skipped: false; success: false; error: string; branch?: string };

/**
 * Runs the full GitHub integration: branch → commits → PR → preview poll.
 */
export async function runExecutor(
  input: ExecutorInput,
  config: GitHubConfig
): Promise<ExecutorResult> {
  const { files, metadata } = input;

  // 1. Generate unique branch name
  const slug = slugify(metadata.intent || metadata.pr_title);
  const branchName = `ai-update/${slug}-${Date.now()}`;

  // 2. Get main branch HEAD SHA
  const mainRef = await githubFetch<{ object: { sha: string } }>(
    'GET',
    `/repos/${config.owner}/${config.repo}/git/refs/heads/main`,
    config
  );
  if (!mainRef.ok) {
    return {
      skipped: false,
      success: false,
      error: `Impossibile leggere il branch main: ${mainRef.message}`,
    };
  }
  const mainSha = mainRef.data.object.sha;

  // 3. Create branch
  const branchResult = await githubFetch(
    'POST',
    `/repos/${config.owner}/${config.repo}/git/refs`,
    config,
    { ref: `refs/heads/${branchName}`, sha: mainSha }
  );
  if (!branchResult.ok) {
    return {
      skipped: false,
      success: false,
      error: `Impossibile creare il branch: ${branchResult.message}`,
    };
  }

  // 4. Commit all files
  let branchHeadSha = mainSha;
  try {
    for (const file of files) {
      if (file.action === 'delete') {
        const getResult = await githubFetch<{ sha: string }>(
          'GET',
          `/repos/${config.owner}/${config.repo}/contents/${file.path}?ref=${branchName}`,
          config
        );
        if (getResult.ok) {
          const deleteResult = await githubFetch(
            'DELETE',
            `/repos/${config.owner}/${config.repo}/contents/${file.path}`,
            config,
            { message: `AI: delete ${file.path}`, sha: getResult.data.sha, branch: branchName }
          );
          if (!deleteResult.ok) {
            throw new Error(`Impossibile eliminare ${file.path}: ${deleteResult.message}`);
          }
        }
      } else {
        // GET existing SHA — needed to update a file; null if it doesn't exist yet on the branch
        const getResult = await githubFetch<{ sha: string }>(
          'GET',
          `/repos/${config.owner}/${config.repo}/contents/${file.path}?ref=${branchName}`,
          config
        );
        const existingSha = getResult.ok ? getResult.data.sha : null;

        const putBody: Record<string, unknown> = {
          message: `AI: update ${file.path}`,
          content: Buffer.from(file.content, 'utf-8').toString('base64'),
          branch: branchName,
        };
        if (existingSha) putBody['sha'] = existingSha;

        const putResult = await githubFetch<{ commit: { sha: string } }>(
          'PUT',
          `/repos/${config.owner}/${config.repo}/contents/${file.path}`,
          config,
          putBody
        );
        if (!putResult.ok) {
          throw new Error(`Impossibile caricare ${file.path}: ${putResult.message}`);
        }
        branchHeadSha = putResult.data.commit.sha;
      }
    }
  } catch (err) {
    // Cleanup orphan branch before returning the error
    await githubFetch(
      'DELETE',
      `/repos/${config.owner}/${config.repo}/git/refs/heads/${branchName}`,
      config
    );
    return {
      skipped: false,
      success: false,
      error: `Errore durante il commit dei file: ${String(err)}`,
      branch: branchName,
    };
  }

  // 5. Open Pull Request
  const prResult = await githubFetch<{ number: number; html_url: string }>(
    'POST',
    `/repos/${config.owner}/${config.repo}/pulls`,
    config,
    { title: metadata.pr_title, body: metadata.pr_body, head: branchName, base: 'main' }
  );
  if (!prResult.ok) {
    await githubFetch(
      'DELETE',
      `/repos/${config.owner}/${config.repo}/git/refs/heads/${branchName}`,
      config
    );
    return {
      skipped: false,
      success: false,
      error: `Impossibile aprire la PR: ${prResult.message}`,
      branch: branchName,
    };
  }

  // 6. Quick poll for deploy preview URL (3 attempts × 5s = max 15s)
  const preview_url = await pollDeployPreview(branchHeadSha, config);

  return {
    skipped: false,
    success: true,
    pr_url: prResult.data.html_url,
    pr_number: prResult.data.number,
    branch: branchName,
    preview_url,
  };
}

/**
 * Merge a PR with squash strategy, then delete the branch.
 */
export async function approvePR(
  prNumber: number,
  branch: string,
  title: string,
  intent: string,
  config: GitHubConfig
): Promise<{ success: boolean; error?: string }> {
  const mergeResult = await githubFetch(
    'PUT',
    `/repos/${config.owner}/${config.repo}/pulls/${prNumber}/merge`,
    config,
    {
      merge_method: 'squash',
      commit_title: title,
      commit_message: `Generated by MySiteAgent\n\n${intent}`,
    }
  );
  if (!mergeResult.ok) {
    return { success: false, error: `Merge fallito: ${mergeResult.message}` };
  }

  // Delete branch after merge (non-fatal)
  await githubFetch(
    'DELETE',
    `/repos/${config.owner}/${config.repo}/git/refs/heads/${branch}`,
    config
  );

  return { success: true };
}

/**
 * Close a PR without merging, then delete the branch.
 */
export async function cancelPR(
  prNumber: number,
  branch: string,
  config: GitHubConfig
): Promise<{ success: boolean; error?: string }> {
  const closeResult = await githubFetch(
    'PATCH',
    `/repos/${config.owner}/${config.repo}/pulls/${prNumber}`,
    config,
    { state: 'closed' }
  );
  if (!closeResult.ok) {
    return { success: false, error: `Impossibile chiudere la PR: ${closeResult.message}` };
  }

  // Delete branch after close (non-fatal)
  await githubFetch(
    'DELETE',
    `/repos/${config.owner}/${config.repo}/git/refs/heads/${branch}`,
    config
  );

  return { success: true };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function pollDeployPreview(sha: string, config: GitHubConfig): Promise<string | null> {
  for (let i = 0; i < 3; i++) {
    if (i > 0) await sleep(5000);

    // Check commit statuses (Netlify sets these)
    const statusResult = await githubFetch<Array<{ context: string; target_url: string; state: string }>>(
      'GET',
      `/repos/${config.owner}/${config.repo}/statuses/${sha}`,
      config
    );
    if (statusResult.ok) {
      const hit = statusResult.data.find(
        s =>
          (s.context.includes('deploy') ||
            s.context.includes('netlify') ||
            s.context.includes('vercel')) &&
          s.target_url &&
          s.state !== 'failure'
      );
      if (hit?.target_url) return hit.target_url;
    }

    // Check runs (Vercel sets these)
    const checksResult = await githubFetch<{
      check_runs: Array<{ name: string; details_url: string; status: string; conclusion: string | null }>;
    }>('GET', `/repos/${config.owner}/${config.repo}/commits/${sha}/check-runs`, config);
    if (checksResult.ok) {
      const hit = checksResult.data.check_runs.find(
        cr =>
          (cr.name.toLowerCase().includes('deploy') ||
            cr.name.toLowerCase().includes('netlify') ||
            cr.name.toLowerCase().includes('vercel')) &&
          cr.details_url &&
          cr.status === 'completed' &&
          cr.conclusion === 'success'
      );
      if (hit?.details_url) return hit.details_url;
    }
  }
  return null;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 5)
      .join('-')
      .substring(0, 40) || 'update'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
