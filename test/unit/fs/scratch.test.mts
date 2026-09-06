/**
 * @file Unit tests for src/fs/scratch — the guarded scratch-directory fixture.
 *   The guard exists because a teardown that recurses over a path constant
 *   whose redirect failed will delete the live checkout. `path.isAbsolute`
 *   does not catch that case: a live checkout is absolute too.
 */

import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { describe, expect, it } from 'vitest'

import {
  deleteScratchTree,
  isScratchPath,
  makeScratchDir,
} from '../../../src/fs/scratch.mjs'

describe('isScratchPath', () => {
  it('accepts a path inside the OS temp dir', () => {
    const scratch = mkdtempSync(path.join(os.tmpdir(), 'lib-scratch-'))
    expect(isScratchPath(scratch)).toBe(true)
    expect(isScratchPath(path.join(scratch, 'nested', 'deeper'))).toBe(true)
  })

  it('refuses the temp dir itself', () => {
    expect(isScratchPath(os.tmpdir())).toBe(false)
  })

  it('refuses an absolute path outside the temp dir', () => {
    // The exact shape that destroys checkouts: absolute, so an isAbsolute
    // guard waves it through.
    expect(isScratchPath('/Users/<user>/projects')).toBe(false)
    expect(isScratchPath(process.cwd())).toBe(false)
  })

  it('refuses a relative path or an empty string', () => {
    expect(isScratchPath('')).toBe(false)
    expect(isScratchPath('fixtures')).toBe(false)
    expect(isScratchPath('./scratch')).toBe(false)
  })

  it('refuses a sibling that merely shares the temp dir prefix', () => {
    expect(isScratchPath(`${path.resolve(os.tmpdir())}-not-temp`)).toBe(false)
  })
})

describe('deleteScratchTree', () => {
  it('deletes a scratch tree', async () => {
    const scratch = mkdtempSync(path.join(os.tmpdir(), 'lib-scratch-'))
    await deleteScratchTree(scratch)
    expect(existsSync(scratch)).toBe(false)
  })

  it('throws rather than deleting a non-scratch path', async () => {
    await expect(deleteScratchTree(process.cwd())).rejects.toThrow(
      /Refusing to delete a non-scratch path/,
    )
    // The refusal must not have touched it.
    expect(existsSync(process.cwd())).toBe(true)
  })

  it('throws on an empty path', async () => {
    await expect(deleteScratchTree('')).rejects.toThrow(/Refusing to delete/)
  })
})

describe('makeScratchDir', () => {
  it('creates a tree inside the OS temp dir, prefixed by its owner', async () => {
    const scratch = makeScratchDir('lib-fixture')
    try {
      expect(isScratchPath(scratch.dir)).toBe(true)
      expect(path.basename(scratch.dir)).toMatch(/^lib-fixture-/)
    } finally {
      await scratch.cleanup()
    }
  })

  it('write creates parent directories and returns the path', async () => {
    const scratch = makeScratchDir('lib-fixture')
    try {
      const written = scratch.write('nested/deeper/example.json', '{}\n')
      expect(written).toBe(scratch.join('nested', 'deeper', 'example.json'))
      expect(readFileSync(written, 'utf8')).toBe('{}\n')
    } finally {
      await scratch.cleanup()
    }
  })

  it('join stays inside the tree', async () => {
    const scratch = makeScratchDir('lib-fixture')
    try {
      expect(isScratchPath(scratch.join('a', 'b'))).toBe(true)
    } finally {
      await scratch.cleanup()
    }
  })

  it('cleanup removes the tree', async () => {
    const scratch = makeScratchDir('lib-fixture')
    scratch.write('example.txt', 'contents\n')
    await scratch.cleanup()
    expect(existsSync(scratch.dir)).toBe(false)
  })

  it('cleanup is idempotent', async () => {
    const scratch = makeScratchDir('lib-fixture')
    await scratch.cleanup()
    // A second call must not throw, so a `finally` cleanup is safe after an
    // explicit one.
    await expect(scratch.cleanup()).resolves.toBeUndefined()
  })
})
