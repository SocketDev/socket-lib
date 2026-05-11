/**
 * @fileoverview Execute pnpm commands with optimized flags and security defaults.
 *
 * SECURITY: Array-based arguments prevent command injection. All elements
 * in the args array are properly escaped by Node.js when passed to execBin().
 */

import { execBin } from '../../../bin/exec'
import { isDebug } from '../../../debug/namespace'
import { getCI } from '../../../env/ci'
import {
  ArrayPrototypeIndexOf,
  ArrayPrototypeSlice,
} from '../../../primordials/array'
import { isNpmProgressFlag } from '../npm/flags'

import {
  isPnpmFrozenLockfileFlag,
  isPnpmIgnoreScriptsFlag,
  isPnpmInstallCommand,
  isPnpmLoglevelFlag,
  PNPM_INSTALL_LIKE_COMMANDS,
} from './flags'

import type { SpawnOptions } from '../../../spawn/types'

export interface PnpmOptions extends SpawnOptions {
  allowLockfileUpdate?: boolean
}

/**
 * Execute pnpm commands with optimized flags and settings.
 *
 * @example
 * ```typescript
 * await execPnpm(['install'])
 * await execPnpm(['add', 'lodash'], { allowLockfileUpdate: true })
 * ```
 */
export function execPnpm(args: string[], options?: PnpmOptions | undefined) {
  const { allowLockfileUpdate, ...extBinOpts } = {
    __proto__: null,
    ...options,
  } as PnpmOptions
  const useDebug = isDebug()
  const terminatorPos = ArrayPrototypeIndexOf(args, '--')
  const pnpmArgs = (
    terminatorPos === -1 ? args : ArrayPrototypeSlice(args, 0, terminatorPos)
  ).filter((a: string) => !isNpmProgressFlag(a))
  const otherArgs =
    terminatorPos === -1 ? [] : ArrayPrototypeSlice(args, terminatorPos)

  const firstArg = pnpmArgs[0]
  const supportsIgnoreScripts = firstArg
    ? PNPM_INSTALL_LIKE_COMMANDS.has(firstArg)
    : false

  // pnpm uses --loglevel for all commands.
  const logLevelArgs =
    useDebug || pnpmArgs.some(isPnpmLoglevelFlag) ? [] : ['--loglevel', 'warn']

  // Only add --ignore-scripts for commands that support it.
  const hasIgnoreScriptsFlag = pnpmArgs.some(isPnpmIgnoreScriptsFlag)
  const ignoreScriptsArgs =
    !supportsIgnoreScripts || hasIgnoreScriptsFlag ? [] : ['--ignore-scripts']

  // CI defaults: pnpm uses --frozen-lockfile by default. Suppress when
  // the caller explicitly opted into lockfile updates. The full chain
  // short-circuits at getCI() in non-CI runs (returns false), so the
  // remaining branches are unreachable in test environments.
  /* c8 ignore start */
  const frozenLockfileArgs = []
  if (
    getCI() &&
    allowLockfileUpdate &&
    firstArg &&
    isPnpmInstallCommand(firstArg) &&
    !pnpmArgs.some(isPnpmFrozenLockfileFlag)
  ) {
    frozenLockfileArgs.push('--no-frozen-lockfile')
  }
  /* c8 ignore stop */

  // Note: pnpm doesn't have a --no-progress flag. It uses --reporter
  // instead. We omit --no-progress to avoid "Unknown option" errors.

  return execBin(
    'pnpm',
    [
      ...logLevelArgs,
      ...ignoreScriptsArgs,
      ...frozenLockfileArgs,
      ...pnpmArgs,
      ...otherArgs,
    ],
    extBinOpts,
  )
}
