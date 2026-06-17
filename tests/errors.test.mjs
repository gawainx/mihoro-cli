import assert from 'node:assert/strict'
import { test } from 'node:test'
import { errorMessage } from '../dist/lib/errors.js'

test('errorMessage formats plain objects without object Object output', () => {
  const message = errorMessage({ code: 'E_FAIL', detail: 'mihomo startup failed' })

  assert.notEqual(message, '[object Object]')
  assert.equal(message, '{"code":"E_FAIL","detail":"mihomo startup failed"}')
})
