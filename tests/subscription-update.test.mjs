import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  fetchSubscriptionProfileWithDownloader,
  orderSubscriptionsForUpdate,
  renderSubscriptionUpdateResults,
  updateAllSubscriptions
} from '../dist/config/subscription-update.js'

function profile(name) {
  return `proxies:\n  - name: ${name}\n    type: direct\nproxy-groups: []\nrules: []\n`
}

async function withTempHome(fn) {
  const previous = process.env.MIHORO_HOME
  const home = await mkdtemp(join(tmpdir(), 'mihoro-sub-update-'))
  process.env.MIHORO_HOME = home
  try {
    return await fn(home)
  } finally {
    if (previous === undefined) delete process.env.MIHORO_HOME
    else process.env.MIHORO_HOME = previous
    await rm(home, { recursive: true, force: true })
  }
}

test('fetchSubscriptionProfile returns direct mode when direct download succeeds', async () => {
  const calls = []
  const result = await fetchSubscriptionProfileWithDownloader('https://example.com/sub.yaml', { useProxy: false }, async (_url, mode) => {
    calls.push(mode)
    return profile(mode)
  })

  assert.deepEqual(calls, ['direct'])
  assert.equal(result.mode, 'direct')
  assert.equal(result.profile.proxies[0].name, 'direct')
})

test('fetchSubscriptionProfile falls back to proxy mode after direct failure', async () => {
  const calls = []
  const result = await fetchSubscriptionProfileWithDownloader('https://example.com/sub.yaml', { useProxy: false }, async (_url, mode) => {
    calls.push(mode)
    if (mode === 'direct') throw new Error('direct failed')
    return profile('proxy-fallback')
  })

  assert.deepEqual(calls, ['direct', 'proxy'])
  assert.equal(result.mode, 'proxy-fallback')
  assert.equal(result.profile.proxies[0].name, 'proxy-fallback')
})

test('fetchSubscriptionProfile uses proxy mode directly when requested', async () => {
  const calls = []
  const result = await fetchSubscriptionProfileWithDownloader('https://example.com/sub.yaml', { useProxy: true }, async (_url, mode) => {
    calls.push(mode)
    return profile(mode)
  })

  assert.deepEqual(calls, ['proxy'])
  assert.equal(result.mode, 'proxy')
  assert.equal(result.profile.proxies[0].name, 'proxy')
})

test('orderSubscriptionsForUpdate puts current subscription last', () => {
  const ordered = orderSubscriptionsForUpdate(
    {
      current: 'current',
      items: [
        { id: 'current', name: 'Current', url: 'https://example.com/current.yaml', updatedAt: 'old' },
        { id: 'other', name: 'Other', url: 'https://example.com/other.yaml', updatedAt: 'old' },
        { id: 'local', name: 'Local', updatedAt: 'old' }
      ]
    }
  )

  assert.deepEqual(ordered.map((item) => item.id), ['other', 'local', 'current'])
})

test('updateAllSubscriptions skips subscriptions without URLs and continues', async () => {
  await withTempHome(async (home) => {
    await writeFile(
      join(home, 'subscriptions.yaml'),
      [
        'current: local',
        'items:',
        '  - id: local',
        '    name: Local',
        '    updatedAt: old',
        '  - id: imported',
        '    name: Imported',
        '    updatedAt: old'
      ].join('\n'),
      'utf8'
    )

    const results = await updateAllSubscriptions({ useProxy: false })
    assert.deepEqual(results.map((result) => result.id), ['imported', 'local'])
    assert.deepEqual(results.map((result) => result.status), ['skipped', 'skipped'])
  })
})

test('renderSubscriptionUpdateResults shows updated failed and skipped rows', () => {
  const table = renderSubscriptionUpdateResults([
    {
      id: 'main',
      name: 'Main',
      current: true,
      status: 'updated',
      mode: 'proxy-fallback',
      updatedAt: '2026-06-27T00:00:00.000Z',
      detail: 'updated at 2026-06-27T00:00:00.000Z'
    },
    {
      id: 'local',
      name: 'Local',
      current: false,
      status: 'skipped',
      detail: 'subscription has no URL'
    },
    {
      id: 'bad',
      name: 'Bad',
      current: false,
      status: 'failed',
      mode: 'direct',
      detail: 'HTTP 403 Forbidden'
    }
  ])

  assert.match(table, /Subscription/)
  assert.match(table, /proxy-fallback/)
  assert.match(table, /skipped/)
  assert.match(table, /failed/)
  assert.match(table, /HTTP 403 Forbidden/)
})
