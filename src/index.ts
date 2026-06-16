#!/usr/bin/env node

import { Command } from 'commander'
import { addSubscription, readSubscriptions, removeSubscription, useSubscription } from './config/subscriptions.js'
import { generateRuntimeConfig } from './config/runtime.js'
import { parseProxyModeKind, readControlledConfig, setGeoAutoUpdate, setGeoUpdateInterval, setProxyMode, setTunEnabled } from './config/controlled.js'
import { assertGroupCanUseNode, listGroups, listNodesWithGroups, upgradeGeo, useGroupNode } from './mihomo/api.js'
import { updateConfig } from './config/state.js'
import { enableSystemProxy, disableSystemProxy } from './system/proxy.js'
import {
  formatRestartedService,
  formatStartedService,
  installService,
  restartServiceProcess,
  serviceProxyPortReady,
  serviceStatus,
  startService,
  startServiceProcess,
  stopService
} from './service/service.js'
import { importClashPartyConfig } from './import/clash-party.js'
import { showInfo } from './info.js'
import { errorMessage, MihoroError } from './lib/errors.js'
import { ensureGeodataResources } from './mihomo/geodata.js'
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
 * @returns Started or restarted process details.
 */
async function restartOrStartMihomo(): Promise<{ pid: number; restarted: boolean }> {
  const status = await serviceStatus()
  if (status.startsWith('running ')) {
    return { pid: await restartServiceProcess(), restarted: true }
  }
  return { pid: await startServiceProcess(), restarted: false }
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
      if (state.items.length === 0) {
        console.log('No subscriptions are configured.')
        return
      }
      console.log(`Configured subscriptions: ${state.items.length}`)
      for (const item of state.items) {
        const marker = state.current === item.id ? '*' : ' '
        console.log(`${marker} ${item.id}\tname=${item.name}\tupdated=${item.updatedAt}`)
      }
    })
  )
  sub.command('add').argument('<name>').argument('<url>').description('Add a subscription').action((name: string, url: string) =>
    run(async () => {
      const item = await addSubscription(name, url)
      const runtimePath = await generateRuntimeConfig()
      console.log(`Subscription saved: ${item.name} (${item.id})`)
      console.log(`Runtime config regenerated: ${runtimePath}`)
    })
  )
  sub.command('remove').argument('<name-or-id>').description('Remove a subscription').action((nameOrId: string) =>
    run(async () => {
      const item = await removeSubscription(nameOrId)
      console.log(`Subscription removed: ${item.name} (${item.id})`)
    })
  )
  sub.command('use').argument('<name-or-id>').description('Use a subscription').action((nameOrId: string) =>
    run(async () => {
      const item = await useSubscription(nameOrId)
      const runtimePath = await generateRuntimeConfig()
      console.log(`Active subscription set: ${item.name} (${item.id})`)
      console.log(`Runtime config regenerated: ${runtimePath}`)
    })
  )

  const service = program.command('service').description('Manage mihomo service')
  service.command('install').description('Install autostart service').action(() =>
    run(async () => {
      console.log(`Autostart service installed: ${await installService()}`)
    })
  )
  service.command('start').description('Start mihomo').action(() =>
    run(async () => {
      console.log(`Service start result: ${await startService()}`)
    })
  )
  service.command('stop').description('Stop mihomo').action(() =>
    run(async () => {
      console.log(`Service stop result: ${await stopService()}`)
    })
  )
  service.command('status').description('Show mihomo status').action(() =>
    run(async () => {
      console.log(`Service status: ${await serviceStatus()}`)
    })
  )

  program.command('info').description('Show current mihoro and mihomo info').action(() => run(async () => console.log(await showInfo())))

  const proxy = program.command('proxy').description('Manage system proxy')
  proxy
    .command('enable')
    .option('--kind <rules|global|direct>', 'proxy routing mode', 'rules')
    .description('Enable system proxy')
    .action((options: { kind: string }) =>
      run(async () => {
        const kind = parseProxyModeKind(options.kind)
        await setProxyMode(kind)
        console.log(`Proxy routing mode saved: ${kind}`)
        console.log(`Runtime config regenerated: ${await generateRuntimeConfig()}`)
        const { pid, restarted } = await restartOrStartMihomo()
        console.log(`Mihomo ${restarted ? 'restarted' : 'started'}: ${restarted ? formatRestartedService(pid) : formatStartedService(pid)}`)
        console.log(`Proxy listener verified: ${await serviceProxyPortReady(pid)}`)
        console.log(`System proxy updated: ${await enableSystemProxy()}`)
      })
    )
  proxy.command('disable').description('Disable system proxy').action(() =>
    run(async () => {
      console.log(`System proxy disabled: ${await disableSystemProxy()}`)
    })
  )

  const tun = program.command('tun').description('Manage TUN config')
  tun.command('enable').description('Enable TUN').action(() =>
    run(async () => {
      await setTunEnabled(true)
      console.log('TUN mode saved: enabled')
      console.log(`Runtime config regenerated: ${await generateRuntimeConfig()}`)
    })
  )
  tun.command('disable').description('Disable TUN').action(() =>
    run(async () => {
      await setTunEnabled(false)
      console.log('TUN mode saved: disabled')
      console.log(`Runtime config regenerated: ${await generateRuntimeConfig()}`)
    })
  )

  const geo = program.command('geo').description('Manage db-mode GeoData resources')
  geo.command('prepare').description('Download missing GeoData database files').action(() =>
    run(async () => {
      const resources = await ensureGeodataResources()
      const downloaded = resources.filter((item) => item.downloaded).length
      console.log(`GeoData resources ready: ${resources.length} files (${downloaded} downloaded)`)
      for (const item of resources) console.log(`${item.fileName}\t${item.downloaded ? 'downloaded' : 'already-present'}\t${item.path}`)
    })
  )
  geo.command('update').description('Ask running mihomo to update GeoData databases').action(() =>
    run(async () => {
      await upgradeGeo()
      console.log('GeoData update requested from running mihomo API.')
    })
  )
  geo.command('auto').argument('<on|off>').description('Enable or disable mihomo GeoData auto update').action((value: string) =>
    run(async () => {
      const enabled = parseOnOff(value)
      await setGeoAutoUpdate(enabled)
      console.log(`GeoData auto update saved: ${enabled ? 'enabled' : 'disabled'}`)
      console.log(`Runtime config regenerated: ${await generateRuntimeConfig()}`)
    })
  )
  geo.command('interval').argument('<hours>').description('Set mihomo GeoData update interval in hours').action((hours: string) =>
    run(async () => {
      const parsed = Number(hours)
      await setGeoUpdateInterval(parsed)
      console.log(`GeoData update interval saved: ${parsed}h`)
      console.log(`Runtime config regenerated: ${await generateRuntimeConfig()}`)
    })
  )
  geo.command('urls').description('Show configured GeoData update URLs').action(() =>
    run(async () => {
      const config = await readControlledConfig()
      const geoxUrl = config['geox-url']
      if (!geoxUrl || typeof geoxUrl !== 'object' || Array.isArray(geoxUrl)) {
        throw new MihoroError('GeoData URLs are not configured.')
      }
      console.log('Configured GeoData update URLs:')
      for (const [key, value] of Object.entries(geoxUrl)) console.log(`${key}\t${String(value)}`)
    })
  )

  const node = program.command('node').description('Manage nodes')
  node.command('list').description('List available nodes').action(() =>
    run(async () => {
      const nodes = await listNodesWithGroups()
      if (nodes.length === 0) {
        console.log('No selectable nodes are available from the running mihomo API.')
        return
      }
      console.log(`Selectable nodes: ${nodes.length}`)
      for (const item of nodes) console.log(`${item.name}\ttype=${item.type || 'unknown'}\tgroups=${item.groups.join(',') || 'none'}`)
    })
  )
  node
    .command('use')
    .argument('<node>')
    .requiredOption('--group <group>', 'proxy group to switch')
    .description('Switch a proxy group to a node')
    .action((nodeName: string, options: { group: string }) =>
      run(async () => {
        await assertGroupCanUseNode(options.group, nodeName)
        await useGroupNode(options.group, nodeName)
        await updateConfig((config) => ({ ...config, defaultNodes: { ...config.defaultNodes, [options.group]: nodeName } }))
        console.log(`Proxy group switched: ${options.group} -> ${nodeName}`)
        console.log(`Default node saved for future starts: ${options.group} -> ${nodeName}`)
      })
    )

  const group = program.command('group').description('Manage proxy groups')
  group.command('list').description('List proxy groups').action(() =>
    run(async () => {
      const groups = await listGroups()
      if (groups.length === 0) {
        console.log('No visible proxy groups are available from the running mihomo API.')
        return
      }
      console.log(`Visible proxy groups: ${groups.length}`)
      for (const item of groups) console.log(`${item.name}\tselected=${item.now || 'unknown'}\toptions=${item.all?.join(',') || 'none'}`)
    })
  )
  group.command('use').argument('<group>').argument('<node>').description('Switch proxy group node').action((groupName: string, nodeName: string) =>
    run(async () => {
      await useGroupNode(groupName, nodeName)
      await updateConfig((config) => ({ ...config, defaultNodes: { ...config.defaultNodes, [groupName]: nodeName } }))
      console.log(`Proxy group switched: ${groupName} -> ${nodeName}`)
      console.log(`Default node saved for future starts: ${groupName} -> ${nodeName}`)
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
        console.log(`Clash Party profiles imported: ${result.importedProfiles}`)
        console.log(`Active imported profile: ${result.current}`)
        if (result.controlledConfigPath) console.log(`Controlled mihomo config imported: ${result.controlledConfigPath}`)
        console.log(`Runtime config regenerated: ${result.runtimePath}`)
        if (result.backupDir) console.log(`Existing mihoro files backed up: ${result.backupDir}`)
        if (result.skippedProfiles.length > 0) console.log(`Skipped missing Clash Party profiles: ${result.skippedProfiles.join(',')}`)
      })
    )

  return program
}

createProgram().parse()
