import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  hashNodeName,
  shortNodeHash,
  refreshNodeIndexForSubscription,
  resolveNodeHash,
  readNodeIndexes
} from '../dist/config/node-index.js'

async function withMihoroHome(t) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'mihoro-node-index-'))
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

function sampleNodes() {
  return [
    { name: 'HK 01', type: 'Shadowsocks', groups: ['Proxy', 'Auto'] },
    { name: 'JP 01', type: 'Trojan', groups: ['Proxy'] }
  ]
}

test('hashNodeName creates stable subscription-scoped sha256 hashes', () => {
  const first = hashNodeName('sub-a', 'HK 01')
  const second = hashNodeName('sub-a', 'HK 01')

  assert.equal(first, second)
  assert.match(first, /^[a-f0-9]{64}$/)
  assert.notEqual(first, hashNodeName('sub-b', 'HK 01'))
  assert.notEqual(first, hashNodeName('sub-a', 'JP 01'))
  assert.equal(shortNodeHash(first), first.slice(0, 8))
})

test('shortNodeHash always returns an 8-character display hash', () => {
  assert.equal(shortNodeHash('abcdef0011111111111111111111111111111111111111111111111111111111'), 'abcdef00')
  assert.equal(shortNodeHash('abcdef'), 'abcdef')
})

test('refreshNodeIndexForSubscription writes current subscription node index', async (t) => {
  await withMihoroHome(t)

  const index = await refreshNodeIndexForSubscription('sub-a', sampleNodes)
  const firstHash = hashNodeName('sub-a', 'HK 01')
  const file = await readNodeIndexes()

  assert.equal(index.nodes[firstHash].shortHash, firstHash.slice(0, 8))
  assert.equal(index.nodes[firstHash].name, 'HK 01')
  assert.deepEqual(index.nodes[firstHash].groups, ['Proxy', 'Auto'])
  assert.equal(file.subscriptions['sub-a'].nodes[firstHash].name, 'HK 01')
})

test('refreshNodeIndexForSubscription normalizes controlled short hashes to 8 characters', async (t) => {
  await withMihoroHome(t)

  const index = await refreshNodeIndexForSubscription('sub-a', [
    {
      name: 'Node A',
      hash: 'abcdef0011111111111111111111111111111111111111111111111111111111',
      shortHash: 'abcdef001111',
      groups: []
    }
  ])

  assert.equal(index.nodes.abcdef0011111111111111111111111111111111111111111111111111111111.shortHash, 'abcdef00')
})

test('resolveNodeHash accepts unique hash prefixes and rejects node names', async (t) => {
  await withMihoroHome(t)
  await refreshNodeIndexForSubscription('sub-a', sampleNodes)
  const hash = hashNodeName('sub-a', 'HK 01')

  assert.equal((await resolveNodeHash('sub-a', hash)).name, 'HK 01')
  assert.equal((await resolveNodeHash('sub-a', hash.slice(0, 8))).name, 'HK 01')
  await assert.rejects(() => resolveNodeHash('sub-a', 'HK 01'), /Node hash not found/)
})

test('resolveNodeHash reports ambiguous prefixes', async (t) => {
  await withMihoroHome(t)
  await refreshNodeIndexForSubscription('sub-a', [
    { name: 'Node A', hash: 'abcdef0011111111111111111111111111111111111111111111111111111111', shortHash: 'abcdef00', groups: [] },
    { name: 'Node B', hash: 'abcdef9922222222222222222222222222222222222222222222222222222222', shortHash: 'abcdef99', groups: [] }
  ])

  await assert.rejects(() => resolveNodeHash('sub-a', 'abcdef'), /Node hash prefix is ambiguous/)
})
