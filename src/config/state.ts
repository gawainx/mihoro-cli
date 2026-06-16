import { configPath } from '../lib/paths.js'
import type { MihoroConfig } from '../lib/types.js'
import { readYaml, writeYaml } from '../lib/yaml.js'

const defaultConfig: MihoroConfig = {
  proxyHost: '127.0.0.1',
  proxyBypass: ['localhost', '127.0.0.1', '192.168.0.0/16', '10.0.0.0/8', '172.16.0.0/12', '::1'],
  defaultNodes: {}
}

/**
 * Reads mihoro-cli user config.
 *
 * @returns Normalized user config.
 */
export async function readConfig(): Promise<MihoroConfig> {
  const config = await readYaml<MihoroConfig>(configPath(), defaultConfig)
  return {
    proxyHost: config.proxyHost || defaultConfig.proxyHost,
    proxyBypass: Array.isArray(config.proxyBypass) ? config.proxyBypass : defaultConfig.proxyBypass,
    defaultNodes: config.defaultNodes && typeof config.defaultNodes === 'object' ? config.defaultNodes : {}
  }
}

/**
 * Writes mihoro-cli user config.
 *
 * @param config Config to persist.
 * @returns Nothing after config is written.
 */
export async function writeConfig(config: MihoroConfig): Promise<void> {
  await writeYaml(configPath(), config)
}

/**
 * Updates mihoro-cli user config.
 *
 * @param updater Function that mutates or returns a config object.
 * @returns Updated config.
 */
export async function updateConfig(
  updater: (config: MihoroConfig) => MihoroConfig | Promise<MihoroConfig>
): Promise<MihoroConfig> {
  const next = await updater(await readConfig())
  await writeConfig(next)
  return next
}
