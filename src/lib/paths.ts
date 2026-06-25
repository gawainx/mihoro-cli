import os from 'node:os'
import path from 'node:path'

/**
 * Returns the base data directory for mihoro-cli.
 *
 * @returns Absolute path to the data directory.
 */
export function dataDir(): string {
  return process.env.MIHORO_HOME || path.join(os.homedir(), '.config', 'mihoro')
}

/**
 * Returns the profile directory.
 *
 * @returns Absolute path to saved subscription profiles.
 */
export function profilesDir(): string {
  return path.join(dataDir(), 'profiles')
}

/**
 * Returns the path for a saved profile id.
 *
 * @param id Subscription/profile id.
 * @returns Absolute YAML profile path.
 */
export function profilePath(id: string): string {
  return path.join(profilesDir(), `${id}.yaml`)
}

/**
 * Returns the runtime work directory used as mihomo -d.
 *
 * @returns Absolute path to the mihomo work directory.
 */
export function workDir(): string {
  return path.join(dataDir(), 'runtime')
}

/**
 * Returns the directory where mihomo reads GeoData database files.
 *
 * @returns Absolute path to the GeoData resource directory.
 */
export function geodataDir(): string {
  return workDir()
}

/**
 * Returns the runtime config path used by mihomo.
 *
 * @returns Absolute path to generated mihomo config.yaml.
 */
export function runtimeConfigPath(): string {
  return path.join(workDir(), 'config.yaml')
}

/**
 * Returns the mihomo Unix socket path.
 *
 * @returns Absolute path to the mihomo external controller socket.
 */
export function socketPath(): string {
  return path.join(workDir(), 'mihomo.sock')
}

/**
 * Returns the pid file path for a mihomo process started by mihoro-cli.
 *
 * @returns Absolute path to the pid file.
 */
export function pidPath(): string {
  return path.join(workDir(), 'mihomo.pid')
}

/**
 * Returns the directory for downloaded mihomo binaries.
 *
 * @returns Absolute path to the core directory.
 */
export function coreDir(): string {
  return path.join(dataDir(), 'core')
}

/**
 * Returns the managed mihomo binary path.
 *
 * @returns Absolute path to mihoro-managed mihomo.
 */
export function managedCorePath(): string {
  return path.join(coreDir(), 'mihomo')
}

/**
 * Returns the CLI config path.
 *
 * @returns Absolute YAML config path.
 */
export function configPath(): string {
  return path.join(dataDir(), 'config.yaml')
}

/**
 * Returns the subscription state path.
 *
 * @returns Absolute YAML subscription state path.
 */
export function subscriptionsPath(): string {
  return path.join(dataDir(), 'subscriptions.yaml')
}

/**
 * Returns the controlled mihomo config path.
 *
 * @returns Absolute YAML controlled config path.
 */
export function controlledConfigPath(): string {
  return path.join(dataDir(), 'mihomo.yaml')
}

/**
 * Returns the CLI node index JSON path.
 *
 * @returns Absolute JSON node index path.
 */
export function nodeIndexesPath(): string {
  return path.join(dataDir(), 'node-indexes.json')
}

/**
 * Returns the log directory.
 *
 * @returns Absolute path to the log directory.
 */
export function logDir(): string {
  return path.join(dataDir(), 'logs')
}

/**
 * Returns the systemd unit directory.
 *
 * @returns Absolute path to user systemd units.
 */
export function systemdUserDir(): string {
  return path.join(os.homedir(), '.config', 'systemd', 'user')
}
