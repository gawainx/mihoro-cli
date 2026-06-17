import Table from 'cli-table3'

export interface TableOptions {
  /** Column headers shown at the top of the table. */
  head: string[]
  /** Table rows, already formatted as display strings. */
  rows: string[][]
}

/**
 * Formats rows as a compact CLI table.
 *
 * @param options Table headers and rows.
 * @returns Bordered table string.
 */
export function formatTable(options: TableOptions): string {
  const table = new Table({
    head: options.head,
    style: {
      head: [],
      border: []
    },
    wordWrap: true
  })
  table.push(...options.rows)
  return table.toString()
}
