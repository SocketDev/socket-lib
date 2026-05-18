/**
 * @file Bordered table renderer using Unicode box-drawing characters (`┌`, `─`,
 *   `│`, `┴`, …). The right choice when the output context renders box-drawing
 *   reliably (modern terminals, GitHub markdown, most CI runners). Shares
 *   column-width calculation, alignment, and padding with the simple renderer
 *   via `./padding`.
 */

import colors from '../external/yoctocolors-cjs'
import { ArrayPrototypePush } from '../primordials/array'
import { MathMax } from '../primordials/math'

import { displayWidth, padText } from './padding'

import type { TableColumn } from './types'

/**
 * Format data as an ASCII table with borders.
 *
 * @example
 *   import { formatTable } from '@socketsecurity/lib/tables/bordered'
 *   import colors from 'yoctocolors-cjs'
 *
 *   const data = [
 *     { name: 'lodash', version: '4.17.21', issues: 0 },
 *     { name: 'react', version: '18.2.0', issues: 2 },
 *   ]
 *   const columns = [
 *     { key: 'name', header: 'Package' },
 *     { key: 'version', header: 'Version', align: 'center' },
 *     {
 *       key: 'issues',
 *       header: 'Issues',
 *       align: 'right',
 *       color: v => (v === '0' ? colors.green(v) : colors.red(v)),
 *     },
 *   ]
 *   console.log(formatTable(data, columns))
 *   // Output:
 *   // ┌─────────┬─────────┬────────┐
 *   // │ Package │ Version │ Issues │
 *   // ├─────────┼─────────┼────────┤
 *   // │ lodash  │ 4.17.21 │      0 │
 *   // │ react   │ 18.2.0  │      2 │
 *   // └─────────┴─────────┴────────┘
 *
 * @param data - Array of data objects.
 * @param columns - Column configuration.
 *
 * @returns Formatted table string
 */
export function formatTable(
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

  // Top border
  const topBorder = `┌─${widths.map(w => '─'.repeat(w)).join('─┬─')}─┐`
  ArrayPrototypePush(lines, colors.dim(topBorder))

  // Header row
  const headerCells = columns.map((col, i) => {
    const text = colors.bold(col.header)
    return padText(text, widths[i] as number, col.align)
  })
  ArrayPrototypePush(
    lines,
    colors.dim('│ ') + headerCells.join(colors.dim(' │ ')) + colors.dim(' │'),
  )

  // Header separator
  const headerSep = `├─${widths.map(w => '─'.repeat(w)).join('─┼─')}─┤`
  ArrayPrototypePush(lines, colors.dim(headerSep))

  // Data rows
  for (const row of data) {
    const cells = columns.map((col, i) => {
      let value = String(row[col.key] ?? '')
      if (col.color) {
        value = col.color(value)
      }
      return padText(value, widths[i] as number, col.align)
    })
    ArrayPrototypePush(
      lines,
      colors.dim('│ ') + cells.join(colors.dim(' │ ')) + colors.dim(' │'),
    )
  }

  // Bottom border
  const bottomBorder = `└─${widths.map(w => '─'.repeat(w)).join('─┴─')}─┘`
  ArrayPrototypePush(lines, colors.dim(bottomBorder))

  return lines.join('\n')
}
