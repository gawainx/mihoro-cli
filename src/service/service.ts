import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import { coreLogPath, systemdUserDir } from '../lib/paths.js'
import { coreStatus, startCore, stopCore } from '../mihomo/core.js'
import { MihoroError } from '../lib/errors.js'

const execFileAsync = promisify(execFile)

/**
 * Installs an autostart service for the current platform.
 *
 * @returns Human-readable install result.
 */
export async function installService(): Promise<string> {
  if (process.platform === 'linux') {
    await mkdir(systemdUserDir(), { recursive: true })
    const [command, ...args] = serviceCommand()
    const unit = `[Unit]
Description=mihoro-cli mihomo service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=${systemdEscape(command)} ${args.map(systemdEscape).join(' ')} service start
ExecStop=${systemdEscape(command)} ${args.map(systemdEscape).join(' ')} service stop

[Install]
WantedBy=default.target
`
    await writeFile(`${systemdUserDir()}/mihoro.service`, unit, 'utf8')
    await execFileAsync('systemctl', ['--user', 'daemon-reload'])
    await execFileAsync('systemctl', ['--user', 'enable', 'mihoro.service'])
    return 'installed systemd user service mihoro.service'
  }
  if (process.platform === 'darwin') {
    const launchAgentsDir = `${os.homedir()}/Library/LaunchAgents`
    await mkdir(launchAgentsDir, { recursive: true })
    const [command, ...args] = serviceCommand()
    const plistPath = `${launchAgentsDir}/dev.mihoro.cli.plist`
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>dev.mihoro.cli</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(command)}</string>
${args.map((arg) => `    <string>${xmlEscape(arg)}</string>`).join('\n')}
    <string>service</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`
    await writeFile(plistPath, plist, 'utf8')
    await execFileAsync('launchctl', ['bootstrap', `gui/${process.getuid?.()}`, plistPath]).catch(() => undefined)
    await execFileAsync('launchctl', ['enable', `gui/${process.getuid?.()}/dev.mihoro.cli`]).catch(() => undefined)
    return `installed macOS LaunchAgent ${plistPath}`
  }
  throw new MihoroError(`Unsupported platform for service install: ${process.platform}`)
}

/**
 * Starts mihomo service process.
 *
 * @returns Human-readable start result.
 */
export async function startService(): Promise<string> {
  const pid = await startCore()
  return `started mihomo pid=${pid}`
}

/**
 * Stops mihomo service process.
 *
 * @returns Human-readable stop result.
 */
export async function stopService(): Promise<string> {
  const stopped = await stopCore()
  return stopped ? 'stopped mihomo' : 'mihomo was not running'
}

/**
 * Returns mihomo service status.
 *
 * @returns Human-readable status.
 */
export async function serviceStatus(): Promise<string> {
  return coreStatus()
}

/**
 * Reads mihomo core logs.
 *
 * @param lines Number of trailing lines.
 * @returns Log text.
 */
export async function serviceLogs(lines = 80): Promise<string> {
  const text = await readFile(coreLogPath(), 'utf8').catch(() => '')
  return text.split('\n').slice(-lines).join('\n')
}

/**
 * Returns the executable command used to reinvoke the installed CLI from a service manager.
 *
 * @returns Command and base arguments for running mihoro-cli.
 */
function serviceCommand(): string[] {
  const entry = process.argv[1]
  if (!entry) return [process.execPath]
  if (entry.endsWith('.ts')) return [process.execPath, new URL('../index.js', import.meta.url).pathname]
  return [entry]
}

/**
 * Escapes a systemd command argument with double quotes.
 *
 * @param value Argument value.
 * @returns Escaped systemd argument.
 */
function systemdEscape(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

/**
 * Escapes text for a LaunchAgent plist XML string.
 *
 * @param value Text value.
 * @returns XML-safe text.
 */
function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
