import { describe, expect, test } from 'vitest'

import { applyColor, getYoctocolors } from '../../../src/logger/colors'

const colors = getYoctocolors()

describe.sequential('logger/colors — applyColor', () => {
  test('routes named colors through the yoctocolors function map', () => {
    expect(applyColor('hi', 'green')).toBe(colors.green('hi'))
    expect(applyColor('hi', 'red')).toBe(colors.red('hi'))
    expect(applyColor('hi', 'cyan')).toBe(colors.cyan('hi'))
  })

  test('emits a 24-bit ANSI escape for RGB tuples', () => {
    expect(applyColor('hi', [255, 0, 0])).toBe('[38;2;255;0;0mhi[39m')
  })

  test('handles zero-component RGB tuples', () => {
    expect(applyColor('x', [0, 0, 0])).toBe('[38;2;0;0;0mx[39m')
  })

  test('handles 8-bit max RGB tuples', () => {
    expect(applyColor('x', [255, 255, 255])).toBe('[38;2;255;255;255mx[39m')
  })

  test('round-trips empty text through both branches without throwing', () => {
    expect(applyColor('', 'green')).toBe(colors.green(''))
    expect(applyColor('', [10, 20, 30])).toBe('[38;2;10;20;30m[39m')
  })
})

describe.sequential('logger/colors — getYoctocolors', () => {
  test('returns the vendored yoctocolors-cjs module shape', () => {
    expect(typeof colors.green).toBe('function')
    expect(typeof colors.red).toBe('function')
    expect(typeof colors.bold).toBe('function')
  })
})
