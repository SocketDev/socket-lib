/**
 * @file Verify build child output routing and failure status preservation.
 */

import process from 'node:process'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildTypes,
  runNodeBuildScript,
} from '../../scripts/repo/build/steps.mts'
import { runSequence } from '../../scripts/fleet/util/run-command.mts'

const originalArgv = process.argv

vi.mock(import('../../scripts/fleet/util/run-command.mts'), () => ({
  runSequence: vi.fn(async () => 0),
}))
vi.mock(import('../../.config/rolldown.config.mts'), () => ({
  buildConfig: {},
}))
vi.mock(import('../../.config/repo/rolldown.prim.config.mts'), () => ({
  primBuildConfig: {},
}))

afterEach(() => {
  process.argv = originalArgv
  vi.restoreAllMocks()
  vi.mocked(runSequence).mockReset().mockResolvedValue(0)
})

describe('build step CLI output', () => {
  it.each([
    { args: [], stdio: 'inherit' },
    { args: ['--json'], stdio: ['inherit', 2, 'inherit'] },
  ])(
    'routes child output for $args while retaining verbosity and status',
    async ({ args, stdio }) => {
      process.argv = ['node', 'build.mts', ...args]
      vi.mocked(runSequence).mockResolvedValue(7)
      expect(
        await runNodeBuildScript('example-build.mts', 'Example build', {
          quiet: true,
          verbose: true,
        }),
      ).toBe(7)
      expect(runSequence).toHaveBeenCalledExactlyOnceWith([
        {
          command: 'node',
          args: ['example-build.mts', '--quiet', '--verbose'],
          options: { stdio },
        },
      ])
    },
  )

  it('routes declaration cleanup and compiler output away from JSON stdout', async () => {
    process.argv = ['node', 'build.mts', '--json']
    expect(await buildTypes({ quiet: true })).toBe(0)
    const commands = vi.mocked(runSequence).mock.calls[0]?.[0]
    expect(commands).toHaveLength(2)
    expect(commands).toEqual([
      expect.objectContaining({
        options: { stdio: ['inherit', 2, 'inherit'] },
      }),
      expect.objectContaining({
        options: { stdio: ['inherit', 2, 'inherit'] },
      }),
    ])
  })
})
