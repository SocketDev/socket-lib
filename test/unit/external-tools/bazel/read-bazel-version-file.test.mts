/**
 * @file Unit tests for read-bazel-version-file.ts. Each test owns its own
 *   tmpdir (allocated inside the test, not via beforeEach) because vitest's
 *   `isolate: false` + concurrent runs make a shared `let tmpDir` variable race
 *   across tests in the same describe block.
 */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { safeDelete } from '@socketsecurity/lib/fs/safe'
import { readBazelVersionFile } from '../../../../src/external-tools/bazel/read-bazel-version-file'

export async function withTmpDir(
  fn: (dir: string) => Promise<void>,
): Promise<void> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bazel-version-'))
  try {
    await fn(tmpDir)
  } finally {
    await safeDelete(tmpDir)
  }
}

describe('external-tools/bazel/read-bazel-version-file', () => {
  it('reads a top-level .bazelversion', async () => {
    await withTmpDir(async tmpDir => {
      await fs.writeFile(path.join(tmpDir, '.bazelversion'), '7.4.0\n')
      expect(await readBazelVersionFile(tmpDir)).toBe('7.4.0')
    })
  })

  it('walks up to find a .bazelversion in a parent', async () => {
    await withTmpDir(async tmpDir => {
      const child = path.join(tmpDir, 'a', 'b', 'c')
      await fs.mkdir(child, { recursive: true })
      await fs.writeFile(path.join(tmpDir, '.bazelversion'), '6.4.0\n')
      expect(await readBazelVersionFile(child)).toBe('6.4.0')
    })
  })

  it('returns undefined when no .bazelversion exists in any ancestor', async () => {
    await withTmpDir(async tmpDir => {
      expect(await readBazelVersionFile(tmpDir)).toBe(undefined)
    })
  })

  it('strips trailing whitespace from the version', async () => {
    await withTmpDir(async tmpDir => {
      await fs.writeFile(path.join(tmpDir, '.bazelversion'), '  7.4.0  \n')
      expect(await readBazelVersionFile(tmpDir)).toBe('7.4.0')
    })
  })

  it('strips trailing # comments from .bazelversion', async () => {
    await withTmpDir(async tmpDir => {
      await fs.writeFile(
        path.join(tmpDir, '.bazelversion'),
        '7.4.0 # pinned for reproducibility\n',
      )
      expect(await readBazelVersionFile(tmpDir)).toBe('7.4.0')
    })
  })

  it('returns undefined for an empty file', async () => {
    await withTmpDir(async tmpDir => {
      await fs.writeFile(path.join(tmpDir, '.bazelversion'), '\n')
      expect(await readBazelVersionFile(tmpDir)).toBe(undefined)
    })
  })

  it('honors special tags like "latest" verbatim', async () => {
    await withTmpDir(async tmpDir => {
      await fs.writeFile(path.join(tmpDir, '.bazelversion'), 'latest\n')
      expect(await readBazelVersionFile(tmpDir)).toBe('latest')
    })
  })
})
