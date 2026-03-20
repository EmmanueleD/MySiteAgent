import fs from 'node:fs';
import path from 'node:path';
import { assertSandboxed, SandboxError } from './sandbox.js';

type ReadFileSuccess = { content: string; path: string };
type ReadFileError = { error: string };
export type ReadFileResult = ReadFileSuccess | ReadFileError;

const PROJECT_ROOT =
  ((import.meta.env['PROJECT_ROOT'] as string | undefined) ?? process.env['PROJECT_ROOT']) ??
  process.cwd();

/**
 * Reads the content of a file within the sandbox.
 *
 * @param filePath - Relative path from project root (must be within src/, public/, or content/)
 * @returns { content, path } on success, { error } on failure
 */
export function readFileTool(filePath: string): ReadFileResult {
  try {
    assertSandboxed(filePath, PROJECT_ROOT);
  } catch (err) {
    if (err instanceof SandboxError) {
      return { error: 'Accesso negato: percorso fuori dai limiti consentiti' };
    }
    return { error: `Errore di validazione percorso: ${String(err)}` };
  }

  const resolvedPath = path.resolve(PROJECT_ROOT, filePath);

  try {
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    return { content, path: filePath };
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') {
      return { error: `File non trovato: ${filePath}` };
    }
    return { error: `Errore nella lettura del file ${filePath}: ${String(err)}` };
  }
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
