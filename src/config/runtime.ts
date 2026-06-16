import { mkdir } from 'node:fs/promises'
import { parse } from 'yaml'
import { readFile } from 'node:fs/promises'
import { currentSubscription } from './subscriptions.js'
import { readControlledConfig, deepMerge } from './controlled.js'
import { profilePath, runtimeConfigPath, workDir } from '../lib/paths.js'
import type { JsonMap } from '../lib/types.js'
import { writeYaml } from '../lib/yaml.js'

/**
 * Generates the mihomo runtime config from current profile and controlled config.
 *
 * @returns Absolute path to the generated runtime config.
 */
export async function generateRuntimeConfig(): Promise<string> {
  const current = await currentSubscription()
  const profile = parse(await readFile(profilePath(current.id), 'utf8')) as JsonMap
  const controlled = await readControlledConfig()
  const runtime = deepMerge(profile, controlled)
  await mkdir(workDir(), { recursive: true })
  await writeYaml(runtimeConfigPath(), runtime)
  return runtimeConfigPath()
}
