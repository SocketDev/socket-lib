/** @fileoverview Utility for running shell commands with proper error handling. */

import type {
  SpawnOptions,
  SpawnSyncOptions,
} from '@socketsecurity/lib-stable/spawn'

import process from 'node:process'
import { getDefaultLogger } from '@socketsecurity/lib-stable/logger'
import { spawn, spawnSync } from '@socketsecurity/lib-stable/spawn'

interface CommandEntry {
  command: string
  args?: string[]
  options?: SpawnOptions
}

const logger = getDefaultLogger()

/**
 * Run a command and return a promise that resolves with the exit code.
 * @param {string} command - The command to run
 * @param {string[]} args - Arguments to pass to the command
 * @param {object} options - Spawn options
 * @returns {Promise<number>} Exit code
 */
export async function runCommand(
  command: string,
  args: string[] = [],
  options: SpawnOptions = {},
): Promise<number> {
  try {
    const result = await spawn(command, args, {
      stdio: 'inherit',
      ...(process.platform === 'win32' && { shell: true }),
      ...options,
    })
    return result.code
  } catch (error) {
    // spawn() from @socketsecurity/lib throws on non-zero exit
    // Return the exit code from the error
    if (error && typeof error === 'object' && 'code' in error) {
      return (error as { code: number }).code
    }
    throw error
  }
}

/**
 * Run a command synchronously.
 * @param {string} command - The command to run
 * @param {string[]} args - Arguments to pass to the command
 * @param {object} options - Spawn options
 * @returns {number} Exit code
 */
export function runCommandSync(
  command: string,
  args: string[] = [],
  options: SpawnSyncOptions = {},
): number {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...(process.platform === 'win32' && { shell: true }),
    ...options,
  })

  return result.status || 0
}

/**
 * Run a pnpm script.
 * @param {string} scriptName - The pnpm script to run
 * @param {string[]} extraArgs - Additional arguments
 * @param {object} options - Spawn options
 * @returns {Promise<number>} Exit code
 */
export async function runPnpmScript(
  scriptName: string,
  extraArgs: string[] = [],
  options: SpawnOptions = {},
): Promise<number> {
  return runCommand('pnpm', ['run', scriptName, ...extraArgs], options)
}

/**
 * Run multiple commands in sequence, stopping on first failure.
 * @param {Array<{command: string, args?: string[], options?: object}>} commands
 * @returns {Promise<number>} Exit code of first failing command, or 0 if all succeed
 */
export async function runSequence(commands: CommandEntry[]): Promise<number> {
  for (const { args = [], command, options = {} } of commands) {
    const exitCode = await runCommand(command, args, options)
    if (exitCode !== 0) {
      return exitCode
    }
  }
  return 0
}

/**
 * Run multiple commands in parallel.
 * @param {Array<{command: string, args?: string[], options?: object}>} commands
 * @returns {Promise<number[]>} Array of exit codes
 */
export async function runParallel(commands: CommandEntry[]): Promise<number[]> {
  const promises = commands.map(({ args = [], command, options = {} }) =>
    runCommand(command, args, options),
  )
  const results = await Promise.allSettled(promises)
  return results.map(r => (r.status === 'fulfilled' ? r.value : 1))
}

/**
 * Run a command and suppress output.
 * @param {string} command - The command to run
 * @param {string[]} args - Arguments to pass to the command
 * @param {object} options - Spawn options
 * @returns {Promise<{exitCode: number, stdout: string, stderr: string}>}
 */
export async function runCommandQuiet(
  command: string,
  args: string[] = [],
  options: SpawnOptions = {},
): Promise<{
  exitCode: number
  stdout: string | Buffer
  stderr: string | Buffer
}> {
  try {
    const result = await spawn(command, args, {
      ...options,
      ...(process.platform === 'win32' && { shell: true }),
      stdio: 'pipe',
      stdioString: true,
    })

    return {
      exitCode: result.code,
      stderr: result.stderr,
      stdout: result.stdout,
    }
  } catch (error) {
    // spawn() from @socketsecurity/lib throws on non-zero exit
    // Return the exit code and output from the error
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      'stdout' in error &&
      'stderr' in error
    ) {
      const spawnErr = error as {
        code: number
        stdout: string | Buffer
        stderr: string | Buffer
      }
      return {
        exitCode: spawnErr.code,
        stderr: spawnErr.stderr,
        stdout: spawnErr.stdout,
      }
    }
    throw error
  }
}

/**
 * Log and run a command.
 * @param {string} description - Description of what the command does
 * @param {string} command - The command to run
 * @param {string[]} args - Arguments
 * @param {object} options - Spawn options
 * @returns {Promise<number>} Exit code
 */
export async function logAndRun(
  description: string,
  command: string,
  args: string[] = [],
  options: SpawnOptions = {},
): Promise<number> {
  logger.log(description)
  return runCommand(command, args, options)
}
