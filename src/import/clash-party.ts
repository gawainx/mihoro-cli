import { cp, mkdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { parse } from 'yaml'
import {
  controlledConfigPath,
  dataDir,
  profilePath,
  profilesDir,
  subscriptionsPath
} from '../lib/paths.js'
import type { SubscriptionItem, SubscriptionState } from '../lib/types.js'
import { MihoroError } from '../lib/errors.js'
import { writeYaml } from '../lib/yaml.js'
import { generateRuntimeConfig } from '../config/runtime.js'

interface ClashPartyProfileItem {
  /** Clash Party profile id. */
  id?: string
  /** Clash Party display name. */
  name?: string
  /** Remote subscription URL when the profile is remote. */
  url?: string
  /** Clash Party profile type. */
  type?: string
}

interface ClashPartyProfileConfig {
  /** Current Clash Party profile id. */
  current?: string
  /** Clash Party profile items. */
  items?: ClashPartyProfileItem[]
}

export interface ImportClashPartyOptions {
  /** Allow existing mihoro files to be overwritten after backup. */
  overwrite: boolean
}

export interface ImportClashPartyResult {
  /** Number of imported profile entries. */
  importedProfiles: number
  /** Current imported profile id. */
  current: string
  /** Runtime config path generated after import. */
  runtimePath: string
  /** Controlled mihomo config path when imported. */
  controlledConfigPath?: string
  /** Backup directory path when overwrite mode created a backup. */
  backupDir?: string
  /** Profile ids skipped because their YAML file was missing. */
  skippedProfiles: string[]
}

interface PlannedImport {
  /** Subscription state to write into mihoro. */
  state: SubscriptionState
  /** Source to target profile file copies. */
  profileCopies: Array<{ source: string; target: string }>
  /** Source Clash Party mihomo.yaml, if present. */
  controlledSource?: string
  /** Target files that already exist and would be overwritten. */
  conflicts: string[]
  /** Profile ids skipped because the source file was missing. */
  skippedProfiles: string[]
}

/**
 * Imports Clash Party profiles and controlled mihomo config into mihoro-cli.
 *
 * @param sourceDir Clash Party data directory.
 * @param options Import behavior options.
 * @returns Import summary.
 */
export async function importClashPartyConfig(
  sourceDir: string,
  options: ImportClashPartyOptions
): Promise<ImportClashPartyResult> {
  const absoluteSourceDir = path.resolve(sourceDir)
  await assertDirectory(absoluteSourceDir)
  const planned = await planImport(absoluteSourceDir)
  if (planned.conflicts.length > 0 && !options.overwrite) {
    throw new MihoroError(
      `Import would overwrite existing mihoro files. Re-run with --overwrite.\n${planned.conflicts.join('\n')}`
    )
  }

  const backupDir =
    options.overwrite && planned.conflicts.length > 0 ? await backupConflicts(planned.conflicts) : undefined

  await mkdir(profilesDir(), { recursive: true })
  for (const copy of planned.profileCopies) {
    await cp(copy.source, copy.target)
  }
  await writeYaml(subscriptionsPath(), planned.state)
  if (planned.controlledSource) {
    await cp(planned.controlledSource, controlledConfigPath())
  }
  const runtimePath = await generateRuntimeConfig()

  return {
    importedProfiles: planned.state.items.length,
    current: planned.state.current || planned.state.items[0]?.id || '',
    runtimePath,
    controlledConfigPath: planned.controlledSource ? controlledConfigPath() : undefined,
    backupDir,
    skippedProfiles: planned.skippedProfiles
  }
}

/**
 * Builds an import plan without mutating mihoro files.
 *
 * @param sourceDir Clash Party data directory.
 * @returns Planned import data and conflicts.
 */
async function planImport(sourceDir: string): Promise<PlannedImport> {
  const profileConfigPath = path.join(sourceDir, 'profile.yaml')
  const clashProfilesDir = path.join(sourceDir, 'profiles')
  const clashControlledPath = path.join(sourceDir, 'mihomo.yaml')

  if (!existsSync(profileConfigPath)) throw new MihoroError(`Clash Party profile.yaml not found: ${profileConfigPath}`)
  await assertDirectory(clashProfilesDir)

  const profileConfig = parse(await readFile(profileConfigPath, 'utf8')) as ClashPartyProfileConfig
  if (!profileConfig || typeof profileConfig !== 'object') {
    throw new MihoroError('Clash Party profile.yaml must be a YAML object.')
  }
  if (!Array.isArray(profileConfig.items)) {
    throw new MihoroError('Clash Party profile.yaml items must be an array.')
  }

  const now = new Date().toISOString()
  const items: SubscriptionItem[] = []
  const profileCopies: PlannedImport['profileCopies'] = []
  const skippedProfiles: string[] = []

  for (const item of profileConfig.items) {
    if (!item.id) continue
    const sourceProfile = path.join(clashProfilesDir, `${item.id}.yaml`)
    if (!existsSync(sourceProfile)) {
      skippedProfiles.push(item.id)
      continue
    }
    items.push({
      id: item.id,
      name: item.name || item.id,
      url: item.url,
      updatedAt: now,
      type: normalizeProfileType(item),
      source: 'clash-party'
    })
    profileCopies.push({ source: sourceProfile, target: profilePath(item.id) })
  }

  if (items.length === 0) throw new MihoroError('No importable Clash Party profiles found.')
  const current = chooseCurrent(profileConfig.current, items)
  const state: SubscriptionState = { current, items }
  const controlledSource = existsSync(clashControlledPath) ? clashControlledPath : undefined
  const conflicts = collectConflicts(profileCopies, controlledSource)

  return { state, profileCopies, controlledSource, conflicts, skippedProfiles }
}

/**
 * Chooses the imported current profile.
 *
 * @param clashCurrent Current id from Clash Party profile config.
 * @param items Imported subscription items.
 * @returns Current profile id.
 */
function chooseCurrent(clashCurrent: string | undefined, items: SubscriptionItem[]): string {
  if (clashCurrent && items.some((item) => item.id === clashCurrent)) return clashCurrent
  return items[0].id
}

/**
 * Normalizes a Clash Party profile type into mihoro profile type.
 *
 * @param item Clash Party profile item.
 * @returns Remote or local profile type.
 */
function normalizeProfileType(item: ClashPartyProfileItem): 'remote' | 'local' {
  if (item.url) return 'remote'
  if (item.type === 'remote') return 'remote'
  return 'local'
}

/**
 * Returns existing target files that would be overwritten.
 *
 * @param profileCopies Planned profile copies.
 * @param controlledSource Optional controlled config source.
 * @returns Existing target paths.
 */
function collectConflicts(
  profileCopies: PlannedImport['profileCopies'],
  controlledSource: string | undefined
): string[] {
  const candidates = [subscriptionsPath(), ...profileCopies.map((copy) => copy.target)]
  if (controlledSource) candidates.push(controlledConfigPath())
  return candidates.filter((candidate) => existsSync(candidate))
}

/**
 * Backs up existing target files before overwrite.
 *
 * @param conflicts Existing target files.
 * @returns Backup directory path.
 */
async function backupConflicts(conflicts: string[]): Promise<string> {
  const backupDir = path.join(dataDir(), 'backups', `clash-party-import-${timestamp()}`)
  for (const target of conflicts) {
    const relative = path.relative(dataDir(), target)
    const backupPath = path.join(backupDir, relative)
    await mkdir(path.dirname(backupPath), { recursive: true })
    await cp(target, backupPath)
  }
  return backupDir
}

/**
 * Asserts that a path is an existing directory.
 *
 * @param dir Directory path.
 * @returns Nothing when the path is a directory.
 */
async function assertDirectory(dir: string): Promise<void> {
  try {
    const stats = await stat(dir)
    if (!stats.isDirectory()) throw new MihoroError(`Not a directory: ${dir}`)
  } catch (error) {
    if (error instanceof MihoroError) throw error
    throw new MihoroError(`Directory not found: ${dir}`)
  }
}

/**
 * Builds a filesystem-safe timestamp for backup directories.
 *
 * @returns Timestamp string.
 */
function timestamp(): string {
  return new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')
}
