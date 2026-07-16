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

describe('tables/bordered — formatTable', () => {
  it('formats empty data', () => {
    const result = formatTable([], [])
    expect(result).toBe('(no data)')
  })

  it('formats simple table', () => {
    const data = [
      { name: 'lodash', version: '4.17.21' },
      { name: 'react', version: '18.2.0' },
    ]
    const columns = [
      { key: 'name', header: 'Package' },
      { key: 'version', header: 'Version' },
    ]

    const result = formatTable(data, columns)
    expect(result).toContain('Package')
    expect(result).toContain('Version')
    expect(result).toContain('lodash')
    expect(result).toContain('react')
    expect(result).toContain('4.17.21')
    expect(result).toContain('18.2.0')
  })

  it('includes borders', () => {
    const data = [{ name: 'test' }]
    const columns = [{ key: 'name', header: 'Name' }]

    const result = formatTable(data, columns)
    const stripped = stripAnsi(result)
    expect(stripped).toContain('┌')
    expect(stripped).toContain('┐')
    expect(stripped).toContain('├')
    expect(stripped).toContain('┤')
    expect(stripped).toContain('└')
    expect(stripped).toContain('┘')
    expect(stripped).toContain('│')
  })

  it('handles alignment left', () => {
    const data = [{ value: 'test' }]
    const columns = [{ key: 'value', header: 'Value', align: 'left' as const }]

    const result = formatTable(data, columns)
    expect(result).toContain('test')
  })

  it('handles alignment right', () => {
    const data = [{ value: '42' }]
    const columns = [
      { key: 'value', header: 'Number', align: 'right' as const },
    ]

    const result = formatTable(data, columns)
    expect(result).toContain('42')
  })

  it('handles alignment center', () => {
    const data = [{ value: 'centered' }]
    const columns = [
      { key: 'value', header: 'Value', align: 'center' as const },
    ]

    const result = formatTable(data, columns)
    expect(result).toContain('centered')
  })

  it('handles custom column widths', () => {
    const data = [{ name: 'test' }]
    const columns = [{ key: 'name', header: 'Name', width: 20 }]

    const result = formatTable(data, columns)
    const lines = stripAnsi(result).split('\n')
    expect(lines.some(line => line.length > 20)).toBe(true)
  })

  it('applies color functions', () => {
    const data = [{ status: 'ok' }]
    const columns = [
      {
        key: 'status',
        header: 'Status',
        color: (v: string) => colors.green(v),
      },
    ]

    const result = formatTable(data, columns)
    expect(result).toContain('ok')
    expect(result.length).toBeGreaterThan(canonicalStripAnsi(result).length)
  })

  it('handles missing values', () => {
    const data = [{ name: 'test' }]
    const columns = [
      { key: 'name', header: 'Name' },
      { key: 'missing', header: 'Missing' },
    ]

    const result = formatTable(data, columns)
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

    const result = formatTable(data, columns)
    const lines = result.split('\n')
    expect(lines.length).toBeGreaterThan(5)
  })

  it('handles wide content', () => {
    const data = [{ text: 'A very long piece of text that should be handled' }]
    const columns = [{ key: 'text', header: 'Text' }]

    const result = formatTable(data, columns)
    expect(result).toContain('A very long piece of text')
  })

  it('handles numeric values', () => {
    const data = [{ count: 42, price: 99.99 }]
    const columns = [
      { key: 'count', header: 'Count' },
      { key: 'price', header: 'Price' },
    ]

    const result = formatTable(data, columns)
    expect(result).toContain('42')
    expect(result).toContain('99.99')
  })

  it('handles boolean values', () => {
    const data = [{ enabled: true, disabled: false }]
    const columns = [
      { key: 'enabled', header: 'Enabled' },
      { key: 'disabled', header: 'Disabled' },
    ]

    const result = formatTable(data, columns)
    expect(result).toContain('true')
    expect(result).toContain('false')
  })

  it('handles ANSI colored content', () => {
    const data = [{ name: colors.red('ERROR') }]
    const columns = [{ key: 'name', header: 'Status' }]

    const result = formatTable(data, columns)
    expect(result).toContain('ERROR')
  })

  it('formats headers in bold', () => {
    const data = [{ name: 'test' }]
    const columns = [{ key: 'name', header: 'Name' }]

    const result = formatTable(data, columns)
    expect(result.includes('\x1b[1m')).toBe(true)
  })

  it('handles empty string values', () => {
    const data = [{ name: '' }]
    const columns = [{ key: 'name', header: 'Name' }]

    const result = formatTable(data, columns)
    expect(stripAnsi(result)).toContain('│')
  })
})

describe('tables/bordered — edge cases', () => {
  it('handles special characters', () => {
    const data = [{ text: 'Hello! @#$%^&*()' }]
    const columns = [{ key: 'text', header: 'Text' }]

    const result = formatTable(data, columns)
    expect(result).toContain('Hello!')
  })

  it('handles unicode characters', () => {
    const data = [{ text: '你好世界' }]
    const columns = [{ key: 'text', header: 'Text' }]

    const result = formatTable(data, columns)
    expect(result).toContain('你好世界')
  })

  it('handles emoji', () => {
    // oxlint-disable-next-line socket/no-status-emoji -- fixture data exercises emoji rendering in table cells.
    const data = [{ status: '✓ Done' }]
    const columns = [{ key: 'status', header: 'Status' }]

    const result = formatTable(data, columns)
    // oxlint-disable-next-line socket/no-status-emoji -- asserts emoji round-trips through table output.
    expect(result).toContain('✓ Done')
  })

  it('handles null values', () => {
    const data = [{ value: undefined }]
    const columns = [{ key: 'value', header: 'Value' }]

    const result = formatTable(data, columns)
    expect(stripAnsi(result)).toContain('│')
  })

  it('handles undefined values', () => {
    const data = [{ value: undefined }]
    const columns = [{ key: 'value', header: 'Value' }]

    const result = formatTable(data, columns)
    expect(stripAnsi(result)).toContain('│')
  })

  it('handles very long headers', () => {
    const data = [{ x: '1' }]
    const columns = [
      {
        key: 'x',
        header: 'This is a very long header name that extends far',
      },
    ]

    const result = formatTable(data, columns)
    expect(result).toContain('This is a very long header')
  })

  it('handles zero values', () => {
    const data = [{ count: 0 }]
    const columns = [{ key: 'count', header: 'Count' }]

    const result = formatTable(data, columns)
    expect(result).toContain('0')
  })
})

describe('tables/bordered — integration', () => {
  it('formats complex table with all features', () => {
    const data = [
      { name: 'package1', version: '1.0.0', issues: 0, status: 'ok' },
      { name: 'package2', version: '2.1.3', issues: 3, status: 'warning' },
    ]
    const columns = [
      { key: 'name', header: 'Package', align: 'left' as const },
      { key: 'version', header: 'Version', align: 'center' as const },
      {
        key: 'issues',
        header: 'Issues',
        align: 'right' as const,
        color: (v: string) => (v === '0' ? colors.green(v) : colors.red(v)),
      },
      { key: 'status', header: 'Status', width: 10 },
    ]

    const result = formatTable(data, columns)
    expect(result).toContain('package1')
    expect(result).toContain('package2')
    expect(result).toContain('1.0.0')
    expect(result).toContain('2.1.3')
  })

  it('produces valid output structure', () => {
    const data = [{ a: '1' }]
    const columns = [{ key: 'a', header: 'A' }]

    const result = formatTable(data, columns)
    const lines = result.split('\n')

    expect(lines.length).toBe(5)
  })
})
