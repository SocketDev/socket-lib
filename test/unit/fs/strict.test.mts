/**
 * @file Unit tests for src/fs/strict — the refuse-first delete. The refusals
 *   run before any I/O, so most of these consult the verdict function directly
 *   and only the throwing paths touch a tmpdir.
 */

import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  deleteRefusalReason,
  strictDelete,
  strictDeleteSync,
} from '../../../src/fs/strict.mjs'

import { runWithTempDir } from '../util/temp-file-helper.mjs'

describe('deleteRefusalReason', () => {
  it('refuses an empty or dot-only target', () => {
    expect(deleteRefusalReason('')).toMatch(/empty/)
    expect(deleteRefusalReason('   ')).toMatch(/empty/)
    expect(deleteRefusalReason('.')).toMatch(/empty/)
    expect(deleteRefusalReason('./')).toMatch(/empty/)
  })

  it('refuses a filesystem root', () => {
    const { root } = path.parse(path.resolve(os.tmpdir()))
    expect(deleteRefusalReason(root)).toMatch(/filesystem root/)
  })

  it('refuses the base itself, which is what an empty join produces', () => {
    const base = path.join(os.tmpdir(), 'refusal-base')
    expect(deleteRefusalReason(path.join(base, ''), base)).toMatch(
      /IS the base/,
    )
  })

  it('refuses a target outside the base', () => {
    const base = path.join(os.tmpdir(), 'refusal-base')
    expect(deleteRefusalReason(path.join(base, '..', 'escaped'), base)).toMatch(
      /outside the base/,
    )
  })

  it('allows a target strictly below the base', () => {
    const base = path.join(os.tmpdir(), 'refusal-base')
    expect(deleteRefusalReason(path.join(base, 'child'), base)).toBe(undefined)
  })

  it('allows any non-root target when no base is named', () => {
    expect(deleteRefusalReason(path.join(os.tmpdir(), 'anything'))).toBe(
      undefined,
    )
  })
})

describe('strictDelete', () => {
  it('deletes a target strictly below its base', async () => {
    await runWithTempDir(async tmpDir => {
      const child = path.join(tmpDir, 'child')
      await fs.mkdir(child, { recursive: true })
      await strictDelete(child, { base: tmpDir })
      expect(existsSync(child)).toBe(false)
    }, 'strictDelete-child-')
  })

  it('throws rather than deleting its own base', async () => {
    await runWithTempDir(async tmpDir => {
      await expect(
        strictDelete(path.join(tmpDir, ''), { base: tmpDir }),
      ).rejects.toThrow(/IS the base/)
      expect(existsSync(tmpDir)).toBe(true)
    }, 'strictDelete-base-')
  })

  it('throws on a filesystem root with no base named', async () => {
    const { root } = path.parse(path.resolve(os.tmpdir()))
    await expect(strictDelete(root)).rejects.toThrow(/filesystem root/)
  })
})

describe('strictDeleteSync', () => {
  it('deletes a target strictly below its base', async () => {
    await runWithTempDir(async tmpDir => {
      const child = path.join(tmpDir, 'child')
      await fs.mkdir(child, { recursive: true })
      strictDeleteSync(child, { base: tmpDir })
      expect(existsSync(child)).toBe(false)
    }, 'strictDeleteSync-child-')
  })

  it('throws rather than deleting its own base', async () => {
    await runWithTempDir(async tmpDir => {
      expect(() =>
        strictDeleteSync(path.join(tmpDir, ''), { base: tmpDir }),
      ).toThrow(/IS the base/)
      expect(existsSync(tmpDir)).toBe(true)
    }, 'strictDeleteSync-base-')
  })

  it('throws on a filesystem root with no base named', () => {
    const { root } = path.parse(path.resolve(os.tmpdir()))
    expect(() => strictDeleteSync(root)).toThrow(/filesystem root/)
  })
})
