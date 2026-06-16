#!/usr/bin/env node

import { Command } from 'commander'
import { addSubscription, readSubscriptions, removeSubscription, useSubscription } from './config/subscriptions.js'
import { generateRuntimeConfig } from './config/runtime.js'
import { parseProxyModeKind, readControlledConfig, setGeoAutoUpdate, setGeoUpdateInterval, setProxyMode, setTunEnabled } from './config/controlled.js'
import { listGroups, listNodes, upgradeGeo, useGroupNode } from './mihomo/api.js'
import { updateConfig } from './config/state.js'
import { enableSystemProxy, disableSystemProxy } from './system/proxy.js'
import { installService, restartService, serviceProxyPortReady, serviceStatus, startService, stopService } from './service/service.js'
import { importClashPartyConfig } from './import/clash-party.js'
import { errorMessage, MihoroError } from './lib/errors.js'
import { ensureGeodataResources, listGeodataResources } from './mihomo/geodata.js'
import { packageInfo } from './lib/package-info.js'

/**
 * Runs an async command handler with consistent CLI error handling.
 *
 * @param handler Async command body.
 * @returns Nothing after the handler completes.
 */
function run(handler: () => Promise<void>): void {
  handler().catch((error: unknown) => {
    console.error(errorMessage(error))
    process.exit(error instanceof MihoroError ? error.exitCode : 1)
  })
}

/**
 * Parses an on/off command argument into a boolean.
 *
 * @param value User-provided on/off value.
 * @returns True for on and false for off.
 */
function parseOnOff(value: string): boolean {
  if (value === 'on') return true
  if (value === 'off') return false
  throw new MihoroError('Expected "on" or "off".')
}

/**
 * Starts or restarts mihomo so it uses the current runtime config.
 *
 * @returns Human-readable service state after the check.
 */
async function restartOrStartMihomo(): Promise<string> {
  const status = await serviceStatus()
  if (status.startsWith('running ')) {
    console.log('restarting mihomo to apply runtime config')
    return restartService()
  }
  console.log('starting mihomo')
  return startService()
}

/**
 * Creates the mihoro-cli command tree.
 *
 * @returns Configured commander program.
 */
