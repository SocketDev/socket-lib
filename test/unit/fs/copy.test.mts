/**
 * @file Unit tests for src/fs/copy — recursive file/dir copy with overlay,
 *   pave (atomic mirror), and fill (no-clobber) modes.
 */

import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { CopyMode, copy } from '../../../src/fs/copy'

import { runWithTempDir } from '../util/temp-file-helper'

describe('copy', () => {
  it('copies a single file', async () => {
    await runWithTempDir(async tmpDir => {
      const from = path.join(tmpDir, 'a.txt')
      const to = path.join(tmpDir, 'b.txt')
      await fs.writeFile(from, 'hello', 'utf8')

      await copy(from, to)

      expect(await fs.readFile(to, 'utf8')).toBe('hello')
    }, 'copy-file-')
  })

  it('copies a directory tree recursively', async () => {
    await runWithTempDir(async tmpDir => {
      const src = path.join(tmpDir, 'src')
      const dest = path.join(tmpDir, 'dest')
      await fs.mkdir(path.join(src, 'sub'), { recursive: true })
      await fs.writeFile(path.join(src, 'sub', 'f.txt'), 'x', 'utf8')

      await copy(src, dest)

      expect(await fs.readFile(path.join(dest, 'sub', 'f.txt'), 'utf8')).toBe(
        'x',
      )
    }, 'copy-dir-')
  })

  it('overlay (default) leaves destination-only files in place', async () => {
    await runWithTempDir(async tmpDir => {
      const src = path.join(tmpDir, 'src')
      const dest = path.join(tmpDir, 'dest')
      await fs.mkdir(src, { recursive: true })
      await fs.mkdir(dest, { recursive: true })
      await fs.writeFile(path.join(src, 'new.txt'), 'n', 'utf8')
      await fs.writeFile(path.join(dest, 'stale.txt'), 's', 'utf8')

      await copy(src, dest)

      expect(existsSync(path.join(dest, 'new.txt'))).toBe(true)
      expect(existsSync(path.join(dest, 'stale.txt'))).toBe(true)
    }, 'copy-overlay-')
  })

  it('overlay overwrites a colliding file', async () => {
    await runWithTempDir(async tmpDir => {
      const src = path.join(tmpDir, 'src')
      const dest = path.join(tmpDir, 'dest')
      await fs.mkdir(src, { recursive: true })
      await fs.mkdir(dest, { recursive: true })
      await fs.writeFile(path.join(src, 'f.txt'), 'from-src', 'utf8')
      await fs.writeFile(path.join(dest, 'f.txt'), 'old', 'utf8')

      await copy(src, dest, { mode: CopyMode.Overlay })

      expect(await fs.readFile(path.join(dest, 'f.txt'), 'utf8')).toBe(
        'from-src',
      )
    }, 'copy-overlay-clobber-')
  })

  it('pave mirrors the source, dropping destination-only files', async () => {
    await runWithTempDir(async tmpDir => {
      const src = path.join(tmpDir, 'src')
      const dest = path.join(tmpDir, 'dest')
      await fs.mkdir(src, { recursive: true })
      await fs.mkdir(dest, { recursive: true })
      await fs.writeFile(path.join(src, 'new.txt'), 'n', 'utf8')
      await fs.writeFile(path.join(dest, 'stale.txt'), 's', 'utf8')

      await copy(src, dest, { mode: CopyMode.Pave })

      expect(existsSync(path.join(dest, 'new.txt'))).toBe(true)
      expect(existsSync(path.join(dest, 'stale.txt'))).toBe(false)
    }, 'copy-pave-')
  })

  it('pave creates the destination (and parents) when absent', async () => {
    await runWithTempDir(async tmpDir => {
      const src = path.join(tmpDir, 'src')
      const dest = path.join(tmpDir, 'nested', 'dest')
      await fs.mkdir(src, { recursive: true })
      await fs.writeFile(path.join(src, 'f.txt'), 'x', 'utf8')

      await copy(src, dest, { mode: CopyMode.Pave })

      expect(await fs.readFile(path.join(dest, 'f.txt'), 'utf8')).toBe('x')
    }, 'copy-pave-new-')
  })

  it('fill adds missing files without overwriting existing ones', async () => {
    await runWithTempDir(async tmpDir => {
      const src = path.join(tmpDir, 'src')
      const dest = path.join(tmpDir, 'dest')
      await fs.mkdir(src, { recursive: true })
      await fs.mkdir(dest, { recursive: true })
      await fs.writeFile(path.join(src, 'shared.txt'), 'from-src', 'utf8')
      await fs.writeFile(path.join(src, 'added.txt'), 'new', 'utf8')
      await fs.writeFile(path.join(dest, 'shared.txt'), 'KEEP', 'utf8')

      await copy(src, dest, { mode: CopyMode.Fill })

      // Existing file kept untouched; missing file added.
      expect(await fs.readFile(path.join(dest, 'shared.txt'), 'utf8')).toBe(
        'KEEP',
      )
      expect(await fs.readFile(path.join(dest, 'added.txt'), 'utf8')).toBe(
        'new',
      )
    }, 'copy-fill-')
  })

  it('filter skips matching entries', async () => {
    await runWithTempDir(async tmpDir => {
      const src = path.join(tmpDir, 'src')
      const dest = path.join(tmpDir, 'dest')
      await fs.mkdir(src, { recursive: true })
      await fs.writeFile(path.join(src, 'keep.txt'), 'k', 'utf8')
      await fs.writeFile(path.join(src, 'skip.txt'), 's', 'utf8')

      await copy(src, dest, {
        filter: srcPath => !srcPath.endsWith('skip.txt'),
      })

      expect(existsSync(path.join(dest, 'keep.txt'))).toBe(true)
      expect(existsSync(path.join(dest, 'skip.txt'))).toBe(false)
    }, 'copy-filter-')
  })
})
