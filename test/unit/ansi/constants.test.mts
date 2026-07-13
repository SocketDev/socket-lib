/**
 * @file Unit tests for src/ansi/constants — ANSI escape sequence constants.
 */

import { describe, expect, it } from 'vitest'

import {
  ANSI_BOLD,
  ANSI_DIM,
  ANSI_ITALIC,
  ANSI_RESET,
  ANSI_STRIKETHROUGH,
  ANSI_UNDERLINE,
} from '../../../src/ansi/constants'

describe.sequential('ansi/constants (src)', () => {
  it('exports the canonical ANSI escape sequences', () => {
    expect(ANSI_RESET).toBe('\x1b[0m')
    expect(ANSI_BOLD).toBe('\x1b[1m')
    expect(ANSI_DIM).toBe('\x1b[2m')
    expect(ANSI_ITALIC).toBe('\x1b[3m')
    expect(ANSI_UNDERLINE).toBe('\x1b[4m')
    expect(ANSI_STRIKETHROUGH).toBe('\x1b[9m')
  })
})