function createProgram(): Command {
  const program = new Command()
  program.name('mihoro-cli').description('Standalone mihomo CLI based on the Clash Party runtime model').version(packageInfo.version)

  const sub = program.command('sub').description('Manage subscriptions')
  sub.command('list').description('List subscriptions').action(() =>
    run(async () => {
      const state = await readSubscriptions()
      for (const item of state.items) {
        const marker = state.current === item.id ? '*' : ' '
        console.log(`${marker} ${item.id}\t${item.name}\t${item.updatedAt}`)
      }
    })
  )
  sub.command('add').argument('<name>').argument('<url>').description('Add a subscription').action((name: string, url: string) =>
    run(async () => {
      const item = await addSubscription(name, url)
      const runtimePath = await generateRuntimeConfig()
      console.log(`added ${item.id}`)
      console.log(`runtime ${runtimePath}`)
    })
  )
  sub.command('remove').argument('<name-or-id>').description('Remove a subscription').action((nameOrId: string) =>
    run(async () => {
      const item = await removeSubscription(nameOrId)
      console.log(`removed ${item.id}`)
    })
  )
  sub.command('use').argument('<name-or-id>').description('Use a subscription').action((nameOrId: string) =>
    run(async () => {
      const item = await useSubscription(nameOrId)
      const runtimePath = await generateRuntimeConfig()
      console.log(`current ${item.id}`)
      console.log(`runtime ${runtimePath}`)
    })
  )

  const service = program.command('service').description('Manage mihomo service')
  service.command('install').description('Install autostart service').action(() => run(async () => console.log(await installService())))
  service.command('start').description('Start mihomo').action(() => run(async () => console.log(await startService())))
  service.command('stop').description('Stop mihomo').action(() => run(async () => console.log(await stopService())))
  service.command('status').description('Show mihomo status').action(() => run(async () => console.log(await serviceStatus())))

  const proxy = program.command('proxy').description('Manage system proxy')
  proxy
    .command('enable')
    .option('--kind <rules|global|direct>', 'proxy routing mode', 'rules')
    .description('Enable system proxy')
    .action((options: { kind: string }) =>
      run(async () => {
        const kind = parseProxyModeKind(options.kind)
        console.log(`proxy mode ${kind}`)
        await setProxyMode(kind)
        console.log(`runtime ${await generateRuntimeConfig()}`)
        console.log(await restartOrStartMihomo())
        console.log(await serviceProxyPortReady())
        console.log(await enableSystemProxy())
      })
    )
  proxy.command('disable').description('Disable system proxy').action(() => run(async () => console.log(await disableSystemProxy())))

  const tun = program.command('tun').description('Manage TUN config')
  tun.command('enable').description('Enable TUN').action(() =>
    run(async () => {
      await setTunEnabled(true)
      console.log(`runtime ${await generateRuntimeConfig()}`)
    })
  )
  tun.command('disable').description('Disable TUN').action(() =>
    run(async () => {
      await setTunEnabled(false)
      console.log(`runtime ${await generateRuntimeConfig()}`)
    })
  )

  const geo = program.command('geo').description('Manage db-mode GeoData resources')
  geo.command('prepare').description('Download missing GeoData database files').action(() =>
    run(async () => {
      await ensureGeodataResources()
      for (const item of listGeodataResources()) console.log(`${item.fileName}\tready`)
    })
  )
  geo.command('update').description('Ask running mihomo to update GeoData databases').action(() =>
    run(async () => {
      await upgradeGeo()
      console.log('geodata update requested')
    })
  )
  geo.command('auto').argument('<on|off>').description('Enable or disable mihomo GeoData auto update').action((value: string) =>
    run(async () => {
      const enabled = parseOnOff(value)
      await setGeoAutoUpdate(enabled)
      console.log(`geo auto ${enabled ? 'on' : 'off'}`)
      console.log(`runtime ${await generateRuntimeConfig()}`)
    })
  )
  geo.command('interval').argument('<hours>').description('Set mihomo GeoData update interval in hours').action((hours: string) =>
    run(async () => {
      const parsed = Number(hours)
      await setGeoUpdateInterval(parsed)
      console.log(`geo interval ${parsed}h`)
      console.log(`runtime ${await generateRuntimeConfig()}`)
    })
  )
  geo.command('urls').description('Show configured GeoData update URLs').action(() =>
    run(async () => {
      const config = await readControlledConfig()
      const geoxUrl = config['geox-url']
      if (!geoxUrl || typeof geoxUrl !== 'object' || Array.isArray(geoxUrl)) {
        throw new MihoroError('GeoData URLs are not configured.')
      }
      for (const [key, value] of Object.entries(geoxUrl)) console.log(`${key}\t${String(value)}`)
    })
  )

  const node = program.command('node').description('Manage nodes')
  node.command('list').description('List available nodes').action(() =>
    run(async () => {
      for (const item of await listNodes()) console.log(`${item.name}\t${item.type || ''}`)
    })
  )

  const group = program.command('group').description('Manage proxy groups')
  group.command('list').description('List proxy groups').action(() =>
    run(async () => {
      for (const item of await listGroups()) console.log(`${item.name}\t${item.now || ''}\t${item.all?.join(',') || ''}`)
    })
  )
  group.command('use').argument('<group>').argument('<node>').description('Switch proxy group node').action((groupName: string, nodeName: string) =>
    run(async () => {
      await useGroupNode(groupName, nodeName)
      await updateConfig((config) => ({ ...config, defaultNodes: { ...config.defaultNodes, [groupName]: nodeName } }))
      console.log(`selected ${groupName} -> ${nodeName}`)
    })
  )

  const importCommand = program.command('import').description('Import configuration from other clients')
  importCommand
    .command('clash-party')
    .argument('<data-dir>')
    .option('--overwrite', 'overwrite existing mihoro files after backup')
    .description('Import Clash Party profiles and controlled mihomo config')
    .action((dataDir: string, options: { overwrite?: boolean }) =>
      run(async () => {
        const result = await importClashPartyConfig(dataDir, { overwrite: Boolean(options.overwrite) })
        console.log(`imported profiles: ${result.importedProfiles}`)
        console.log(`current profile: ${result.current}`)
        if (result.controlledConfigPath) console.log(`controlled config: ${result.controlledConfigPath}`)
        console.log(`runtime ${result.runtimePath}`)
        if (result.backupDir) console.log(`backup ${result.backupDir}`)
        if (result.skippedProfiles.length > 0) console.log(`skipped profiles: ${result.skippedProfiles.join(',')}`)
      })
    )

  return program
}

createProgram().parse()
