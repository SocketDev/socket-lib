import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'
import { safeDelete as deleteFixtureDirectory } from '@socketsecurity/lib-stable/fs/safe'

import { probeDeleteGuard } from '../../../scripts/repo/check/force-delete-is-opt-in.mts'
import { runWithTempDir } from '../util/temp-files.mjs'

describe('probeDeleteGuard', () => {
  it('keeps the refusal probe unconfigured and scopes cleanup to its own directory', async () => {
    await runWithTempDir(async root => {
      const cwd = path.join(root, 'project')
      await fs.mkdir(cwd)
      const safeDelete = vi.fn(
        async (
          target: string,
          options?: { allowedDirs?: readonly string[] | undefined } | undefined,
        ) => {
          if (
            path.dirname(target) !== cwd &&
            !options?.allowedDirs?.includes(target)
          ) {
            throw new Error('Outside the permitted directory')
          }
          await deleteFixtureDirectory(target)
        },
      )
      expect(
        await probeDeleteGuard({ cwd, root, safe: { safeDelete } }),
      ).toEqual([])
      const outside = path.join(root, `outside-${process.pid}`)
      expect(safeDelete).toHaveBeenNthCalledWith(1, outside)
      expect(safeDelete).toHaveBeenNthCalledWith(2, outside, {
        allowedDirs: [outside],
      })
      expect(await fs.readdir(cwd)).toEqual([])
      expect(await fs.readdir(root)).toEqual(['project'])
    }, 'delete-guard-probe-')
  })
})
