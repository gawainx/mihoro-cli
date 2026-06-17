import { createGunzip } from 'node:zlib'
import { createWriteStream, existsSync } from 'node:fs'
import { chmod, mkdir, readFile, readlink, readdir, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { Socket } from 'node:net'
import { pipeline } from 'node:stream/promises'
import { coreDir, managedCorePath, pidPath, socketPath, workDir } from '../lib/paths.js'
import { MihoroError } from '../lib/errors.js'
import { generateRuntimeConfig } from '../config/runtime.js'
import { listNodesWithGroups, waitForMihomoReady, useGroupNode } from './api.js'
import { readConfig, resolveDefaultNodeHashesForSubscription } from '../config/state.js'
import { ensureGeodataResources } from './geodata.js'
import { readControlledConfig } from '../config/controlled.js'
import { currentSubscription } from '../config/subscriptions.js'
import { refreshNodeIndexForSubscription, resolveNodeHash } from '../config/node-index.js'

const mihomoAssetMap: Record<string, string> = {
  'darwin-x64': 'mihomo-darwin-amd64-compatible',
  'darwin-arm64': 'mihomo-darwin-arm64',
  'linux-x64': 'mihomo-linux-amd64-compatible',
  'linux-arm64': 'mihomo-linux-arm64'
}

/**
 * Starts mihomo using the Clash Party runtime model.
 *
 * @returns Started process id.
 */
export async function startCore(): Promise<number> {
  await stopCoreIfPidFileExists(false)
  await mkdir(workDir(), { recursive: true })
  await ensureGeodataResources()
  await generateRuntimeConfig()
  await mkdir(coreDir(), { recursive: true })
  await rm(socketPath(), { force: true })
  const corePath = await resolveCorePath()
  const child = spawn(corePath, ['-d', workDir(), '-ext-ctl-unix', socketPath()], {
    detached: true,
    stdio: 'ignore'
  })
  if (!child.pid) throw new MihoroError('Failed to start mihomo process.')
  await writeFile(pidPath(), String(child.pid), 'utf8')
  child.unref()
  await waitForMihomoReady()
  await waitForProxyPortReady(child.pid)
  await applyDefaultNodes()
  return child.pid
}

/**
 * Waits for the configured mixed-port TCP listener.
 *
 * @param expectedPid Optional process id expected to own the listener.
 * @returns Human-readable ready result.
 */
export async function waitForProxyPortReady(expectedPid?: number): Promise<string> {
  const { host, port } = await proxyEndpoint()
  await waitForTcpPort(host, port, expectedPid)
  return `proxy port ready ${host}:${port}`
}

/**
 * Stops mihomo if it was started by mihoro-cli.
 *
 * @returns True when a process was signalled.
 */
export async function stopCore(): Promise<boolean> {
  return stopCoreIfPidFileExists(true)
}

/**
 * Reads the service process status.
 *
 * @returns Human-readable status string.
 */
export async function coreStatus(): Promise<string> {
  if (!existsSync(pidPath())) return 'stopped'
  const pid = Number(await readFile(pidPath(), 'utf8'))
  if (!Number.isInteger(pid)) return 'stopped'
  try {
    process.kill(pid, 0)
    return `running pid=${pid}`
  } catch {
    return `stale pid=${pid}`
  }
}

/**
 * Resolves the mihomo binary, preferring the system path before managed core.
 *
 * @returns Executable mihomo path.
 */
export async function resolveCorePath(): Promise<string> {
  const system = await findExecutable('mihomo')
  if (system) return system
  if (existsSync(managedCorePath())) return managedCorePath()
  return downloadManagedCore()
}

/**
 * Downloads the latest mihomo release using the same MetaCubeX asset route as Clash Party.
 *
 * @returns Managed executable path.
 */
async function downloadManagedCore(): Promise<string> {
  const asset = mihomoAssetMap[`${process.platform}-${process.arch}`]
  if (!asset) throw new MihoroError(`Unsupported platform for mihomo download: ${process.platform}-${process.arch}`)
  await mkdir(coreDir(), { recursive: true })
  const versionResponse = await fetch('https://github.com/MetaCubeX/mihomo/releases/latest/download/version.txt')
  if (!versionResponse.ok) throw new MihoroError(`Failed to resolve mihomo version: ${versionResponse.status}`)
  const version = (await versionResponse.text()).trim()
  const url = `https://github.com/MetaCubeX/mihomo/releases/download/${version}/${asset}-${version}.gz`
  const response = await fetch(url)
  if (!response.ok || !response.body) throw new MihoroError(`Failed to download mihomo core: ${response.status}`)
  await pipeline(response.body, createGunzip(), createWriteStream(managedCorePath()))
  await chmod(managedCorePath(), 0o755)
  return managedCorePath()
}

/**
 * Finds an executable in PATH using the host shell.
 *
 * @param name Executable name.
 * @returns Absolute path or undefined.
 */
async function findExecutable(name: string): Promise<string | undefined> {
  const paths = (process.env.PATH || '').split(':').filter(Boolean)
  for (const candidateDir of paths) {
    const candidate = `${candidateDir}/${name}`
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/**
 * Stops a pid-file process if present.
 *
 * @param removeSocket Whether to remove the socket file.
 * @returns True when a process was signalled.
 */
async function stopCoreIfPidFileExists(removeSocket: boolean): Promise<boolean> {
  if (!existsSync(pidPath())) return false
  const pid = Number(await readFile(pidPath(), 'utf8'))
  let stopped = false
  if (Number.isInteger(pid)) {
    try {
      process.kill(pid, 'SIGINT')
      stopped = true
    } catch {
      stopped = false
    }
  }
  await rm(pidPath(), { force: true })
  if (removeSocket) await rm(socketPath(), { force: true })
  return stopped
}

/**
 * Resolves the TCP endpoint expected for the mihomo mixed-port listener.
 *
 * @returns Host and port used by system proxy settings.
 */
async function proxyEndpoint(): Promise<{ host: string; port: number }> {
  const config = await readConfig()
  const controlled = await readControlledConfig()
  const port = Number(controlled['mixed-port'] || 7890)
  if (!Number.isInteger(port) || port <= 0) {
    throw new MihoroError(`Invalid mihomo mixed-port: ${String(controlled['mixed-port'])}`)
  }
  return { host: config.proxyHost, port }
}

/**
 * Waits for a TCP port to accept connections.
 *
 * @param host TCP host.
 * @param port TCP port.
 * @param expectedPid Optional process id expected to own the listener.
 * @param attempts Number of attempts.
 * @param delayMs Delay between attempts.
 * @returns Nothing after the port accepts a connection.
 */
async function waitForTcpPort(host: string, port: number, expectedPid?: number, attempts = 30, delayMs = 100): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await canConnect(host, port) && (await isPortOwnedByPid(host, port, expectedPid))) return
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  const ownerDetail = expectedPid ? ` owned by pid=${expectedPid}` : ''
  throw new MihoroError(`mihomo proxy port did not become ready${ownerDetail}: ${host}:${port}`)
}

/**
 * Checks one TCP connection attempt.
 *
 * @param host TCP host.
 * @param port TCP port.
 * @returns True when the connection succeeds.
 */
async function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket()
    socket.setTimeout(1000)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.connect(port, host)
  })
}

