import fs from 'node:fs';
import path from 'node:path';
import { assertSandboxed, SandboxError } from './sandbox.js';
import { guardian } from '../guardian.js';
import { GuardianAbortError } from '../errors.js';

type WriteAction = 'create' | 'modify' | 'delete';

type WriteFileSuccess = { success: true; path: string; action: WriteAction };
type WriteFileGuardianError = { error: string; violations: string[] };
type WriteFileGenericError = { error: string };
export type WriteFileResult = WriteFileSuccess | WriteFileGuardianError | WriteFileGenericError;

const PROJECT_ROOT = ((import.meta.env['PROJECT_ROOT'] as string | undefined) ?? process.env['PROJECT_ROOT']) ?? process.cwd();

/**
 * Creates a write_file tool function with a shared retry tracker.
 *
 * @param retryTracker - Map<filePath, attemptCount> shared across the agent loop iteration
 * @returns The write_file tool handler function
 */
export function createWriteFileTool(
  retryTracker: Map<string, number>
): (filePath: string, content: string, action: WriteAction) => WriteFileResult {
  return function writeFileTool(
    filePath: string,
    content: string,
    action: WriteAction
  ): WriteFileResult {
    // -----------------------------------------------------------------------
    // Step 1: Sandbox check (does NOT increment retry counter)
    // -----------------------------------------------------------------------
    try {
      assertSandboxed(filePath, PROJECT_ROOT);
    } catch (err) {
      if (err instanceof SandboxError) {
        return { error: 'Path traversal attempt blocked' };
      }
      return { error: `Errore di validazione percorso: ${String(err)}` };
    }

    const resolvedPath = path.resolve(PROJECT_ROOT, filePath);

    // -----------------------------------------------------------------------
    // Step 2: Handle delete action
    // -----------------------------------------------------------------------
    if (action === 'delete') {
      if (!fs.existsSync(resolvedPath)) {
        return { error: `File non trovato per eliminazione: ${filePath}` };
      }
      try {
        fs.unlinkSync(resolvedPath);
        retryTracker.delete(filePath);
        return { success: true, path: filePath, action: 'delete' };
      } catch (err) {
        return { error: `Errore nell'eliminazione del file ${filePath}: ${String(err)}` };
      }
    }

    // -----------------------------------------------------------------------
    // Step 3: Load component spec if this is an .astro file
    // -----------------------------------------------------------------------
    let specContent: string | null = null;
    if (filePath.endsWith('.astro')) {
      const componentName = path.basename(filePath, '.astro');
      const specPath = path.resolve(
        PROJECT_ROOT,
        `src/components/specs/${componentName}.md`
      );
      if (fs.existsSync(specPath)) {
        try {
          specContent = fs.readFileSync(specPath, 'utf-8');
        } catch {
          specContent = null;
        }
      }
      // specContent remains null if spec file does not exist
    }

    // -----------------------------------------------------------------------
    // Step 4: Guardian validation
    // -----------------------------------------------------------------------
    const guardianResult = guardian(filePath, content, action, specContent);

    if (!guardianResult.valid) {
      // Increment retry counter for this path
      const attempts = (retryTracker.get(filePath) ?? 0) + 1;
      retryTracker.set(filePath, attempts);

      if (attempts >= 3) {
        // Abort the entire agent loop
        throw new GuardianAbortError(guardianResult.violations);
      }

      return {
        error: 'Guardian validation failed',
        violations: guardianResult.violations,
      };
    }

    // -----------------------------------------------------------------------
    // Step 5: Write the file
    // -----------------------------------------------------------------------
    try {
      // Ensure parent directory exists
      const parentDir = path.dirname(resolvedPath);
      fs.mkdirSync(parentDir, { recursive: true });

      fs.writeFileSync(resolvedPath, content, 'utf-8');

      // Reset retry counter on success
      retryTracker.delete(filePath);

      return { success: true, path: filePath, action };
    } catch (err) {
      return { error: `Errore nella scrittura del file ${filePath}: ${String(err)}` };
    }
  };
}
