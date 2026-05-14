/**
 * @fileoverview Execute Yarn Classic (v1.x) commands with optimized
 * flags and security defaults.
 *
 * SECURITY: Array-based arguments prevent command injection.
 *
 * NOTE: This is the canonical home of the cross-yarn execYarn. Yarn
 * Berry (v2-v4) and ZPM (v6+) currently delegate to this implementation
 * — that's load-bearing in the dir layout: when version-specific
 * behavior diverges (e.g. Berry's `--immutable` replacing Classic's
 * `--frozen-lockfile`), the override lands in the version's own
 * eco/npm/yarn-{berry,zpm}/exec.ts file, and yarn-classic stays here.
 */

import { execBin } from '../../../../bin/exec'
import { isDebug } from '../../../../debug/namespace'
import {
  ArrayPrototypeIndexOf,
  ArrayPrototypeSlice,
} from '../../../../primordials/array'
import { isNpmLoglevelFlag, isNpmProgressFlag } from '../../npm/flags'
import { isPnpmIgnoreScriptsFlag } from '../../pnpm/flags'

import { SetCtor } from '../../../../primordials/map-set'

import type { SpawnOptions } from '../../../../spawn/types'

// Commands that support --ignore-scripts in yarn (similar to npm/pnpm).
const yarnInstallLikeCommands = new SetCtor([
  'add',
  'import',
  'install',
  'link',
  'remove',
  'unlink',
  'upgrade',
])

/**
 * Execute yarn commands with optimized flags and settings.
 *
 * @example
 * ```typescript
 * await execYarn(['install'])
 * await execYarn(['add', 'lodash'], { cwd: '/tmp/project' })
 * ```
 */
export function execYarn(args: string[], options?: SpawnOptions | undefined) {
  const useDebug = isDebug()
  const terminatorPos = ArrayPrototypeIndexOf(args, '--')
  const yarnArgs = (
    terminatorPos === -1 ? args : ArrayPrototypeSlice(args, 0, terminatorPos)
  ).filter((a: string) => !isNpmProgressFlag(a))
  const otherArgs =
    terminatorPos === -1 ? [] : ArrayPrototypeSlice(args, terminatorPos)

  const firstArg = yarnArgs[0]
  // execYarn is exercised via integration tests passing `['--version']`;
  // most install-like-flag branches don't fire there.
  /* c8 ignore start */
  const supportsIgnoreScripts = firstArg
    ? yarnInstallLikeCommands.has(firstArg)
    : false

  const logLevelArgs =
    useDebug || yarnArgs.some(isNpmLoglevelFlag) ? [] : ['--silent']

  const hasIgnoreScriptsFlag = yarnArgs.some(isPnpmIgnoreScriptsFlag)
  const ignoreScriptsArgs =
    !supportsIgnoreScripts || hasIgnoreScriptsFlag ? [] : ['--ignore-scripts']
  /* c8 ignore stop */

  return execBin(
    'yarn',
    [...logLevelArgs, ...ignoreScriptsArgs, ...yarnArgs, ...otherArgs],
    {
      __proto__: null,
      ...options,
    } as SpawnOptions,
  )
}
