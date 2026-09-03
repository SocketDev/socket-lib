/**
 * @file Unit tests for src/fs/force — the escape hatch. Its whole contract is
 *   that location does not decide, so each spec deletes a target the
 *   location-checking `safeDelete` would refuse.
 */

import { existsSync, promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { forceDelete, forceDeleteSync } from '../../../src/fs/force.mjs'

import { runWithTempDir } from '../util/temp-file-helper.mjs'

describe('forceDelete', () => {
  it('removes a target without consulting location', async () => {
    await runWithTempDir(async tmpDir => {
      const target = path.join(tmpDir, 'file.txt')
      await fs.writeFile(target, '', 'utf8')

      // oxlint-disable-next-line socket/no-force-delete -- the subject
      await forceDelete(target)

      expect(existsSync(target)).toBe(false)
    }, 'forceDelete-')
  })

  it('does not throw for a path that is already gone', async () => {
    // oxlint-disable-next-line socket/no-force-delete -- the subject
    await expect(forceDelete('/nonexistent/file.txt')).resolves.toBeUndefined()
  })

  it('deletes every member of a list', async () => {
    await runWithTempDir(async tmpDir => {
      const first = path.join(tmpDir, 'first.txt')
      const second = path.join(tmpDir, 'second.txt')
      await fs.writeFile(first, '', 'utf8')
      await fs.writeFile(second, '', 'utf8')

      // oxlint-disable-next-line socket/no-force-delete -- the subject
      await forceDelete([first, second])

      expect(existsSync(first)).toBe(false)
      expect(existsSync(second)).toBe(false)
    }, 'forceDelete-list-')
  })

  it('forwards recursive, so a populated dir goes', async () => {
    await runWithTempDir(async tmpDir => {
      const nested = path.join(tmpDir, 'nested', 'deeper')
      await fs.mkdir(nested, { recursive: true })
      await fs.writeFile(path.join(nested, 'leaf.txt'), '', 'utf8')

      // oxlint-disable-next-line socket/no-force-delete -- the subject
      await forceDelete(path.join(tmpDir, 'nested'), { recursive: true })

      expect(existsSync(path.join(tmpDir, 'nested'))).toBe(false)
    }, 'forceDelete-recursive-')
  })

  it('forces even when the caller passes its own options', async () => {
    // `force` is hard-coded, never derived from the options bag, so a caller
    // spreading its own options cannot turn the escape hatch back off.
    await runWithTempDir(async tmpDir => {
      const target = path.join(tmpDir, 'file.txt')
      await fs.writeFile(target, '', 'utf8')

      // oxlint-disable-next-line socket/no-force-delete -- the subject
      await forceDelete(target, { maxRetries: 1 })

      expect(existsSync(target)).toBe(false)
    }, 'forceDelete-options-')
  })
})

describe('forceDeleteSync', () => {
  it('removes a target without consulting location', async () => {
    await runWithTempDir(async tmpDir => {
      const target = path.join(tmpDir, 'file.txt')
      await fs.writeFile(target, '', 'utf8')

      // oxlint-disable-next-line socket/no-force-delete -- the subject
      forceDeleteSync(target)

      expect(existsSync(target)).toBe(false)
    }, 'forceDeleteSync-')
  })

  it('does not throw for a path that is already gone', () => {
    expect(() =>
      // oxlint-disable-next-line socket/no-force-delete -- the subject
      forceDeleteSync('/nonexistent/file.txt'),
    ).not.toThrow()
  })
})
