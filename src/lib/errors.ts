export class MihoroError extends Error {
  /** Process exit code that should be used for this CLI error. */
  readonly exitCode: number

  /**
   * Creates a user-facing mihoro-cli error.
   *
   * @param message Message printed to stderr.
   * @param exitCode Process exit code for the failure.
   * @returns A configured Error instance.
   */
  constructor(message: string, exitCode = 1) {
    super(message)
    this.name = 'MihoroError'
    this.exitCode = exitCode
  }
}

/**
 * Returns a readable message for unknown thrown values.
 *
 * @param error Unknown caught value.
 * @returns Human-readable error message.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    try {
      return JSON.stringify(error)
    } catch {
      return Object.prototype.toString.call(error)
    }
  }
  return String(error)
}
