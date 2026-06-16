import { createGunzip } from 'node:zlib'
import { createWriteStream, existsSync } from 'node:fs'
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { pipeline } from 'node:stream/promises'
import { coreDir, coreLogPath, logDir, managedCorePath, pidPath, socketPath, workDir } from '../lib/paths.js'
import { MihoroError } from '../lib/errors.js'
import { generateRuntimeConfig } from '../config/runtime.js'
import { waitForMihomoReady, useGroupNode } from './api.js'
import { readConfig } from '../config/state.js'
import { ensureGeodataResources } from './geodata.js'

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
  await mkdir(logDir(), { recursive: true })
  await rm(socketPath(), { force: true })
  const corePath = await resolveCorePath()
  const log = createWriteStream(coreLogPath(), { flags: 'a' })
  const child = spawn(corePath, ['-d', workDir(), '-ext-ctl-unix', socketPath()], {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout?.pipe(log)
  child.stderr?.pipe(log)
  if (!child.pid) throw new MihoroError('Failed to start mihomo process.')
  await writeFile(pidPath(), String(child.pid), 'utf8')
  child.unref()
  await waitForMihomoReady()
  await applyDefaultNodes()
  return child.pid
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
 * Applies saved default proxy group selections after startup.
 *
 * @returns Nothing after preferences are applied.
 */
async function applyDefaultNodes(): Promise<void> {
  const { defaultNodes } = await readConfig()
  for (const [group, node] of Object.entries(defaultNodes)) {
    await useGroupNode(group, node)
  }
}
