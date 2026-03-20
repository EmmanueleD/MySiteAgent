/**
 * Shared error types for the agent loop system.
 * Isolated to avoid circular imports between agent-loop.ts and write-file.ts.
 */

/**
 * Thrown by the write_file tool after 3 consecutive Guardian validation failures
 * on the same file path. Causes the agent loop to abort immediately.
 */
export class GuardianAbortError extends Error {
  public readonly violations: string[];

  constructor(violations: string[]) {
    super('Guardian validation failed after 3 attempts');
    this.name = 'GuardianAbortError';
    this.violations = violations;
  }
}
