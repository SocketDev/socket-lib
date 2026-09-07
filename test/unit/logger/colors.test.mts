import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { applyColor, getYoctocolors } from '../../../src/logger/colors.mjs'
import { getSupportsColor } from '../../../src/term/colors/support.mjs'

const colors = getYoctocolors()

// applyColor withholds the escape from a destination that accepts no color, so
// a test about which escape gets emitted has to name a stream that accepts one.
const TTY = { stream: { isTTY: true } }
const PIPE = { stream: { isTTY: false } }

beforeEach(() => {
  vi.spyOn(getSupportsColor(), 'createSupportsColor').mockImplementation(
    stream =>
      stream?.isTTY
        ? { has16m: true, has256: true, hasBasic: true, level: 3 }
        : false,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('logger/colors — applyColor', { concurrent: false }, () => {
  test('routes named colors through the yoctocolors function map', () => {
    expect(applyColor('hi', 'green', TTY)).toBe(colors.green('hi'))
    expect(applyColor('hi', 'red', TTY)).toBe(colors.red('hi'))
    expect(applyColor('hi', 'cyan', TTY)).toBe(colors.cyan('hi'))
  })

  test('emits a 24-bit ANSI escape for RGB tuples', () => {
    expect(applyColor('hi', [255, 0, 0], TTY)).toBe(
      '\u001B[38;2;255;0;0mhi\u001B[39m',
    )
  })

  test('handles zero-component RGB tuples', () => {
    expect(applyColor('x', [0, 0, 0], TTY)).toBe(
      '\u001B[38;2;0;0;0mx\u001B[39m',
    )
  })

  test('handles 8-bit max RGB tuples', () => {
    expect(applyColor('x', [255, 255, 255], TTY)).toBe(
      '\u001B[38;2;255;255;255mx\u001B[39m',
    )
  })

  test('round-trips empty text through both branches without throwing', () => {
    expect(applyColor('', 'green', TTY)).toBe(colors.green(''))
    expect(applyColor('', [10, 20, 30], TTY)).toBe(
      '\u001B[38;2;10;20;30m\u001B[39m',
    )
  })

  test('withholds a named-color escape from a stream that accepts none', () => {
    expect(applyColor('hi', 'green', PIPE)).toBe('hi')
    expect(applyColor('hi', 'red', PIPE)).toBe('hi')
  })

  test('withholds RGB escapes from a terminal with only basic color support', () => {
    vi.mocked(getSupportsColor().createSupportsColor).mockReturnValue({
      has16m: false,
      has256: false,
      hasBasic: true,
      level: 1,
    })
    expect(applyColor('plain', [12, 34, 56], TTY)).toBe('plain')
  })

  test('withholds a 24-bit escape from a stream that accepts none', () => {
    expect(applyColor('hi', [255, 0, 0], PIPE)).toBe('hi')
  })

  test('emits no escape sequence at all to a plain stream', () => {
    const painted = applyColor('plain', [12, 34, 56], PIPE)
    expect(painted.includes('\u001B')).toBe(false)
  })

  test('leaves empty text empty on a stream that accepts no color', () => {
    expect(applyColor('', 'green', PIPE)).toBe('')
    expect(applyColor('', [1, 2, 3], PIPE)).toBe('')
  })
})

describe('logger/colors — getYoctocolors', { concurrent: false }, () => {
  test('returns the vendored yoctocolors-cjs module shape', () => {
    expect(typeof colors.green).toBe('function')
    expect(typeof colors.red).toBe('function')
    expect(typeof colors.bold).toBe('function')
  })
})
