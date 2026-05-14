/**
 * @fileoverview Unit tests for detect-pnpm-version.ts.
 */

import { describe, expect, it } from 'vitest'

import { detectPnpmVersion } from '@socketsecurity/lib/eco/npm/pnpm/detect-pnpm-version'

describe('eco/npm/pnpm/detect-pnpm-version', () => {
  it('detects v5', () => {
    expect(detectPnpmVersion('lockfileVersion: 5.4\n')).toBe(5)
  })

  it('detects v6', () => {
    expect(detectPnpmVersion("lockfileVersion: '6.0'\n")).toBe(6)
  })

  it('detects v9', () => {
    expect(detectPnpmVersion("lockfileVersion: '9.0'\n")).toBe(9)
  })

  it('defaults to v9 when no marker present', () => {
    expect(detectPnpmVersion('# no lockfileVersion\n')).toBe(9)
  })

  it('defaults to v9 on unknown major', () => {
    expect(detectPnpmVersion('lockfileVersion: 7.0\n')).toBe(9)
  })
})
