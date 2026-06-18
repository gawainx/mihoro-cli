import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildHttpProxyRequest,
  classifyHttpStatus,
  parseTestUrl,
  redactUrl
} from '../dist/diagnostics/proxy-test.js'

test('parseTestUrl accepts http and https URLs', () => {
  assert.equal(parseTestUrl('http://example.com/path').protocol, 'http:')
  assert.equal(parseTestUrl('https://example.com/path').protocol, 'https:')
})

test('parseTestUrl rejects non-http URLs', () => {
  assert.throws(() => parseTestUrl('ftp://example.com/file'), /Expected an HTTP or HTTPS URL/)
})

test('redactUrl hides credentials and sensitive query values', () => {
  const url = parseTestUrl('https://user:pass@example.com/path?token=abc&name=plain&api_key=secret')
  assert.equal(redactUrl(url), 'https://***:***@example.com/path?token=***&name=plain&api_key=***')
})

test('classifyHttpStatus treats 4xx and 5xx as target warnings', () => {
  assert.deepEqual(classifyHttpStatus(200), { status: 'ok', exitCode: 0 })
  assert.deepEqual(classifyHttpStatus(302), { status: 'ok', exitCode: 0 })
  assert.deepEqual(classifyHttpStatus(404), { status: 'warn', exitCode: 0 })
  assert.deepEqual(classifyHttpStatus(503), { status: 'warn', exitCode: 0 })
})

test('buildHttpProxyRequest uses absolute-form request targets for HTTP URLs', () => {
  const request = buildHttpProxyRequest(parseTestUrl('http://target.example/test?a=1'))
  assert.match(request, /^GET http:\/\/target\.example\/test\?a=1 HTTP\/1\.1\r\n/)
  assert.match(request, /\r\nHost: target\.example\r\n/)
})
