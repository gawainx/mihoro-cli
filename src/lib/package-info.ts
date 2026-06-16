import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface PackageInfo {
  /** Package version published by npm-compatible tarballs. */
  version: string
}

/**
 * Reads package metadata from the project package.json.
 *
 * @returns Parsed package metadata used by the CLI.
 */
function readPackageInfo(): PackageInfo {
  const sourceDir = dirname(fileURLToPath(import.meta.url))
  const packagePath = resolve(sourceDir, '../../package.json')
  const raw = JSON.parse(readFileSync(packagePath, 'utf8')) as Partial<PackageInfo>
  return { version: raw.version || '0.0.0' }
}

export const packageInfo = readPackageInfo()
