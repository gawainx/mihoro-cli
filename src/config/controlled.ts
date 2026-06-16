import { controlledConfigPath } from '../lib/paths.js'
import type { JsonMap } from '../lib/types.js'
import { readYaml, writeYaml } from '../lib/yaml.js'
import { MihoroError } from '../lib/errors.js'

export type ProxyModeKind = 'rules' | 'global' | 'direct'

const proxyModeByKind: Record<ProxyModeKind, string> = {
  rules: 'rule',
  global: 'global',
  direct: 'direct'
}

const defaultControlledConfig: JsonMap = {
  'mixed-port': 7890,
  'allow-lan': false,
  mode: 'rule',
  'log-level': 'info',
  dns: {
    enable: true,
    listen: '0.0.0.0:1053',
    'enhanced-mode': 'fake-ip',
    nameserver: ['https://dns.alidns.com/dns-query', 'https://doh.pub/dns-query']
  },
  tun: {
    enable: false,
    stack: 'mixed',
    'auto-route': true,
    'auto-detect-interface': true,
    'dns-hijack': ['any:53']
  },
  'geodata-mode': false,
  'geo-auto-update': false,
  'geo-update-interval': 24,
  'geox-url': {
    geoip: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.metadb',
    mmdb: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/country-lite.mmdb',
    asn: 'https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/GeoLite2-ASN.mmdb'
  }
}

/**
 * Reads mihoro-controlled mihomo config.
 *
 * @returns Controlled mihomo config.
 */
export async function readControlledConfig(): Promise<JsonMap> {
  const config = await readYaml<JsonMap>(controlledConfigPath(), defaultControlledConfig)
  return deepMerge(defaultControlledConfig, config)
}

/**
 * Writes mihoro-controlled mihomo config.
 *
 * @param config Controlled config to write.
 * @returns Nothing after config is written.
 */
export async function writeControlledConfig(config: JsonMap): Promise<void> {
  await writeYaml(controlledConfigPath(), deepMerge(defaultControlledConfig, config))
}

/**
 * Enables or disables controlled TUN config.
 *
 * @param enabled Desired TUN state.
 * @returns Updated controlled config.
 */
export async function setTunEnabled(enabled: boolean): Promise<JsonMap> {
  const config = await readControlledConfig()
  const tun = typeof config.tun === 'object' && config.tun ? (config.tun as JsonMap) : {}
  const dns = typeof config.dns === 'object' && config.dns ? (config.dns as JsonMap) : {}
  config.tun = { ...tun, enable: enabled }
  if (enabled) config.dns = { ...dns, enable: true }
  await writeControlledConfig(config)
  return config
}

/**
 * Sets the mihomo proxy routing mode.
 *
 * @param kind User-facing proxy mode kind.
 * @returns Updated controlled config.
 */
export async function setProxyMode(kind: ProxyModeKind): Promise<JsonMap> {
  const config = await readControlledConfig()
  config.mode = proxyModeByKind[kind]
  await writeControlledConfig(config)
  return config
}

/**
 * Parses the proxy mode kind accepted by the CLI.
 *
 * @param value User-provided proxy mode kind.
 * @returns Validated proxy mode kind.
 */
export function parseProxyModeKind(value: string): ProxyModeKind {
  if (value === 'rules' || value === 'global' || value === 'direct') return value
  throw new MihoroError('Expected proxy kind to be one of: rules, global, direct.')
}

/**
 * Enables or disables mihomo GeoData auto updates.
 *
 * @param enabled Desired auto-update state.
 * @returns Updated controlled config.
 */
export async function setGeoAutoUpdate(enabled: boolean): Promise<JsonMap> {
  const config = await readControlledConfig()
  config['geo-auto-update'] = enabled
  config['geodata-mode'] = false
  await writeControlledConfig(config)
  return config
}

/**
 * Sets the mihomo GeoData update interval in hours.
 *
 * @param hours Positive update interval in hours.
 * @returns Updated controlled config.
 */
export async function setGeoUpdateInterval(hours: number): Promise<JsonMap> {
  if (!Number.isInteger(hours) || hours <= 0) {
    throw new MihoroError('Geo update interval must be a positive integer hour value.')
  }
  const config = await readControlledConfig()
  config['geo-update-interval'] = hours
  config['geodata-mode'] = false
  await writeControlledConfig(config)
  return config
}

/**
 * Deep merges plain objects in the same direction as Clash Party runtime config generation.
 *
 * @param base Base object.
 * @param patch Patch object whose values win.
 * @returns Merged object.
 */
export function deepMerge<T extends JsonMap>(base: T, patch: JsonMap): T {
  const result: JsonMap = structuredClone(base)
  for (const [key, value] of Object.entries(patch)) {
    const current = result[key]
    if (isPlainObject(current) && isPlainObject(value)) {
      result[key] = deepMerge(current, value)
    } else {
      result[key] = value
    }
  }
  return result as T
}

/**
 * Checks whether a value is a plain object.
 *
 * @param value Value to inspect.
 * @returns True when the value is a plain object.
 */
function isPlainObject(value: unknown): value is JsonMap {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
