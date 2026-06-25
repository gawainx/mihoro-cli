export type JsonMap = Record<string, unknown>

export interface SubscriptionItem {
  /** Stable subscription id used as the profile file name. */
  id: string
  /** Human-readable subscription name shown in CLI output. */
  name: string
  /** Remote subscription URL used to refresh the profile. */
  url?: string
  /** ISO timestamp for the last successful profile download. */
  updatedAt: string
  /** Profile type, imported from Clash Party or created by mihoro-cli. */
  type?: 'remote' | 'local'
  /** Source system for imported profile metadata. */
  source?: 'mihoro-cli' | 'clash-party'
}

export interface SubscriptionState {
  /** Current active subscription id. */
  current?: string
  /** Saved subscriptions managed by mihoro-cli. */
  items: SubscriptionItem[]
}

export interface MihoroConfig {
  /** Host used when writing system proxy settings. */
  proxyHost: string
  /** Bypass list used for manual system proxy settings. */
  proxyBypass: string[]
  /** Legacy preferred node by proxy group, used as fallback for older config files. */
  defaultNodes: Record<string, string>
  /** Legacy preferred node name by proxy group scoped by subscription id. */
  subscriptionDefaultNodes: Record<string, Record<string, string>>
  /** Preferred full node hash by proxy group scoped by subscription id. */
  subscriptionDefaultNodeHashes: Record<string, Record<string, string>>
}

export interface MihomoProxy {
  /** Proxy or proxy group name returned by mihomo. */
  name: string
  /** Mihomo proxy type, for example Selector, URLTest, Shadowsocks, or Direct. */
  type?: string
  /** Current selected proxy for a proxy group. */
  now?: string
  /** Available child proxy names for a proxy group. */
  all?: string[]
  /** Hidden groups should not be shown in normal group output. */
  hidden?: boolean
}

export interface MihomoProxiesResponse {
  /** Proxy map returned by GET /proxies. */
  proxies: Record<string, MihomoProxy>
}

export interface NodeIndexEntry {
  /** Full SHA-256 hash used as mihoro-cli node id. */
  hash: string
  /** Default 8-character display hash prefix. */
  shortHash: string
  /** Original mihomo node name. */
  name: string
  /** Mihomo proxy type when available. */
  type?: string
  /** Visible proxy groups that can select this node. */
  groups: string[]
}

export interface SubscriptionNodeIndex {
  /** ISO timestamp for the last index refresh. */
  updatedAt: string
  /** Node index entries keyed by full hash. */
  nodes: Record<string, NodeIndexEntry>
}

export interface NodeIndexFile {
  /** Node indexes scoped by subscription id. */
  subscriptions: Record<string, SubscriptionNodeIndex>
}
