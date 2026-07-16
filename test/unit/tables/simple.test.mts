import { stripAnsi as canonicalStripAnsi } from '@socketsecurity/lib-stable/ansi/strip'
import { describe, expect, it, vi } from 'vitest'

import type { YoctoColors } from '../../../src/external/yoctocolors-cjs'

const colors = vi.hoisted(() => {
  const format = (open: number, close: number) => (value: string) =>
    `\x1b[${open}m${value}\x1b[${close}m`
  return {
    bold: format(1, 22),
    dim: format(2, 22),
    green: format(32, 39),
    red: format(31, 39),
  }
})

vi.mock(import('../../../src/external/yoctocolors-cjs'), () => ({
  default: colors as unknown as YoctoColors,
}))

import { stripAnsi } from '../../../src/ansi/strip'
import { formatTable } from '../../../src/tables/bordered'
import { formatSimpleTable } from '../../../src/tables/simple'

describe('tables/simple — formatSimpleTable', () => {
  it('formats empty data', () => {
    const result = formatSimpleTable([], [])
    expect(result).toBe('(no data)')
  })

  it('formats simple table without borders', () => {
    const data = [
      { name: 'lodash', version: '4.17.21' },
      { name: 'react', version: '18.2.0' },
    ]
    const columns = [
      { key: 'name', header: 'Package' },
      { key: 'version', header: 'Version' },
    ]

    const result = formatSimpleTable(data, columns)
    expect(result).toContain('Package')
    expect(result).toContain('Version')
    expect(result).toContain('lodash')
    expect(result).toContain('react')
  })

  it('does not include box borders', () => {
    const data = [{ name: 'test' }]
    const columns = [{ key: 'name', header: 'Name' }]

    const result = formatSimpleTable(data, columns)
    const stripped = stripAnsi(result)
    expect(stripped).not.toContain('┌')
    expect(stripped).not.toContain('│')
  })

  it('includes separator line', () => {
    const data = [{ name: 'test' }]
    const columns = [{ key: 'name', header: 'Name' }]

    const result = formatSimpleTable(data, columns)
    expect(stripAnsi(result)).toContain('─')
  })

  it('handles alignment left', () => {
    const data = [{ value: 'test' }]
    const columns = [{ key: 'value', header: 'Value', align: 'left' as const }]

    const result = formatSimpleTable(data, columns)
    expect(result).toContain('test')
  })

  it('handles alignment right', () => {
    const data = [{ value: '42' }]
    const columns = [
      { key: 'value', header: 'Number', align: 'right' as const },
    ]

    const result = formatSimpleTable(data, columns)
    expect(result).toContain('42')
  })

  it('handles alignment center', () => {
    const data = [{ value: 'center' }]
    const columns = [
      { key: 'value', header: 'Value', align: 'center' as const },
    ]

    const result = formatSimpleTable(data, columns)
    expect(result).toContain('center')
  })

  it('applies color functions', () => {
    const data = [{ status: 'error' }]
    const columns = [
      {
        key: 'status',
        header: 'Status',
        color: (v: string) => colors.red(v),
      },
    ]

    const result = formatSimpleTable(data, columns)
    expect(result).toContain('error')
    expect(result.length).toBeGreaterThan(canonicalStripAnsi(result).length)
  })

  it('handles missing values', () => {
    const data = [{ name: 'test' }]
    const columns = [
      { key: 'name', header: 'Name' },
      { key: 'missing', header: 'Missing' },
    ]

    const result = formatSimpleTable(data, columns)
    expect(result).toContain('test')
  })

  it('handles multiple rows', () => {
    const data = [
      { a: '1', b: '2' },
      { a: '3', b: '4' },
      { a: '5', b: '6' },
    ]
    const columns = [
      { key: 'a', header: 'A' },
      { key: 'b', header: 'B' },
    ]

    const result = formatSimpleTable(data, columns)
    const lines = result.split('\n')
    expect(lines.length).toBeGreaterThan(3)
  })

  it('handles custom column widths', () => {
    const data = [{ name: 'test' }]
    const columns = [{ key: 'name', header: 'Name', width: 20 }]

    const result = formatSimpleTable(data, columns)
    expect(result).toContain('test')
  })

  it('handles ANSI colored content', () => {
    const data = [{ status: colors.green('SUCCESS') }]
    const columns = [{ key: 'status', header: 'Status' }]

    const result = formatSimpleTable(data, columns)
    expect(result).toContain('SUCCESS')
  })

  it('formats headers in bold', () => {
    const data = [{ name: 'test' }]
    const columns = [{ key: 'name', header: 'Name' }]

    const result = formatSimpleTable(data, columns)
    expect(result.includes('\x1b[1m')).toBe(true)
  })

  it('is more compact than formatTable', () => {
    const data = [{ name: 'test' }]
    const columns = [{ key: 'name', header: 'Name' }]

    const bordered = formatTable(data, columns)
    const simple = formatSimpleTable(data, columns)

    expect(stripAnsi(simple).length).toBeLessThan(
      canonicalStripAnsi(bordered).length,
    )
  })
})
