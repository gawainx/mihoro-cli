import axios, { type AxiosInstance } from 'axios'
import { socketPath } from '../lib/paths.js'
import type { MihomoProxiesResponse, MihomoProxy } from '../lib/types.js'
import { MihoroError } from '../lib/errors.js'

let axiosInstance: AxiosInstance | undefined

/**
 * Returns an axios client bound to the mihomo Unix socket.
 *
 * @returns Axios instance configured for mihomo API calls.
 */
export function getMihomoAxios(): AxiosInstance {
  if (axiosInstance) return axiosInstance
  axiosInstance = axios.create({
    baseURL: 'http://localhost',
    socketPath: socketPath(),
    timeout: 15000
  })
  axiosInstance.interceptors.response.use(
    (response) => response.data,
    (error: unknown) => {
      if (axios.isAxiosError(error) && error.response?.data) return Promise.reject(error.response.data)
      if (axios.isAxiosError(error)) {
        return Promise.reject(new MihoroError(`mihomo API is not reachable at ${socketPath()}: ${error.message}`))
      }
      return Promise.reject(error)
    }
  )
  return axiosInstance
}

/**
 * Returns mihomo proxies and proxy groups.
 *
 * @returns Proxies response from mihomo.
 */
export async function listProxies(): Promise<MihomoProxiesResponse> {
  return getMihomoAxios().get('/proxies')
}

/**
 * Returns visible proxy groups.
 *
 * @returns Array of group proxies.
 */
export async function listGroups(): Promise<MihomoProxy[]> {
  const { proxies } = await listProxies()
  return Object.values(proxies).filter((proxy) => Array.isArray(proxy.all) && !proxy.hidden)
}

/**
 * Returns leaf proxies that are not proxy groups.
 *
 * @returns Array of node proxies.
 */
export async function listNodes(): Promise<MihomoProxy[]> {
  const { proxies } = await listProxies()
  return Object.values(proxies).filter((proxy) => !Array.isArray(proxy.all) && proxy.name !== 'DIRECT' && proxy.name !== 'REJECT')
}

/**
 * Returns node proxies with visible group membership.
 *
 * @returns Array of node proxies and the groups that can select each node.
 */
export async function listNodesWithGroups(): Promise<Array<MihomoProxy & { groups: string[] }>> {
  const groups = await listGroups()
  const nodes = await listNodes()
  return nodes.map((node) => ({
    ...node,
    groups: groups.filter((group) => group.all?.includes(node.name)).map((group) => group.name)
  }))
}

/**
 * Validates that a visible proxy group can select a node.
 *
 * @param groupName Proxy group name.
 * @param nodeName Node name.
 * @returns Nothing after validation succeeds.
 */
export async function assertGroupCanUseNode(groupName: string, nodeName: string): Promise<void> {
  const [groups, nodes] = await Promise.all([listGroups(), listNodes()])
  const node = nodes.find((item) => item.name === nodeName)
  if (!node) {
    throw new MihoroError(`Node not found: ${nodeName}. Run "mihoro-cli node list" to see available nodes.`)
  }
  const group = groups.find((item) => item.name === groupName)
  if (!group) {
    throw new MihoroError(`Proxy group not found: ${groupName}. Run "mihoro-cli group list" to see available groups.`)
  }
  if (!group.all?.includes(nodeName)) {
    throw new MihoroError(
      `Node "${nodeName}" is not available in group "${groupName}". Run "mihoro-cli node list" to see node groups.`
    )
  }
}

/**
 * Changes a proxy group's selected node.
 *
 * @param group Proxy group name.
 * @param node Node name to select.
 * @returns Nothing after mihomo accepts the change.
 */
export async function useGroupNode(group: string, node: string): Promise<void> {
  await getMihomoAxios().put(`/proxies/${encodeURIComponent(group)}`, { name: node })
}

/**
 * Triggers mihomo to update configured GeoData database files.
 *
 * @returns Nothing after mihomo accepts the update request.
 */
export async function upgradeGeo(): Promise<void> {
  await getMihomoAxios().post('/configs/geo')
}

/**
 * Waits for mihomo REST API readiness.
 *
 * @param attempts Number of attempts.
 * @param delayMs Delay between attempts.
 * @returns Nothing after the API responds.
 */
export async function waitForMihomoReady(attempts = 30, delayMs = 100): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await getMihomoAxios().get('/')
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw new MihoroError('mihomo API did not become ready.')
}
