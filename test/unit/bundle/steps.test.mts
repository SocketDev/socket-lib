/**
 * @file Unit tests for the bundle build steps. The contract these pin: a step
 *   forwards only the verbosity flags its child script accepts, a failing step
 *   names itself in one error line unless quiet, and a passing step says
 *   nothing. buildTypes deliberately has no verbose option, because neither
 *   clean.mts nor tsgo accepts a verbosity flag.
 */

import { describe, expect, it, vi } from 'vitest'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import {
  buildExternals,
  runNodeBuildScript,
  runPostBuild,
  verbosityFlags,
} from '../../../scripts/repo/bundle/steps.mts'

import type { CommandSpec } from '../../../scripts/fleet/util/run-command.mts'

const runCommand = vi.hoisted(() => ({
  calls: [] as Array<{ args: string[]; command: string }>,
  exitCode: 0,
}))

vi.mock(import('../../../scripts/fleet/util/run-command.mts'), () => ({
  runSequence: async (commands: CommandSpec[]) => {
    for (const { args = [], command } of commands) {
      runCommand.calls.push({ args, command })
    }
    return runCommand.exitCode
  },
}))

// steps.mts takes the default logger at module scope, so spying on that one
// instance is enough; mocking the module would mean satisfying all of Logger.
const logger = getDefaultLogger()
const logged: string[] = []
vi.spyOn(logger, 'error').mockImplementation((...args: unknown[]) => {
  logged.push(String(args[0]))
  return logger
})

function reset(exitCode: number): void {
  runCommand.calls.length = 0
  runCommand.exitCode = exitCode
  logged.length = 0
}

describe('verbosityFlags', () => {
  it('passes nothing when neither flag is set', () => {
    expect(verbosityFlags({})).toEqual([])
  })

  it('passes each flag that is set', () => {
    expect(verbosityFlags({ quiet: true })).toEqual(['--quiet'])
    expect(verbosityFlags({ verbose: true })).toEqual(['--verbose'])
  })

  it('passes both when both are set, quiet first', () => {
    expect(verbosityFlags({ quiet: true, verbose: true })).toEqual([
      '--quiet',
      '--verbose',
    ])
  })

  it('treats an explicit false as unset', () => {
    expect(verbosityFlags({ quiet: false, verbose: false })).toEqual([])
  })
})

describe('runNodeBuildScript', () => {
  it('runs the script under node with its verbosity flags', async () => {
    reset(0)
    const exitCode = await runNodeBuildScript('a/script.mts', 'Thing build', {
      verbose: true,
    })
    expect(exitCode).toBe(0)
    expect(runCommand.calls).toEqual([
      { args: ['a/script.mts', '--verbose'], command: 'node' },
    ])
  })

  it('says nothing when the script succeeds', async () => {
    reset(0)
    await runNodeBuildScript('a/script.mts', 'Thing build')
    expect(logged).toEqual([])
  })

  it('names the step once when the script fails', async () => {
    reset(2)
    const exitCode = await runNodeBuildScript('a/script.mts', 'Thing build')
    expect(exitCode).toBe(2)
    expect(logged).toEqual(['Thing build failed'])
  })

  it('stays silent on failure when quiet', async () => {
    reset(2)
    await runNodeBuildScript('a/script.mts', 'Thing build', { quiet: true })
    expect(logged).toEqual([])
  })
})

describe('the steps that share runNodeBuildScript', () => {
  it('buildExternals runs the externals script and keeps its failure label', async () => {
    reset(1)
    await buildExternals({ quiet: false })
    expect(runCommand.calls[0]).toEqual({
      args: ['scripts/repo/bundle/externals.mts'],
      command: 'node',
    })
    expect(logged).toEqual(['External dependencies build failed'])
  })

  it('runPostBuild runs the post-build script and keeps its failure label', async () => {
    reset(1)
    await runPostBuild({ verbose: true })
    expect(runCommand.calls[0]).toEqual({
      args: ['scripts/repo/post-build.mts', '--verbose'],
      command: 'node',
    })
    expect(logged).toEqual(['Post-build failed'])
  })
})
