import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatTable } from '../dist/lib/table.js'

test('formatTable renders headers and rows as a bordered table', () => {
  const output = formatTable({
    head: ['Hash', 'Name', 'Groups'],
    rows: [
      ['abc12345', 'HK 01', 'Proxy,Auto'],
      ['def67890', 'JP 01', 'Proxy']
    ]
  })

  assert.match(output, /Hash/)
  assert.match(output, /abc12345/)
  assert.match(output, /HK 01/)
  assert.match(output, /Proxy,Auto/)
  assert.match(output, /[┌+]/)
})
