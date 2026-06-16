import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { readControlledConfig } from '../config/controlled.js'
import { readConfig } from '../config/state.js'
import { MihoroError } from '../lib/errors.js'

const execFileAsync = promisify(execFile)

/**
 * Enables manual system proxy for Linux or macOS.
 *
 * @returns Summary of the applied proxy settings.
 */
export async function enableSystemProxy(): Promise<string> {
  const config = await readConfig()
  const controlled = await readControlledConfig()
  const port = Number(controlled['mixed-port'] || 7890)
  if (process.platform === 'linux') {
    await execFileAsync('gsettings', ['set', 'org.gnome.system.proxy', 'mode', 'manual'])
    await execFileAsync('gsettings', ['set', 'org.gnome.system.proxy.http', 'host', config.proxyHost])
    await execFileAsync('gsettings', ['set', 'org.gnome.system.proxy.http', 'port', String(port)])
    await execFileAsync('gsettings', ['set', 'org.gnome.system.proxy.https', 'host', config.proxyHost])
    await execFileAsync('gsettings', ['set', 'org.gnome.system.proxy.https', 'port', String(port)])
    await execFileAsync('gsettings', ['set', 'org.gnome.system.proxy.socks', 'host', config.proxyHost])
    await execFileAsync('gsettings', ['set', 'org.gnome.system.proxy.socks', 'port', String(port)])
    await execFileAsync('gsettings', ['set', 'org.gnome.system.proxy', 'ignore-hosts', `[${config.proxyBypass.map((item) => `'${item}'`).join(', ')}]`])
    return `enabled linux manual proxy ${config.proxyHost}:${port}`
  }
  if (process.platform === 'darwin') {
    const services = await macosNetworkServices()
    for (const service of services) {
      await execFileAsync('networksetup', ['-setwebproxy', service, config.proxyHost, String(port)])
      await execFileAsync('networksetup', ['-setsecurewebproxy', service, config.proxyHost, String(port)])
      await execFileAsync('networksetup', ['-setsocksfirewallproxy', service, config.proxyHost, String(port)])
      await execFileAsync('networksetup', ['-setproxybypassdomains', service, ...config.proxyBypass])
    }
    return `enabled macOS manual proxy ${config.proxyHost}:${port}`
  }
  throw new MihoroError(`Unsupported platform for proxy enable: ${process.platform}`)
}

/**
 * Disables manual system proxy for Linux or macOS.
 *
 * @returns Summary of the disabled proxy settings.
 */
export async function disableSystemProxy(): Promise<string> {
  if (process.platform === 'linux') {
    await execFileAsync('gsettings', ['set', 'org.gnome.system.proxy', 'mode', 'none'])
    return 'disabled linux system proxy'
  }
  if (process.platform === 'darwin') {
    const services = await macosNetworkServices()
    for (const service of services) {
      await execFileAsync('networksetup', ['-setwebproxystate', service, 'off'])
      await execFileAsync('networksetup', ['-setsecurewebproxystate', service, 'off'])
      await execFileAsync('networksetup', ['-setsocksfirewallproxystate', service, 'off'])
    }
    return 'disabled macOS system proxy'
  }
  throw new MihoroError(`Unsupported platform for proxy disable: ${process.platform}`)
}

/**
 * Lists macOS network services that can receive proxy settings.
 *
 * @returns Network service names.
 */
async function macosNetworkServices(): Promise<string[]> {
  const { stdout } = await execFileAsync('networksetup', ['-listallnetworkservices'])
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('An asterisk'))
}
