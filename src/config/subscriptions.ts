import { mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { parse } from 'yaml'
import { profilePath, profilesDir, subscriptionsPath } from '../lib/paths.js'
import type { JsonMap, SubscriptionItem, SubscriptionState } from '../lib/types.js'
import { readYaml, writeYaml } from '../lib/yaml.js'
import { MihoroError } from '../lib/errors.js'

const emptyState: SubscriptionState = { items: [] }

/**
 * Reads the subscription state.
 *
 * @returns Normalized subscription state.
 */
export async function readSubscriptions(): Promise<SubscriptionState> {
  const state = await readYaml<SubscriptionState>(subscriptionsPath(), emptyState)
  return {
    current: state.current,
    items: Array.isArray(state.items) ? state.items : []
  }
}

/**
 * Writes the subscription state.
 *
 * @param state State to persist.
 * @returns Nothing after state is written.
 */
export async function writeSubscriptions(state: SubscriptionState): Promise<void> {
  await writeYaml(subscriptionsPath(), state)
}

/**
 * Adds or replaces a subscription profile.
 *
 * @param name Unique subscription name.
 * @param url Remote subscription URL.
 * @returns Added subscription item.
 */
export async function addSubscription(name: string, url: string): Promise<SubscriptionItem> {
  const state = await readSubscriptions()
  const id = slugify(name)
  const profile = await fetchProfile(url)
  validateProfile(profile)
  await mkdir(profilesDir(), { recursive: true })
  await writeYaml(profilePath(id), profile)
  const item: SubscriptionItem = { id, name, url, updatedAt: new Date().toISOString() }
  const items = state.items.filter((existing) => existing.id !== id)
  items.push(item)
  await writeSubscriptions({ current: state.current || id, items })
  return item
}

/**
 * Removes a subscription and clears it from current if needed.
 *
 * @param idOrName Subscription id or name.
 * @returns Removed subscription item.
 */
export async function removeSubscription(idOrName: string): Promise<SubscriptionItem> {
  const state = await readSubscriptions()
  const item = findSubscription(state, idOrName)
  const items = state.items.filter((candidate) => candidate.id !== item.id)
  await rm(profilePath(item.id), { force: true })
  await writeSubscriptions({
    current: state.current === item.id ? items[0]?.id : state.current,
    items
  })
  return item
}

/**
 * Sets the current active subscription.
 *
 * @param idOrName Subscription id or name.
 * @returns Selected subscription item.
 */
export async function useSubscription(idOrName: string): Promise<SubscriptionItem> {
  const state = await readSubscriptions()
  const item = findSubscription(state, idOrName)
  await writeSubscriptions({ ...state, current: item.id })
  return item
}

/**
 * Returns the current subscription item.
 *
 * @returns Current subscription item.
 */
export async function currentSubscription(): Promise<SubscriptionItem> {
  const state = await readSubscriptions()
  if (!state.current) throw new MihoroError('No current subscription. Run sub add first.')
  return findSubscription(state, state.current)
}

/**
 * Finds a subscription by id or name.
 *
 * @param state Subscription state to search.
 * @param idOrName Subscription id or name.
 * @returns Matching subscription item.
 */
export function findSubscription(state: SubscriptionState, idOrName: string): SubscriptionItem {
  const item = state.items.find((candidate) => candidate.id === idOrName || candidate.name === idOrName)
  if (!item) throw new MihoroError(`Subscription not found: ${idOrName}`)
  return item
}

/**
 * Fetches and parses a remote profile YAML.
 *
 * @param url Remote subscription URL.
 * @returns Parsed profile object.
 */
async function fetchProfile(url: string): Promise<JsonMap> {
  const response = await fetch(url, { headers: { 'user-agent': 'mihoro-cli/0.1.0' } })
  if (!response.ok) throw new MihoroError(`Failed to download subscription: ${response.status} ${response.statusText}`)
  const text = await response.text()
  const profile = parse(text)
  if (!profile || typeof profile !== 'object') throw new MihoroError('Downloaded subscription is not a YAML object.')
  return profile as JsonMap
}

/**
 * Validates that a mihomo profile contains usable proxy definitions.
 *
 * @param profile Parsed profile object.
 * @returns Nothing when the profile is valid.
 */
function validateProfile(profile: JsonMap): void {
  if (!Array.isArray(profile.proxies) && !profile['proxy-providers']) {
    throw new MihoroError('Subscription must contain proxies or proxy-providers.')
  }
}

/**
 * Converts a subscription name to a stable file-safe id.
 *
 * @param value Subscription name.
 * @returns File-safe id.
 */
function slugify(value: string): string {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!slug) throw new MihoroError('Subscription name must contain at least one letter or number.')
  return slug
}
