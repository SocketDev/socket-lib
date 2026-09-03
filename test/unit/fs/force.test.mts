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
