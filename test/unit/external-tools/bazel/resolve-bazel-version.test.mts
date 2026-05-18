/**
 * @file Unit tests for resolveBazelVersion(). Tests the env-override and file
 *   branches in isolation. The upstream-GitHub fallback branch is only
 *   exercised in CI with a real `GH_TOKEN` available — covering it locally
 *   would require either network access or HTTP mocking, neither of which the
 *   other lib tests do for resolver branches. Uses `vi.stubEnv` for
 *   `USE_BAZEL_VERSION` mutation; per-test tmpdir for `.bazelversion` walk-up
 *   coverage. Tests run sequentially because env stubbing is process-scoped.
 */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { safeDelete } from '@socketsecurity/lib/fs/safe'
import { resolveBazelVersion } from '@socketsecurity/lib/external-tools/bazel/resolve-bazel-version'

export async function withTmpDir(
  fn: (dir: string) => Promise<void>,
): Promise<void> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bazel-resolve-'))
  try {
    await fn(tmpDir)
  } finally {
    await safeDelete(tmpDir)
  }
}

// Sequential because USE_BAZEL_VERSION is process-scoped under
// vitest's `isolate: false` config.
describe.sequential('external-tools/bazel/resolve-bazel-version', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns USE_BAZEL_VERSION when set', async () => {
    vi.stubEnv('USE_BAZEL_VERSION', '6.4.0')
    await withTmpDir(async tmpDir => {
      expect(await resolveBazelVersion({ cwd: tmpDir })).toBe('6.4.0')
    })
  })

  it('ignores empty USE_BAZEL_VERSION and falls through to .bazelversion', async () => {
    vi.stubEnv('USE_BAZEL_VERSION', '')
    await withTmpDir(async tmpDir => {
      await fs.writeFile(path.join(tmpDir, '.bazelversion'), '7.4.0\n')
      expect(await resolveBazelVersion({ cwd: tmpDir })).toBe('7.4.0')
    })
  })

  it('reads .bazelversion when no env override is set', async () => {
    vi.stubEnv('USE_BAZEL_VERSION', '')
    await withTmpDir(async tmpDir => {
      await fs.writeFile(path.join(tmpDir, '.bazelversion'), '7.4.0\n')
      expect(await resolveBazelVersion({ cwd: tmpDir })).toBe('7.4.0')
    })
  })

  it('walks up to find .bazelversion in a parent', async () => {
    vi.stubEnv('USE_BAZEL_VERSION', '')
    await withTmpDir(async tmpDir => {
      const child = path.join(tmpDir, 'a', 'b')
      await fs.mkdir(child, { recursive: true })
      await fs.writeFile(path.join(tmpDir, '.bazelversion'), '6.0.0\n')
      expect(await resolveBazelVersion({ cwd: child })).toBe('6.0.0')
    })
  })

  it('honors USE_BAZEL_VERSION even when .bazelversion exists (env wins)', async () => {
    vi.stubEnv('USE_BAZEL_VERSION', '8.0.0')
    await withTmpDir(async tmpDir => {
      await fs.writeFile(path.join(tmpDir, '.bazelversion'), '7.4.0\n')
      expect(await resolveBazelVersion({ cwd: tmpDir })).toBe('8.0.0')
    })
  })

  it('accepts a default cwd when options is omitted', async () => {
    vi.stubEnv('USE_BAZEL_VERSION', '6.4.0')
    expect(await resolveBazelVersion()).toBe('6.4.0')
  })
})
