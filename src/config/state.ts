import { configPath } from '../lib/paths.js'
import type { MihoroConfig } from '../lib/types.js'
import { readYaml, writeYaml } from '../lib/yaml.js'
import { readNodeIndexes, resolveNodeHash } from './node-index.js'

const defaultConfig: MihoroConfig = {
  proxyHost: '127.0.0.1',
  proxyBypass: ['localhost', '127.0.0.1', '192.168.0.0/16', '10.0.0.0/8', '172.16.0.0/12', '::1'],
  defaultNodes: {},
  subscriptionDefaultNodes: {},
  subscriptionDefaultNodeHashes: {}
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
    defaultNodes: normalizeNodeMap(config.defaultNodes),
    subscriptionDefaultNodes: normalizeSubscriptionNodeMap(config.subscriptionDefaultNodes),
    subscriptionDefaultNodeHashes: normalizeSubscriptionNodeMap(config.subscriptionDefaultNodeHashes)
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

/**
 * Reads default node selections for one subscription.
 *
 * @param subscriptionId Current subscription id.
 * @returns Default node selections for the subscription, with legacy fallback.
 */
export async function readDefaultNodesForSubscription(subscriptionId: string): Promise<Record<string, string>> {
  const config = await readConfig()
  return config.subscriptionDefaultNodes[subscriptionId] || config.defaultNodes
}

/**
 * Saves a default node selection for one subscription.
 *
 * @param subscriptionId Current subscription id.
 * @param group Proxy group name.
 * @param node Node name selected for the group.
 * @returns Updated mihoro config.
 */
export async function saveDefaultNodeForSubscription(
  subscriptionId: string,
  group: string,
  node: string
): Promise<MihoroConfig> {
  return updateConfig((config) => {
    const currentDefaults = config.subscriptionDefaultNodes[subscriptionId] || {}
    return {
      ...config,
      subscriptionDefaultNodes: {
        ...config.subscriptionDefaultNodes,
        [subscriptionId]: {
          ...currentDefaults,
          [group]: node
        }
      }
    }
  })
}

/**
 * Reads default node hashes for one subscription.
 *
 * @param subscriptionId Current subscription id.
 * @returns Default full node hashes for the subscription.
 */
export async function readDefaultNodeHashesForSubscription(subscriptionId: string): Promise<Record<string, string>> {
  const config = await readConfig()
  return config.subscriptionDefaultNodeHashes[subscriptionId] || {}
}

/**
 * Resolves default node selections to full hashes, migrating legacy node names when possible.
 *
 * @param subscriptionId Current subscription id.
 * @returns Default full node hashes for the subscription.
 */
export async function resolveDefaultNodeHashesForSubscription(subscriptionId: string): Promise<Record<string, string>> {
  const config = await readConfig()
  const currentHashes = config.subscriptionDefaultNodeHashes[subscriptionId]
  if (currentHashes && Object.keys(currentHashes).length > 0) return currentHashes

  const legacy = config.subscriptionDefaultNodes[subscriptionId] || config.defaultNodes
  const migrated = await resolveLegacyDefaultNodes(subscriptionId, legacy)
  if (Object.keys(migrated).length === 0) return {}
  await updateConfig((next) => ({
    ...next,
    subscriptionDefaultNodeHashes: {
      ...next.subscriptionDefaultNodeHashes,
      [subscriptionId]: migrated
    }
  }))
  return migrated
}

/**
 * Saves a default node hash selection for one subscription.
 *
 * @param subscriptionId Current subscription id.
 * @param group Proxy group name.
 * @param nodeHash Full node hash selected for the group.
 * @returns Updated mihoro config.
 */
export async function saveDefaultNodeHashForSubscription(
  subscriptionId: string,
  group: string,
  nodeHash: string
): Promise<MihoroConfig> {
  return updateConfig((config) => {
    const currentDefaults = config.subscriptionDefaultNodeHashes[subscriptionId] || {}
    return {
      ...config,
      subscriptionDefaultNodeHashes: {
        ...config.subscriptionDefaultNodeHashes,
        [subscriptionId]: {
          ...currentDefaults,
          [group]: nodeHash
        }
      }
    }
  })
}

/**
 * Resolves legacy default node values to full hashes.
 *
 * @param subscriptionId Current subscription id.
 * @param legacy Legacy group to node value map.
 * @returns Group to full hash map.
 */
async function resolveLegacyDefaultNodes(subscriptionId: string, legacy: Record<string, string>): Promise<Record<string, string>> {
  const indexes = await readNodeIndexes()
  const entries = Object.values(indexes.subscriptions[subscriptionId]?.nodes || {})
  const resolved: Record<string, string> = {}
  for (const [group, value] of Object.entries(legacy)) {
    const byName = entries.find((entry) => entry.name === value)
    if (byName) {
      resolved[group] = byName.hash
      continue
    }
    try {
      resolved[group] = (await resolveNodeHash(subscriptionId, value)).hash
    } catch {
      // Ignore stale legacy values. Runtime application reports missing saved hashes later.
    }
  }
  return resolved
}

/**
 * Normalizes a proxy group to node map.
 *
 * @param value Raw config value.
 * @returns String-only node map.
 */
function normalizeNodeMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
}

/**
 * Normalizes subscription-scoped default node maps.
 *
 * @param value Raw config value.
 * @returns String-only maps keyed by subscription id.
 */
function normalizeSubscriptionNodeMap(value: unknown): Record<string, Record<string, string>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .map(([subscriptionId, nodes]) => [subscriptionId, normalizeNodeMap(nodes)] as const)
      .filter(([, nodes]) => Object.keys(nodes).length > 0)
  )
}
