import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { stringify } from 'yaml'
import { configPath } from '../dist/lib/paths.js'
import { hashNodeName, refreshNodeIndexForSubscription } from '../dist/config/node-index.js'
import {
  readDefaultNodeHashesForSubscription,
  saveDefaultNodeHashForSubscription,
  resolveDefaultNodeHashesForSubscription
} from '../dist/config/state.js'

async function withMihoroHome(t) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'mihoro-state-'))
  const previous = process.env.MIHORO_HOME
  process.env.MIHORO_HOME = home
  t.after(async () => {
    if (previous === undefined) {
      delete process.env.MIHORO_HOME
    } else {
      process.env.MIHORO_HOME = previous
    }
    await rm(home, { recursive: true, force: true })
  })
  return home
}

test('saveDefaultNodeHashForSubscription writes full hashes into the hash field', async (t) => {
  await withMihoroHome(t)
  const hash = hashNodeName('sub-a', 'HK 01')

  await saveDefaultNodeHashForSubscription('sub-a', 'Proxy', hash)
  const defaults = await readDefaultNodeHashesForSubscription('sub-a')
  const raw = await readFile(configPath(), 'utf8')

  assert.deepEqual(defaults, { Proxy: hash })
  assert.match(raw, /subscriptionDefaultNodeHashes/)
  assert.doesNotMatch(raw, /subscriptionDefaultNodes:\n\s+sub-a:\n\s+Proxy/)
})

test('resolveDefaultNodeHashesForSubscription migrates legacy node names to full hashes', async (t) => {
  const home = await withMihoroHome(t)
  await mkdir(home, { recursive: true })
  await writeFile(
    configPath(),
    stringify({
      proxyHost: '127.0.0.1',
      proxyBypass: [],
      defaultNodes: {},
      subscriptionDefaultNodes: {
        'sub-a': {
          Proxy: 'HK 01'
        }
      }
    }),
    'utf8'
  )
  await refreshNodeIndexForSubscription('sub-a', [{ name: 'HK 01', type: 'Shadowsocks', groups: ['Proxy'] }])
  const hash = hashNodeName('sub-a', 'HK 01')

  const defaults = await resolveDefaultNodeHashesForSubscription('sub-a')
  const persisted = await readDefaultNodeHashesForSubscription('sub-a')

  assert.deepEqual(defaults, { Proxy: hash })
  assert.deepEqual(persisted, { Proxy: hash })
})
