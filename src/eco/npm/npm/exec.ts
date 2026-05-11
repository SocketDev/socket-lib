/**
 * @fileoverview Execute npm commands with optimized flags and security defaults.
 *
 * SECURITY: Array-based arguments prevent command injection. All elements
 * in the args array are properly escaped by Node.js when passed to spawn().
 *
 * NOTE: We don't apply hardening flags to npm because:
 *   1. npm is a trusted system tool installed with Node.js.
 *   2. npm requires full system access (filesystem, network, child processes).
 *   3. Hardening flags would prevent npm from functioning even with --allow-* grants.
 *   4. The permission model is intended for untrusted user code, not package managers.
 */

import { NPM_BIN_PATH } from '../../../constants/agents'
import { WIN32 } from '../../../constants/platform'
import { isDebug } from '../../../debug/namespace'
import {
  ArrayPrototypeIndexOf,
  ArrayPrototypeSlice,
} from '../../../primordials/array'
import { spawn } from '../../../spawn/core'

import {
  isNpmAuditFlag,
  isNpmFundFlag,
  isNpmLoglevelFlag,
  isNpmProgressFlag,
} from './flags'

import type { SpawnOptions } from '../../../spawn/types'

/**
 * Execute npm commands with optimized flags and settings.
 *
 * @example
 * ```typescript
 * await execNpm(['install', '--save', 'lodash'])
 * await execNpm(['run', 'build'], { cwd: '/tmp/project' })
 * ```
 */
export function execNpm(args: string[], options?: SpawnOptions | undefined) {
  const useDebug = isDebug()
  const terminatorPos = ArrayPrototypeIndexOf(args, '--')
  const npmArgs = (
    terminatorPos === -1 ? args : ArrayPrototypeSlice(args, 0, terminatorPos)
  ).filter(
    (a: string) =>
      !isNpmAuditFlag(a) && !isNpmFundFlag(a) && !isNpmProgressFlag(a),
  )
  const otherArgs =
    terminatorPos === -1 ? [] : ArrayPrototypeSlice(args, terminatorPos)
  // Default loglevel "warn" (one quieter than npm's default "notice").
  const logLevelArgs =
    useDebug || npmArgs.some(isNpmLoglevelFlag) ? [] : ['--loglevel', 'warn']
  return spawn(
    NPM_BIN_PATH,
    [
      // Even with `--loglevel=error`, npm still runs through 'audit'/'fund'
      // codepaths unless --no-audit / --no-fund are passed explicitly.
      '--no-audit',
      '--no-fund',
      // Avoid input being swallowed by the spinner in recent npm versions.
      '--no-progress',
      ...logLevelArgs,
      ...npmArgs,
      ...otherArgs,
    ],
    {
      __proto__: null,
      // npm on Windows is a .cmd file that requires a shell.
      shell: WIN32,
      ...options,
    } as SpawnOptions,
  )
}
