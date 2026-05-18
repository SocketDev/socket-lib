/**
 * @file Unit tests for resolve-asset-url.ts.
 */

import { describe, expect, it } from 'vitest'

import { resolveBazelAssetUrl } from '@socketsecurity/lib/external-tools/bazel/resolve-asset-url'

describe('external-tools/bazel/resolve-asset-url', () => {
  it('builds a darwin-arm64 URL', () => {
    expect(resolveBazelAssetUrl('7.4.0', 'darwin-arm64')).toEqual({
      url: 'https://github.com/bazelbuild/bazel/releases/download/7.4.0/bazel-7.4.0-darwin-arm64',
      filename: 'bazel-7.4.0-darwin-arm64',
      native: true,
    })
  })

  it('uses the windows-x86_64.exe suffix for win-x64', () => {
    const result = resolveBazelAssetUrl('7.4.0', 'win-x64')!
    expect(result.filename).toBe('bazel-7.4.0-windows-x86_64.exe')
  })

  it('returns the glibc binary for linux-x64-musl (with native=false)', () => {
    const result = resolveBazelAssetUrl('7.4.0', 'linux-x64-musl')!
    expect(result.filename).toBe('bazel-7.4.0-linux-x86_64')
    expect(result.native).toBe(false)
  })

  it('returns undefined for unknown platform-archs', () => {
    expect(resolveBazelAssetUrl('7.4.0', 'freebsd-x64')).toBe(undefined)
  })
})
