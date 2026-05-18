/**
 * @file Borderless table renderer — columns separated by two spaces, header
 *   underlined with `─`. Lighter weight than `formatTable` (no box-drawing
 *   characters); the right choice when the surface is rendering to a context
 *   that doesn't reliably support box-drawing glyphs.
 */

import colors from '../external/yoctocolors-cjs'
import { ArrayPrototypePush } from '../primordials/array'
import { MathMax } from '../primordials/math'

import { displayWidth, padText } from './padding'

import type { TableColumn } from './types'

/**
 * Format data as a simple table without borders. Lighter weight alternative to
 * formatTable().
 *
 * @example
 *   import { formatSimpleTable } from '@socketsecurity/lib/tables/simple'
 *   import colors from 'yoctocolors-cjs'
 *
 *   const data = [
 *     { name: 'lodash', version: '4.17.21' },
 *     { name: 'react', version: '18.2.0' },
 *   ]
 *   const columns = [
 *     { key: 'name', header: 'Package' },
 *     { key: 'version', header: 'Version' },
 *   ]
 *   console.log(formatSimpleTable(data, columns))
 *   // Output:
 *   // Package  Version
 *   // ───────  ───────
 *   // lodash   4.17.21
 *   // react    18.2.0
 *
 * @param data - Array of data objects.
 * @param columns - Column configuration.
 *
 * @returns Formatted table string
 */
export function formatSimpleTable(
  data: Array<Record<string, unknown>>,
  columns: TableColumn[],
): string {
  if (data.length === 0) {
    return '(no data)'
  }

  // Calculate column widths
  const widths = columns.map(col => {
    const headerWidth = displayWidth(col.header)
    const maxDataWidth = MathMax(
      ...data.map(row => displayWidth(String(row[col.key] ?? ''))),
    )
    return col.width ?? MathMax(headerWidth, maxDataWidth)
  })

  const lines: string[] = []

  // Header row
  const headerCells = columns.map((col, i) =>
    padText(colors.bold(col.header), widths[i] as number, col.align),
  )
  ArrayPrototypePush(lines, headerCells.join('  '))

  // Header separator
  const separators = widths.map(w => colors.dim('─'.repeat(w)))
  ArrayPrototypePush(lines, separators.join('  '))

  // Data rows
  for (const row of data) {
    const cells = columns.map((col, i) => {
      let value = String(row[col.key] ?? '')
      if (col.color) {
        value = col.color(value)
      }
      return padText(value, widths[i] as number, col.align)
    })
    ArrayPrototypePush(lines, cells.join('  '))
  }

  return lines.join('\n')
}
