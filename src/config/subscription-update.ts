import { mkdir } from 'node:fs/promises'
import axios from 'axios'
import { parse } from 'yaml'
import { generateRuntimeConfig } from './runtime.js'
import { readControlledConfig } from './controlled.js'
import { readConfig } from './state.js'
import { findSubscription, readSubscriptions, validateProfile, writeSubscriptions } from './subscriptions.js'
import { profilePath, profilesDir } from '../lib/paths.js'
import { writeYaml } from '../lib/yaml.js'
import type { JsonMap, SubscriptionItem, SubscriptionState } from '../lib/types.js'
import { errorMessage, MihoroError } from '../lib/errors.js'
import { formatTable } from '../lib/table.js'
import { restartServiceProcess, serviceStatus } from '../service/service.js'

export type SubscriptionUpdateStatus = 'updated' | 'failed' | 'skipped'

export type SubscriptionFetchMode = 'direct' | 'proxy' | 'proxy-fallback'

export interface SubscriptionUpdateOptions {
  /** Whether the update should directly use the mihomo proxy endpoint. */
  useProxy: boolean
}

export interface SubscriptionFetchResult {
  /** Parsed and validated subscription profile. */
  profile: JsonMap
  /** Actual download path used for the successful request. */
  mode: SubscriptionFetchMode
}

export type SubscriptionProfileDownloader = (url: string, mode: 'direct' | 'proxy') => Promise<string>

export interface SubscriptionUpdateResult {
  /** Stable subscription id. */
  id: string
  /** Human-readable subscription name. */
  name: string
  /** Update outcome for this subscription. */
  status: SubscriptionUpdateStatus
  /** Actual download path, when a download was attempted. */
  mode?: SubscriptionFetchMode
  /** Whether this subscription was current when the update started. */
  current: boolean
  /** ISO timestamp for a successful profile write. */
  updatedAt?: string
  /** User-facing result details. */
  detail: string
}

interface ProxyEndpoint {
  /** HTTP proxy host. */
  host: string
  /** HTTP proxy port. */
  port: number
}

/**
 * Fetches and validates a subscription profile using Clash Party's update strategy.
 *
 * @param url Remote subscription URL.
 * @param options Update options controlling proxy usage.
 * @returns Parsed profile and actual fetch mode.
 */
export async function fetchSubscriptionProfile(
  url: string,
  options: SubscriptionUpdateOptions
): Promise<SubscriptionFetchResult> {
  return fetchSubscriptionProfileWithDownloader(url, options, downloadSubscriptionProfile)
}

/**
 * Fetches and validates a subscription profile with an injected downloader.
 *
 * @param url Remote subscription URL.
 * @param options Update options controlling proxy usage.
 * @param downloader Concrete profile download function.
 * @returns Parsed profile and actual fetch mode.
 */
export async function fetchSubscriptionProfileWithDownloader(
  url: string,
  options: SubscriptionUpdateOptions,
  downloader: SubscriptionProfileDownloader
): Promise<SubscriptionFetchResult> {
  if (options.useProxy) return fetchWithMode(url, 'proxy', downloader)

  try {
    return await fetchWithMode(url, 'direct', downloader)
  } catch (directError) {
    try {
      const result = await fetchWithMode(url, 'proxy', downloader)
      return { ...result, mode: 'proxy-fallback' }
    } catch {
      throw directError
    }
  }
}

/**
 * Orders subscriptions for batch updates, keeping the current subscription last.
 *
 * @param state Subscription state to order.
 * @returns Ordered subscriptions.
 */
export function orderSubscriptionsForUpdate(state: SubscriptionState): SubscriptionItem[] {
  return [
    ...state.items.filter((item) => item.id !== state.current),
    ...state.items.filter((item) => item.id === state.current)
  ]
}

/**
 * Updates one subscription by id or name.
 *
 * @param idOrName Subscription id or name.
 * @param options Update options controlling proxy usage.
 * @returns Update result.
 */
export async function updateSubscription(
  idOrName: string,
  options: SubscriptionUpdateOptions
): Promise<SubscriptionUpdateResult> {
  const state = await readSubscriptions()
  const item = findSubscription(state, idOrName)
  return updateSubscriptionItem(item, state, options, false)
}

/**
 * Updates every configured subscription in Clash Party order.
 *
 * @param options Update options controlling proxy usage.
 * @returns Per-subscription results.
 */
export async function updateAllSubscriptions(options: SubscriptionUpdateOptions): Promise<SubscriptionUpdateResult[]> {
  const state = await readSubscriptions()
  const results: SubscriptionUpdateResult[] = []
  for (const item of orderSubscriptionsForUpdate(state)) {
    results.push(await updateSubscriptionItem(item, state, options, true))
  }
  return results
}

/**
 * Renders subscription update results as a table.
 *
 * @param results Per-subscription results.
 * @returns Formatted result table.
 */
