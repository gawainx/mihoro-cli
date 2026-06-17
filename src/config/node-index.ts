import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { nodeIndexesPath } from '../lib/paths.js'
import type { NodeIndexEntry, NodeIndexFile, SubscriptionNodeIndex } from '../lib/types.js'
import { MihoroError } from '../lib/errors.js'

type IndexableNode = {
  /** Original mihomo node name. */
  name: string
  /** Mihomo proxy type when available. */
  type?: string
  /** Visible proxy groups that can select this node. */
  groups?: string[]
  /** Optional full hash used by tests or controlled imports. */
  hash?: string
  /** Optional short hash used by tests or controlled imports. */
  shortHash?: string
}

const emptyNodeIndexes: NodeIndexFile = { subscriptions: {} }

/**
 * Creates the stable full hash for a subscription-scoped node name.
 *
 * @param subscriptionId Subscription id that owns the node.
 * @param nodeName Original mihomo node name.
 * @returns Full SHA-256 hex hash.
 */
export function hashNodeName(subscriptionId: string, nodeName: string): string {
  return createHash('sha256').update(`${subscriptionId}\0${nodeName}`).digest('hex')
}

/**
 * Returns the default short display hash.
 *
 * @param hash Full node hash.
 * @returns 8-character hash prefix.
 */
export function shortNodeHash(hash: string): string {
  return hash.slice(0, 8)
}

/**
 * Reads the persisted node index file.
 *
 * @returns Normalized node index file.
 */
export async function readNodeIndexes(): Promise<NodeIndexFile> {
  const filePath = nodeIndexesPath()
  if (!existsSync(filePath)) return emptyNodeIndexes
  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as NodeIndexFile
    return normalizeNodeIndexFile(parsed)
  } catch {
    return emptyNodeIndexes
  }
}

/**
 * Writes the node index file.
 *
 * @param file Node index file to persist.
 * @returns Nothing after the file is written.
 */
export async function writeNodeIndexes(file: NodeIndexFile): Promise<void> {
  await mkdir(path.dirname(nodeIndexesPath()), { recursive: true })
  await writeFile(nodeIndexesPath(), `${JSON.stringify(normalizeNodeIndexFile(file), null, 2)}\n`, 'utf8')
}

/**
 * Refreshes one subscription's node index from current node data.
 *
 * @param subscriptionId Subscription id to refresh.
 * @param loadNodes Function or node list used to provide current nodes.
 * @returns Refreshed subscription node index.
 */
export async function refreshNodeIndexForSubscription(
  subscriptionId: string,
  loadNodes: (() => Promise<IndexableNode[]> | IndexableNode[]) | IndexableNode[]
): Promise<SubscriptionNodeIndex> {
  const nodes = typeof loadNodes === 'function' ? await loadNodes() : loadNodes
  const entries = Object.fromEntries(
    nodes.map((node) => {
      const hash = node.hash || hashNodeName(subscriptionId, node.name)
      const entry: NodeIndexEntry = {
        hash,
        shortHash: shortNodeHash(node.shortHash || hash),
        name: node.name,
        type: node.type,
        groups: Array.isArray(node.groups) ? node.groups : []
      }
      return [hash, entry]
    })
  )
  const file = await readNodeIndexes()
  const index: SubscriptionNodeIndex = { updatedAt: new Date().toISOString(), nodes: entries }
  await writeNodeIndexes({
    subscriptions: {
      ...file.subscriptions,
      [subscriptionId]: index
    }
  })
  return index
}

/**
 * Resolves a full hash or unique hash prefix to one node index entry.
 *
 * @param subscriptionId Subscription id that owns the node index.
 * @param value Full hash or hash prefix supplied by the user.
 * @param refresh Optional refresh function used when the current index misses.
 * @returns Matching node index entry.
 */
export async function resolveNodeHash(
  subscriptionId: string,
  value: string,
  refresh?: () => Promise<SubscriptionNodeIndex>
): Promise<NodeIndexEntry> {
  const trimmed = value.trim()
  const file = await readNodeIndexes()
  const current = file.subscriptions[subscriptionId]
  const match = findNodeHashMatch(subscriptionId, trimmed, current)
  if (match) return match
  if (refresh) {
    const refreshed = await refresh()
    const refreshedMatch = findNodeHashMatch(subscriptionId, trimmed, refreshed)
    if (refreshedMatch) return refreshedMatch
  }
  throw new MihoroError(`Node hash not found: ${value}. Run "mihoro-cli node list" to refresh and view node hashes.`)
}

/**
 * Finds one unique prefix match in a subscription index.
 *
 * @param subscriptionId Subscription id used in error details.
 * @param value Full hash or hash prefix.
 * @param index Optional subscription index.
 * @returns Matching node index entry or undefined.
 */
function findNodeHashMatch(subscriptionId: string, value: string, index?: SubscriptionNodeIndex): NodeIndexEntry | undefined {
  if (!index || !value) return undefined
  const matches = Object.values(index.nodes).filter((entry) => entry.hash.startsWith(value))
  if (matches.length === 0) return undefined
  if (matches.length > 1) {
    const candidates = matches.map((entry) => `${entry.shortHash}\t${entry.name}`).join('\n')
    throw new MihoroError(
      `Node hash prefix is ambiguous for subscription ${subscriptionId}: ${value}. Use a longer hash prefix.\n${candidates}`
    )
  }
  return matches[0]
}

/**
 * Normalizes a raw node index file.
 *
 * @param value Raw parsed JSON value.
 * @returns Normalized node index file.
 */
function normalizeNodeIndexFile(value: unknown): NodeIndexFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyNodeIndexes
  const subscriptions = (value as NodeIndexFile).subscriptions
  if (!subscriptions || typeof subscriptions !== 'object' || Array.isArray(subscriptions)) return emptyNodeIndexes
  return {
    subscriptions: Object.fromEntries(
      Object.entries(subscriptions)
        .map(([subscriptionId, index]) => [subscriptionId, normalizeSubscriptionNodeIndex(index)] as const)
        .filter(([, index]) => Object.keys(index.nodes).length > 0)
    )
  }
}

/**
 * Normalizes one subscription node index.
 *
 * @param value Raw subscription index.
 * @returns Normalized subscription node index.
 */
function normalizeSubscriptionNodeIndex(value: unknown): SubscriptionNodeIndex {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { updatedAt: '', nodes: {} }
  const raw = value as SubscriptionNodeIndex
  const nodes = raw.nodes && typeof raw.nodes === 'object' && !Array.isArray(raw.nodes) ? raw.nodes : {}
  return {
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
    nodes: Object.fromEntries(
      Object.entries(nodes)
        .map(([, entry]) => normalizeNodeIndexEntry(entry))
        .filter((entry): entry is NodeIndexEntry => Boolean(entry))
        .map((entry) => [entry.hash, entry])
    )
  }
}

/**
 * Normalizes one node index entry.
 *
 * @param value Raw node index entry.
 * @returns Normalized entry or undefined.
 */
function normalizeNodeIndexEntry(value: unknown): NodeIndexEntry | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as NodeIndexEntry
  if (typeof raw.hash !== 'string' || typeof raw.name !== 'string') return undefined
  return {
    hash: raw.hash,
    shortHash: shortNodeHash(typeof raw.shortHash === 'string' ? raw.shortHash : raw.hash),
    name: raw.name,
    type: typeof raw.type === 'string' ? raw.type : undefined,
    groups: Array.isArray(raw.groups) ? raw.groups.filter((group): group is string => typeof group === 'string') : []
  }
}
