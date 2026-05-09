/**
 * @fileoverview pnpm CLI flag predicates.
 *
 * pnpm reuses npm's `--loglevel` flag verbatim, so isPnpmLoglevelFlag
 * is an explicit alias of isNpmLoglevelFlag rather than a separate
 * implementation.
 */

import { SetCtor } from '../../../primordials'

import { isNpmLoglevelFlag } from '../npm/flags'

const pnpmIgnoreScriptsFlags = new SetCtor([
  '--ignore-scripts',
  '--no-ignore-scripts',
])

const pnpmFrozenLockfileFlags = new SetCtor([
  '--frozen-lockfile',
  '--no-frozen-lockfile',
])

const pnpmInstallCommands = new SetCtor(['install', 'i'])

/**
 * Check if a command argument is a pnpm frozen-lockfile flag.
 *
 * @example
 * ```typescript
 * isPnpmFrozenLockfileFlag('--frozen-lockfile')     // true
 * isPnpmFrozenLockfileFlag('--no-frozen-lockfile')  // true
 * isPnpmFrozenLockfileFlag('--save')                // false
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function isPnpmFrozenLockfileFlag(cmdArg: string): boolean {
  return pnpmFrozenLockfileFlags.has(cmdArg)
}

/**
 * Check if a command argument is a pnpm ignore-scripts flag.
 *
 * @example
 * ```typescript
 * isPnpmIgnoreScriptsFlag('--ignore-scripts')     // true
 * isPnpmIgnoreScriptsFlag('--no-ignore-scripts')  // true
 * isPnpmIgnoreScriptsFlag('--save')               // false
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function isPnpmIgnoreScriptsFlag(cmdArg: string): boolean {
  return pnpmIgnoreScriptsFlags.has(cmdArg)
}

/**
 * Check if a command argument is a pnpm install command.
 *
 * @example
 * ```typescript
 * isPnpmInstallCommand('install')  // true
 * isPnpmInstallCommand('i')        // true
 * isPnpmInstallCommand('run')      // false
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function isPnpmInstallCommand(cmdArg: string): boolean {
  return pnpmInstallCommands.has(cmdArg)
}

/**
 * Alias for isNpmLoglevelFlag — pnpm uses the same `--loglevel` surface.
 */
export const isPnpmLoglevelFlag = isNpmLoglevelFlag

// Internal: commands that support --ignore-scripts in pnpm.
// Installation-related: install, add, update, remove, link, unlink, import, rebuild.
export const PNPM_INSTALL_LIKE_COMMANDS = new SetCtor([
  'install',
  'i',
  'add',
  'update',
  'up',
  'remove',
  'rm',
  'link',
  'ln',
  'unlink',
  'import',
  'rebuild',
  'rb',
])
