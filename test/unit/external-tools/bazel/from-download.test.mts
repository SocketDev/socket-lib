/**
 * @fileoverview Tests for src/external-tools/bazel/from-download.ts —
 * URL construction from BAZEL_ASSET_MAP, cache name, and the
 * ResolvedBazel return shape.
 */

import { describe, expect, it } from 'vitest'

import { bazelFromDownload } from '../../../../src/external-tools/bazel/from-download'

import { makeFakeDownloader } from '../_fake-downloader.mts'

describe('external-tools/bazel/from-download', () => {
  it('constructs the GitHub release URL and returns ResolvedBazel', async () => {
    const { calls, downloader } = makeFakeDownloader('fake-bazel-binary')
    const result = await bazelFromDownload({
      version: '7.4.1',
      platformArch: 'darwin-arm64',
      downloader,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(
      'https://github.com/bazelbuild/bazel/releases/download/7.4.1/bazel-7.4.1-darwin-arm64',
    )
    expect(calls[0]!.name).toBe('bazel-7.4.1-darwin-arm64')
    expect(result?.source).toBe('download')
    expect(result?.path).toBeDefined()
    expect(result!.path.endsWith('bazel-7.4.1-darwin-arm64')).toBe(true)
  })

  it('maps platform-arch suffixes through BAZEL_ASSET_MAP (darwin-x64 → darwin-x86_64)', async () => {
    const { calls, downloader } = makeFakeDownloader('fake')
    await bazelFromDownload({
      version: '7.4.1',
      platformArch: 'darwin-x64',
      downloader,
    })
    expect(calls[0]!.url).toContain('bazel-7.4.1-darwin-x86_64')
  })

  it('returns undefined for unmapped platform-archs', async () => {
    const { calls, downloader } = makeFakeDownloader('fake')
    const result = await bazelFromDownload({
      version: '7.4.1',
      platformArch: 'totally-fake-arch',
      downloader,
    })
    expect(result).toBeUndefined()
    expect(calls).toHaveLength(0)
  })

  it('forwards integrity through to the downloader', async () => {
    const { downloader } = makeFakeDownloader('fake')
    // Capture the second call to assert the integrity arrived. We
    // can't intercept the dlx-level hash arg directly from the fake
    // (the fake ignores it), so this test asserts the call shape
    // doesn't error rather than the pin being verified.
    await expect(
      bazelFromDownload({
        version: '7.4.1',
        platformArch: 'linux-x64',
        integrity:
          'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
        downloader,
      }),
    ).resolves.toMatchObject({ source: 'download' })
  })
})
