/**
 * @file Unit tests for asset-names.ts (Bazel).
 */

import { describe, expect, it } from 'vitest'

import {
  BAZEL_ASSET_MAP,
  getBazelAssetEntry,
} from '../../../../src/external-tools/bazel/asset-names'

describe('external-tools/bazel/asset-names', () => {
  it('covers all 8 socket targets', () => {
    expect(Object.keys(BAZEL_ASSET_MAP).toSorted()).toEqual(
      [
        'darwin-arm64',
        'darwin-x64',
        'linux-arm64',
        'linux-arm64-musl',
        'linux-x64',
        'linux-x64-musl',
        'win-arm64',
        'win-x64',
      ].toSorted(),
    )
  })

  it('flags musl and win-arm64 as non-native (compat-layer)', () => {
    expect(getBazelAssetEntry('linux-x64-musl')!.native).toBe(false)
    expect(getBazelAssetEntry('linux-arm64-musl')!.native).toBe(false)
    expect(getBazelAssetEntry('win-arm64')!.native).toBe(false)
  })

  it('flags the 5 supported targets as native', () => {
    expect(getBazelAssetEntry('darwin-arm64')!.native).toBe(true)
    expect(getBazelAssetEntry('darwin-x64')!.native).toBe(true)
    expect(getBazelAssetEntry('linux-x64')!.native).toBe(true)
    expect(getBazelAssetEntry('linux-arm64')!.native).toBe(true)
    expect(getBazelAssetEntry('win-x64')!.native).toBe(true)
  })

  it('returns undefined for unknown platform-archs', () => {
    expect(getBazelAssetEntry('freebsd-x64')).toBe(undefined)
  })

  it('annotates compat-layer entries with a note', () => {
    expect(getBazelAssetEntry('linux-x64-musl')!.note).toMatch(/gcompat/)
    expect(getBazelAssetEntry('win-arm64')!.note).toMatch(/Prism/)
  })
})
