import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { geodataDir } from '../lib/paths.js'
import { MihoroError } from '../lib/errors.js'

interface GeodataResource {
  /** File name mihomo expects in its work directory. */
  fileName: string
  /** Remote URL used when the local database file is missing. */
  url: string
}

const geodataResources: GeodataResource[] = [
  {
    fileName: 'geoip.metadb',
    url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.metadb'
  },
  {
    fileName: 'country.mmdb',
    url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/country-lite.mmdb'
  },
  {
    fileName: 'ASN.mmdb',
    url: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/GeoLite2-ASN.mmdb'
  }
]

/**
 * Ensures db-mode GeoData resource files exist before mihomo starts.
 *
 * @returns Nothing after all missing resources are downloaded.
 */
export async function ensureGeodataResources(): Promise<void> {
  await mkdir(geodataDir(), { recursive: true })
  for (const resource of geodataResources) {
    await ensureGeodataResource(resource)
  }
}

/**
 * Returns the configured db-mode GeoData resource metadata.
 *
 * @returns Array of GeoData resources used by mihoro-cli.
 */
export function listGeodataResources(): GeodataResource[] {
  return structuredClone(geodataResources)
}

/**
 * Downloads one resource only when the target file is missing.
 *
 * @param resource GeoData resource metadata.
 * @returns Nothing after the resource exists locally.
 */
async function ensureGeodataResource(resource: GeodataResource): Promise<void> {
  const targetPath = path.join(geodataDir(), resource.fileName)
  if (existsSync(targetPath)) return
  await downloadResource(resource.url, targetPath)
}

/**
 * Downloads a URL to a local path using a temporary file and atomic rename.
 *
 * @param url Remote resource URL.
 * @param targetPath Absolute file path to write.
 * @returns Nothing after the file has been written.
 */
async function downloadResource(url: string, targetPath: string): Promise<void> {
  const temporaryPath = `${targetPath}.download`
  await rm(temporaryPath, { force: true })
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new MihoroError(`Failed to download GeoData resource ${url}: ${response.status}`)
  }
  try {
    await pipeline(response.body, createWriteStream(temporaryPath))
    await rename(temporaryPath, targetPath)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}
