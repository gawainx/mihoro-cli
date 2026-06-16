import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { parse, stringify } from 'yaml'

/**
 * Reads a YAML file or returns a fallback if it does not exist.
 *
 * @param filePath Absolute YAML file path.
 * @param fallback Value returned when the file is missing or empty.
 * @returns Parsed YAML value.
 */
export async function readYaml<T>(filePath: string, fallback: T): Promise<T> {
  if (!existsSync(filePath)) return structuredClone(fallback)
  const text = await readFile(filePath, 'utf8')
  const value = parse(text)
  return (value ?? structuredClone(fallback)) as T
}

/**
 * Writes a value as YAML, creating parent directories as needed.
 *
 * @param filePath Absolute YAML file path.
 * @param value Value to serialize.
 * @returns Nothing after the file has been written.
 */
export async function writeYaml(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, stringify(value), 'utf8')
}
