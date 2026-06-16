import { existsSync } from 'node:fs'
import { readConfig } from './config/state.js'
import { readControlledConfig } from './config/controlled.js'
import { readSubscriptions } from './config/subscriptions.js'
import { serviceStatus } from './service/service.js'
import { listGroups } from './mihomo/api.js'
import { runtimeConfigPath, socketPath } from './lib/paths.js'
import type { JsonMap, MihomoProxy } from './lib/types.js'

/**
 * Builds a human-readable summary of current mihoro and mihomo state.
 *
 * @returns Formatted info lines.
 */
export async function showInfo(): Promise<string> {
  const [userConfig, controlledConfig, subscriptions, status] = await Promise.all([
    readConfig(),
    readControlledConfig(),
    readSubscriptions(),
    serviceStatus()
  ])
  const runtimeExists = existsSync(runtimeConfigPath())
  const port = Number(controlledConfig['mixed-port'] || 7890)
  const tun = objectValue(controlledConfig.tun)
  const groups = await runningGroups(status)
  const lines = [
    `service: ${status}`,
    `runtime: ${runtimeExists ? runtimeConfigPath() : 'missing'}`,
    `api socket: ${socketPath()}`,
    `subscription: ${subscriptions.current || 'none'}`,
    `proxy mode: ${String(controlledConfig.mode || 'rule')}`,
    `system proxy target: ${userConfig.proxyHost}:${port}`,
    `mixed-port: ${port}`,
    `allow-lan: ${String(controlledConfig['allow-lan'] ?? false)}`,
    `tun: ${String(tun?.enable ?? false)}`,
    `proxy groups: ${formatGroups(groups)}`
  ]
  return lines.join('\n')
}

/**
 * Reads running mihomo proxy groups when the service is available.
 *
 * @param status Current service status.
 * @returns Proxy groups or undefined when mihomo API is unavailable.
 */
async function runningGroups(status: string): Promise<MihomoProxy[] | undefined> {
  if (!status.startsWith('running ')) return undefined
  try {
    return await listGroups()
  } catch {
    return undefined
  }
}

/**
 * Formats proxy group selections.
 *
 * @param groups Running proxy groups, if available.
 * @returns Human-readable group selections.
 */
function formatGroups(groups: MihomoProxy[] | undefined): string {
  if (!groups) return 'unavailable'
  if (groups.length === 0) return 'none'
  return groups.map((group) => `${group.name}=${group.now || 'unknown'}`).join(', ')
}

/**
 * Narrows a value to a JSON object.
 *
 * @param value Value to inspect.
 * @returns Object value or undefined.
 */
function objectValue(value: unknown): JsonMap | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as JsonMap
}
