/**
 * @file Execute npm commands with optimized flags and security defaults.
 *   SECURITY: Array-based arguments prevent command injection. All elements in
 *   the args array are properly escaped by Node.js when passed to spawn().
 *   NOTE: We don't apply hardening flags to npm because:
 *
 *   1. npm is a trusted system tool installed with Node.js.
 *   2. npm requires full system access: filesystem, network, child processes.
 *   3. Hardening flags would prevent npm from functioning even with --allow-*
 *      grants.
 *   4. The permission model is intended for untrusted user code, not package
 *      managers.
 */

import { NPM_BIN_PATH } from '../../../constants/package-managers.mjs'
import { isDebug } from '../../../debug/namespace.mjs'
import {
  ArrayPrototypeIndexOf,
  ArrayPrototypeSlice,
} from '../../../primordials/array.mjs'
import { spawn } from '../../../process/spawn/child.mjs'
import { windowsShellOption } from '../../../process/spawn/windows-shell.mjs'

import {
  isNpmAuditFlag,
  isNpmFundFlag,
  isNpmLoglevelFlag,
  isNpmProgressFlag,
} from './flags.mjs'

import type { SpawnOptions } from '../../../process/spawn/types.mjs'

/**
 * Execute npm commands with optimized flags and settings.
 *
 * @example
 *   ;```typescript
 *   await execNpm(['install', '--save', 'lodash'])
 *   await execNpm(['run', 'build'], { cwd: '/tmp/project' })
 *   ```
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
      // npm on Windows is a .cmd shim that cmd.exe has to interpret. Asked per
      // command so the answer follows NPM_BIN_PATH rather than the platform.
      ...windowsShellOption(NPM_BIN_PATH),
      ...options,
    } as SpawnOptions,
  )
}
