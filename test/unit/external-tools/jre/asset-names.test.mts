/**
 * @file Unit tests for the JVM Adoptium asset-names mapping.
 */

import { describe, expect, it } from 'vitest'

import {
  ADOPTIUM_QUERY_MAP,
  getAdoptiumQuery,
} from '../../../../src/external-tools/jre/asset-names'

describe('external-tools/jre/asset-names', () => {
  it('covers all 8 socket targets', () => {
    expect(Object.keys(ADOPTIUM_QUERY_MAP).sort()).toEqual(
      [
        'darwin-arm64',
        'darwin-x64',
        'linux-arm64',
        'linux-arm64-musl',
        'linux-x64',
        'linux-x64-musl',
        'win-arm64',
        'win-x64',
      ].sort(),
    )
  })

  it('maps musl targets to alpine-linux', () => {
    expect(getAdoptiumQuery('linux-x64-musl')!.os).toBe('alpine-linux')
    expect(getAdoptiumQuery('linux-arm64-musl')!.os).toBe('alpine-linux')
  })

  it('maps glibc linux targets to plain linux', () => {
    expect(getAdoptiumQuery('linux-x64')!.os).toBe('linux')
    expect(getAdoptiumQuery('linux-arm64')!.os).toBe('linux')
  })

  it('maps Windows targets to windows', () => {
    expect(getAdoptiumQuery('win-x64')!.os).toBe('windows')
    expect(getAdoptiumQuery('win-arm64')!.os).toBe('windows')
  })

  it('maps darwin to mac (Adoptium convention)', () => {
    expect(getAdoptiumQuery('darwin-arm64')!.os).toBe('mac')
    expect(getAdoptiumQuery('darwin-x64')!.os).toBe('mac')
  })

  it('uses aarch64 for ARM64 archs (Adoptium convention)', () => {
    expect(getAdoptiumQuery('darwin-arm64')!.architecture).toBe('aarch64')
    expect(getAdoptiumQuery('linux-arm64')!.architecture).toBe('aarch64')
    expect(getAdoptiumQuery('win-arm64')!.architecture).toBe('aarch64')
  })

  it('returns undefined for unknown platform-archs', () => {
    expect(getAdoptiumQuery('freebsd-x64')).toBe(undefined)
  })
})