export function renderSubscriptionUpdateResults(results: SubscriptionUpdateResult[]): string {
  return formatTable({
    head: ['Subscription', 'ID', 'Current', 'Status', 'Mode', 'Detail'],
    rows: results.map((result) => [
      result.name,
      result.id,
      result.current ? '*' : '',
      result.status,
      result.mode || '-',
      result.detail
    ])
  })
}

/**
 * Checks whether a result list contains a failed update.
 *
 * @param results Per-subscription results.
 * @returns True when at least one update failed.
 */
export function hasSubscriptionUpdateFailure(results: SubscriptionUpdateResult[]): boolean {
  return results.some((result) => result.status === 'failed')
}

/**
 * Updates one subscription item and normalizes failures into result rows.
 *
 * @param item Subscription item to update.
 * @param state State captured before the update.
 * @param options Update options controlling proxy usage.
 * @param skipMissingUrl Whether subscriptions without URLs should be skipped.
 * @returns Update result.
 */
async function updateSubscriptionItem(
  item: SubscriptionItem,
  state: SubscriptionState,
  options: SubscriptionUpdateOptions,
  skipMissingUrl: boolean
): Promise<SubscriptionUpdateResult> {
  const current = state.current === item.id
  if (!item.url) {
    return {
      id: item.id,
      name: item.name,
      current,
      status: skipMissingUrl ? 'skipped' : 'failed',
      detail: 'subscription has no URL'
    }
  }

  try {
    const fetched = await fetchSubscriptionProfile(item.url, options)
    const updatedAt = new Date().toISOString()
    await mkdir(profilesDir(), { recursive: true })
    await writeYaml(profilePath(item.id), fetched.profile)
    await replaceSubscriptionItem(item.id, { ...item, updatedAt })
    if (current) await refreshRuntimeForUpdatedSubscription()
    return {
      id: item.id,
      name: item.name,
      current,
      status: 'updated',
      mode: fetched.mode,
      updatedAt,
      detail: `updated at ${updatedAt}`
    }
  } catch (error) {
    return {
      id: item.id,
      name: item.name,
      current,
      status: 'failed',
      mode: options.useProxy ? 'proxy' : 'direct',
      detail: errorMessage(error)
    }
  }
}

/**
 * Replaces one subscription item in persisted state.
 *
 * @param id Subscription id to replace.
 * @param next Replacement item.
 * @returns Nothing after the state is written.
 */
async function replaceSubscriptionItem(id: string, next: SubscriptionItem): Promise<void> {
  const state = await readSubscriptions()
  await writeSubscriptions({
    ...state,
    items: state.items.map((item) => (item.id === id ? next : item))
  })
}

/**
 * Regenerates runtime config and restarts mihomo when it is already running.
 *
 * @returns Generated runtime config path.
 */
async function refreshRuntimeForUpdatedSubscription(): Promise<string> {
  const runtimePath = await generateRuntimeConfig()
  const status = await serviceStatus()
  if (status.startsWith('running ')) await restartServiceProcess()
  return runtimePath
}

/**
 * Fetches a profile through one concrete path.
 *
 * @param url Remote subscription URL.
 * @param mode Concrete fetch mode.
 * @returns Parsed profile and fetch mode.
 */
async function fetchWithMode(
  url: string,
  mode: 'direct' | 'proxy',
  downloader: SubscriptionProfileDownloader = downloadSubscriptionProfile
): Promise<SubscriptionFetchResult> {
  const data = await downloader(url, mode)
  const profile = parse(data)
  if (!profile || typeof profile !== 'object') throw new MihoroError('Downloaded subscription is not a YAML object.')
  validateProfile(profile as JsonMap)
  return { profile: profile as JsonMap, mode }
}

/**
 * Downloads a remote profile through one concrete path.
 *
 * @param url Remote subscription URL.
 * @param mode Concrete fetch mode.
 * @returns Raw profile YAML text.
 */
async function downloadSubscriptionProfile(url: string, mode: 'direct' | 'proxy'): Promise<string> {
  const proxy = mode === 'proxy' ? await readProxyEndpoint() : false
  const response = await axios.get<string>(url, {
    headers: { 'user-agent': 'mihoro-cli/0.1.0' },
    responseType: 'text',
    transformResponse: [(data) => data],
    validateStatus: () => true,
    proxy
  })
  if (response.status < 200 || response.status >= 300) {
    throw new MihoroError(`Failed to download subscription: ${response.status} ${response.statusText}`)
  }
  return typeof response.data === 'string' ? response.data : String(response.data ?? '')
}

/**
 * Reads and validates the mihomo HTTP proxy endpoint.
 *
 * @returns Axios HTTP proxy endpoint.
 */
async function readProxyEndpoint(): Promise<ProxyEndpoint> {
  const [config, controlled] = await Promise.all([readConfig(), readControlledConfig()])
  const port = Number(controlled['mixed-port'])
  if (!Number.isInteger(port) || port <= 0) throw new MihoroError(`Invalid mixed-port for proxy update: ${String(controlled['mixed-port'])}`)
  return { host: config.proxyHost, port }
}
