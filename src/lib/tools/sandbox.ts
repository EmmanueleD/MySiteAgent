import path from 'node:path';

/**
 * Allowed root directories (relative to project root).
 * Files outside these directories cannot be read or written.
 */
export const ALLOWED_ROOTS = ['src', 'public', 'content'] as const;

/**
 * Error thrown when a file path violates the sandbox rules.
 */
export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxError';
  }
}

/**
 * Validates that the given filePath is within the allowed sandbox roots.
 *
 * @param filePath - The path to validate (relative or absolute)
 * @param projectRoot - The project root directory (defaults to PROJECT_ROOT env or cwd)
 * @throws SandboxError if the path is absolute or outside the allowed roots
 */
export function assertSandboxed(
  filePath: string,
  projectRoot: string = ((import.meta.env['PROJECT_ROOT'] as string | undefined) ?? process.env['PROJECT_ROOT']) ?? process.cwd()
): void {
  // Reject absolute paths immediately
  if (path.isAbsolute(filePath)) {
    throw new SandboxError(
      `Percorso assoluto non consentito: ${filePath}`
    );
  }

  const resolved = path.resolve(projectRoot, filePath);
  const allowedAbsolute = ALLOWED_ROOTS.map(r => path.resolve(projectRoot, r));

  const isAllowed = allowedAbsolute.some(
    root => resolved.startsWith(root + path.sep) || resolved === root
  );

  if (!isAllowed) {
    throw new SandboxError(
      `Accesso negato: ${filePath} è fuori dalle radici consentite (src/, public/, content/)`
    );
  }
}
