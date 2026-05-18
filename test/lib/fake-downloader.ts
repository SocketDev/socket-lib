/**
 * @file Shared test helper — builds a fake `BinaryDownloader` that writes a
 *   caller-supplied payload to the binaryPath dlx would produce, then returns
 *   the dlx-shape `{binaryPath, downloaded, integrity}` result. Lets tests
 *   exercise the from-download chain end-to-end without hitting the network.
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { BinaryDownloader } from '../../src/external-tools/from-download'

const FAKE_INTEGRITY =
  'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=='

/**
 * Build a fake-downloader factory that writes the given payload to a fresh
 * scratch dir per call.
 */
export function makeFakeDownloader(payload: Buffer | string): {
  downloader: BinaryDownloader
  calls: Array<{ url: string; name: string }>
  scratchDir: string
} {
  const calls: Array<{ url: string; name: string }> = []
  const scratchDir = mkdtempSync(path.join(os.tmpdir(), 'from-download-test-'))
  const downloader = (async (opts: Parameters<BinaryDownloader>[0]) => {
    // `name` is optional on DlxBinaryOptions; default for tests that
    // omit it (matches dlx's own fallback to a platform-arch synth).
    const name = opts.name ?? 'fake-binary'
    calls.push({ url: opts.url, name })
    const binaryPath = path.join(scratchDir, name)
    writeFileSync(binaryPath, payload)
    return {
      binaryPath,
      downloaded: true,
      integrity: FAKE_INTEGRITY,
    }
  }) as BinaryDownloader
  return { downloader, calls, scratchDir }
}

export const FAKE_INTEGRITY_VALUE = FAKE_INTEGRITY
