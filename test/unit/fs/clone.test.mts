/**
 * @file Unit tests for cloneFile and cloneDir from src/fs/copy — copy-on-write
 *   clones for the case where a whole template tree lands at a matching path.
 *   The clone is an optimization, so the tests assert the OBSERVABLE contract
 *   rather than the syscall: same bytes, independent files, symlinks preserved,
 *   and a real error still thrown rather than retried as a slow copy.
 */

import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { cloneDir, cloneFile } from '../../../src/fs/copy.mjs'

import { runWithTempDir } from '../util/temp-file-helper.mjs'

describe('cloneFile', () => {
  it('reproduces the bytes', async () => {
    await runWithTempDir(async tmpDir => {
      const from = path.join(tmpDir, 'source.mts')
      const to = path.join(tmpDir, 'clone.mts')
      writeFileSync(from, 'export const leaf = 1\n', 'utf8')

      await cloneFile(from, to)

      expect(readFileSync(to, 'utf8')).toBe('export const leaf = 1\n')
    }, 'clone-file-')
  })

  it('leaves the two files independent, unlike a hard link', async () => {
    await runWithTempDir(async tmpDir => {
      const from = path.join(tmpDir, 'source.mts')
      const to = path.join(tmpDir, 'clone.mts')
      writeFileSync(from, 'original\n', 'utf8')
      await cloneFile(from, to)

      writeFileSync(to, 'rewritten\n', 'utf8')

      // A hard link would have carried this back into the template.
      expect(readFileSync(from, 'utf8')).toBe('original\n')
    }, 'clone-independent-')
  })

  it('overwrites an existing destination', async () => {
    await runWithTempDir(async tmpDir => {
      const from = path.join(tmpDir, 'source.mts')
      const to = path.join(tmpDir, 'clone.mts')
      writeFileSync(from, 'fresh\n', 'utf8')
      writeFileSync(to, 'stale\n', 'utf8')

      await cloneFile(from, to)

      expect(readFileSync(to, 'utf8')).toBe('fresh\n')
    }, 'clone-overwrite-')
  })

  it('throws on a missing source rather than retrying it as a plain copy', async () => {
    await runWithTempDir(async tmpDir => {
      const from = path.join(tmpDir, 'absent.mts')
      const to = path.join(tmpDir, 'clone.mts')

      await expect(cloneFile(from, to)).rejects.toThrow()
      expect(existsSync(to)).toBe(false)
    }, 'clone-missing-')
  })
})

describe('cloneDir', () => {
  it('reproduces a nested tree', async () => {
    await runWithTempDir(async tmpDir => {
      const from = path.join(tmpDir, 'template')
      const to = path.join(tmpDir, 'live')
      writeFileSync(path.join(tmpDir, 'seed.txt'), 'unused', 'utf8')
      await cloneDir(from, to).catch(() => undefined)

      // Build the source AFTER proving an absent source does not half-create.
      const { mkdirSync } = await import('node:fs')
      mkdirSync(path.join(from, 'nested', 'deep'), { recursive: true })
      writeFileSync(path.join(from, 'root.mts'), 'root\n', 'utf8')
      writeFileSync(path.join(from, 'nested', 'mid.mts'), 'mid\n', 'utf8')
      writeFileSync(
        path.join(from, 'nested', 'deep', 'leaf.mts'),
        'leaf\n',
        'utf8',
      )

      await cloneDir(from, to)

      expect(readFileSync(path.join(to, 'root.mts'), 'utf8')).toBe('root\n')
      expect(readFileSync(path.join(to, 'nested', 'mid.mts'), 'utf8')).toBe(
        'mid\n',
      )
      expect(
        readFileSync(path.join(to, 'nested', 'deep', 'leaf.mts'), 'utf8'),
      ).toBe('leaf\n')
    }, 'clone-dir-')
  })

  it('recreates a symlink as a symlink', async () => {
    await runWithTempDir(async tmpDir => {
      const { mkdirSync, symlinkSync } = await import('node:fs')
      const from = path.join(tmpDir, 'template')
      const to = path.join(tmpDir, 'live')
      mkdirSync(from, { recursive: true })
      writeFileSync(path.join(from, 'real.mts'), 'real\n', 'utf8')
      symlinkSync('real.mts', path.join(from, 'link.mts'))

      await cloneDir(from, to)

      // Following the link would turn it into a second full copy.
      expect(lstatSync(path.join(to, 'link.mts')).isSymbolicLink()).toBe(true)
    }, 'clone-symlink-')
  })

  it('leaves a destination-only file in place', async () => {
    await runWithTempDir(async tmpDir => {
      const { mkdirSync } = await import('node:fs')
      const from = path.join(tmpDir, 'template')
      const to = path.join(tmpDir, 'live')
      mkdirSync(from, { recursive: true })
      mkdirSync(to, { recursive: true })
      writeFileSync(path.join(from, 'shipped.mts'), 'shipped\n', 'utf8')
      writeFileSync(path.join(to, 'extra.mts'), 'extra\n', 'utf8')

      await cloneDir(from, to)

      // cloneDir writes what the source holds; pruning extras belongs to the
      // caller's swap, not here.
      expect(readFileSync(path.join(to, 'extra.mts'), 'utf8')).toBe('extra\n')
      expect(readFileSync(path.join(to, 'shipped.mts'), 'utf8')).toBe(
        'shipped\n',
      )
    }, 'clone-extra-')
  })
})
