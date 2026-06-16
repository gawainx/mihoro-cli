import { appendFile, mkdir } from 'node:fs/promises'
import { logDir } from './paths.js'

type LogLevel = 'info' | 'warn' | 'error'

/**
 * Writes a timestamped log line to the mihoro-cli log file.
 *
 * @param level Log severity.
 * @param message Log message.
 * @param detail Optional structured detail to append.
 * @returns Nothing after the line has been written.
 */
export async function log(level: LogLevel, message: string, detail?: unknown): Promise<void> {
  await mkdir(logDir(), { recursive: true })
  const suffix = detail === undefined ? '' : ` ${JSON.stringify(detail)}`
  await appendFile(logFilePath(), `[${new Date().toISOString()}] ${level} ${message}${suffix}\n`)
}

/**
 * Returns the current mihoro-cli log file path.
 *
 * @returns Absolute path to the daily CLI log file.
 */
export function logFilePath(): string {
  const day = new Date().toISOString().slice(0, 10)
  return `${logDir()}/mihoro-${day}.log`
}