/**
 * Checks whether a TCP listener belongs to the expected process.
 *
 * @param host TCP host.
 * @param port TCP port.
 * @param expectedPid Optional process id expected to own the listener.
 * @returns True when ownership is valid or cannot be checked on this platform.
 */
async function isPortOwnedByPid(host: string, port: number, expectedPid?: number): Promise<boolean> {
  if (!expectedPid || process.platform !== 'linux') return true
  const inode = await findTcpListenInode(host, port)
  if (!inode) return false
  return pidOwnsSocketInode(expectedPid, inode)
}

/**
 * Finds the Linux socket inode for a listening TCP endpoint.
 *
 * @param host TCP host.
 * @param port TCP port.
 * @returns Socket inode or undefined when not found.
 */
async function findTcpListenInode(host: string, port: number): Promise<string | undefined> {
  const expectedPort = port.toString(16).toUpperCase().padStart(4, '0')
  const expectedAddresses = linuxAddressHexCandidates(host)
  for (const table of ['/proc/net/tcp', '/proc/net/tcp6']) {
    const text = await readFile(table, 'utf8').catch(() => '')
    for (const line of text.split('\n').slice(1)) {
      const columns = line.trim().split(/\s+/)
      if (columns.length < 10 || columns[3] !== '0A') continue
      const [address, localPort] = columns[1].split(':')
      if (localPort !== expectedPort || !expectedAddresses.has(address)) continue
      return columns[9]
    }
  }
  return undefined
}

/**
 * Returns Linux /proc/net address encodings for a host.
 *
 * @param host TCP host.
 * @returns Candidate hex address strings.
 */
function linuxAddressHexCandidates(host: string): Set<string> {
  if (host === '127.0.0.1' || host === 'localhost') return new Set(['0100007F'])
  if (host === '0.0.0.0') return new Set(['00000000'])
  if (host === '::1') return new Set(['00000000000000000000000001000000'])
  return new Set([host])
}

/**
 * Checks whether a process owns a socket inode.
 *
 * @param pid Process id.
 * @param inode Socket inode.
 * @returns True when a process fd points at the inode.
 */
async function pidOwnsSocketInode(pid: number, inode: string): Promise<boolean> {
  const fdDir = `/proc/${pid}/fd`
  const entries = await readdir(fdDir).catch(() => [])
  for (const entry of entries) {
    const target = await readlink(`${fdDir}/${entry}`).catch(() => '')
    if (target === `socket:[${inode}]`) return true
  }
  return false
}

/**
 * Applies saved default proxy group selections after startup.
 *
 * @returns Nothing after preferences are applied.
 */
async function applyDefaultNodes(): Promise<void> {
  const current = await currentSubscription()
  await refreshNodeIndexForSubscription(current.id, listNodesWithGroups)
  const defaultNodes = await resolveDefaultNodeHashesForSubscription(current.id)
  for (const [group, nodeHash] of Object.entries(defaultNodes)) {
    const node = await resolveNodeHash(current.id, nodeHash)
    await useGroupNode(group, node.name)
  }
}
