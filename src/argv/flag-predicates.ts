/**
 * @file Flag predicates — `is*` checks across parsed `FlagValues`, raw
 *   `process.argv`, or no input. Split out of `argv/flags.ts` for size hygiene.
 *   Every predicate follows the same 3-branch shape, so they're built via a
 *   single `makeFlagPredicate` factory:
 *
 *   1. no input → consult the frozen `processArg` snapshot
 *   2. string[] input → `Array.includes` lookup of each flag form
 *   3. FlagValues input → boolean-coerce each key Long forms, short aliases, and
 *      `FlagValues` keys are all configurable per predicate (e.g. `isQuiet`
 *      accepts both `--quiet` and `--silent`).
 */

import process from 'node:process'

import { ArrayIsArray, ArrayPrototypeIncludes } from '../primordials/array'

import type { FlagInput, FlagValues } from './flag-types'

const processArg = [...process.argv]

/**
 * Get the appropriate log level based on flags. Returns 'silent', 'error',
 * 'warn', 'info', 'verbose', or 'debug'.
 *
 * @example
 *   ;```typescript
 *   getLogLevel() // 'info' (default)
 *   getLogLevel({ quiet: true }) // 'silent'
 *   getLogLevel(['--debug']) // 'debug'
 *   ```
 */
export function getLogLevel(input?: FlagInput | undefined): string {
  if (isQuiet(input)) {
    return 'silent'
  }
  if (isDebug(input)) {
    return 'debug'
  }
  if (isVerbose(input)) {
    return 'verbose'
  }
  return 'info'
}

/**
 * Build a flag predicate that accepts `FlagValues`, `string[]`, or `undefined`
 * (in which case it consults the frozen `processArg`).
 *
 * @private
 *
 * @param longFlags - Long-form flags to match in argv arrays (e.g. `['--quiet',
 *   '--silent']`).
 * @param shortFlags - Short-form flags to match in argv arrays (e.g. `['-q']`).
 * @param keys - `FlagValues` keys to coerce when given a parsed object
 *   (defaults to the first long flag with `--` stripped).
 */
export function makeFlagPredicate(
  longFlags: readonly string[],
  shortFlags: readonly string[] = [],
  keys: readonly string[] = [longFlags[0]!.replace(/^--/, '')],
): (input?: FlagInput | undefined) => boolean {
  const argvForms = [...longFlags, ...shortFlags]
  return function check(input?: FlagInput | undefined): boolean {
    // processArg is module-frozen process.argv slice; no-input branch only
    // reachable when invoked from a process whose argv contains the flag,
    // which test runners can't simulate.
    /* c8 ignore start */
    if (!input) {
      return argvForms.some(f => processArg.includes(f))
    }
    /* c8 ignore stop */
    if (ArrayIsArray(input)) {
      return argvForms.some(f => ArrayPrototypeIncludes(input, f))
    }
    return keys.some(k => !!(input as FlagValues)[k])
  }
}

/**
 * Check if all flag is set. Accepts FlagValues object, process.argv array, or
 * undefined (uses process.argv).
 *
 * @example
 *   ;```typescript
 *   isAll({ all: true }) // true
 *   isAll(['--all']) // true
 *   ```
 */
export const isAll = makeFlagPredicate(['--all'])

/**
 * Check if changed files mode is enabled.
 *
 * @example
 *   ;```typescript
 *   isChanged({ changed: true }) // true
 *   isChanged(['--changed']) // true
 *   ```
 */
export const isChanged = makeFlagPredicate(['--changed'])

/**
 * Check if coverage mode is enabled. Checks both 'coverage' and 'cover' flags.
 *
 * @example
 *   ;```typescript
 *   isCoverage({ coverage: true }) // true
 *   isCoverage(['--cover']) // true
 *   ```
 */
export const isCoverage = makeFlagPredicate(
  ['--coverage', '--cover'],
  [],
  ['coverage', 'cover'],
)

/**
 * Check if debug mode is enabled.
 *
 * @example
 *   ;```typescript
 *   isDebug({ debug: true }) // true
 *   isDebug(['--debug']) // true
 *   ```
 */
export const isDebug = makeFlagPredicate(['--debug'])

/**
 * Check if dry-run mode is enabled.
 *
 * @example
 *   ;```typescript
 *   isDryRun({ 'dry-run': true }) // true
 *   isDryRun(['--dry-run']) // true
 *   ```
 */
export const isDryRun = makeFlagPredicate(['--dry-run'], [], ['dry-run'])

/**
 * Check if fix/autofix mode is enabled.
 *
 * @example
 *   ;```typescript
 *   isFix({ fix: true }) // true
 *   isFix(['--fix']) // true
 *   ```
 */
export const isFix = makeFlagPredicate(['--fix'])

/**
 * Check if force mode is enabled.
 *
 * @example
 *   ;```typescript
 *   isForce({ force: true }) // true
 *   isForce(['--force']) // true
 *   ```
 */
export const isForce = makeFlagPredicate(['--force'])

/**
 * Check if help flag is set.
 *
 * @example
 *   ;```typescript
 *   isHelp({ help: true }) // true
 *   isHelp(['-h']) // true
 *   ```
 */
export const isHelp = makeFlagPredicate(['--help'], ['-h'])

/**
 * Check if JSON output is requested.
 *
 * @example
 *   ;```typescript
 *   isJson({ json: true }) // true
 *   isJson(['--json']) // true
 *   ```
 */
export const isJson = makeFlagPredicate(['--json'])

/**
 * Check if quiet/silent mode is enabled.
 *
 * @example
 *   ;```typescript
 *   isQuiet({ quiet: true }) // true
 *   isQuiet(['--silent']) // true
 *   ```
 */
export const isQuiet = makeFlagPredicate(
  ['--quiet', '--silent'],
  [],
  ['quiet', 'silent'],
)

/**
 * Check if staged files mode is enabled.
 *
 * @example
 *   ;```typescript
 *   isStaged({ staged: true }) // true
 *   isStaged(['--staged']) // true
 *   ```
 */
export const isStaged = makeFlagPredicate(['--staged'])

/**
 * Check if update mode is enabled (for snapshots, dependencies, etc).
 *
 * @example
 *   ;```typescript
 *   isUpdate({ update: true }) // true
 *   isUpdate(['-u']) // true
 *   ```
 */
export const isUpdate = makeFlagPredicate(['--update'], ['-u'])

/**
 * Check if verbose mode is enabled.
 *
 * @example
 *   ;```typescript
 *   isVerbose({ verbose: true }) // true
 *   isVerbose(['--verbose']) // true
 *   ```
 */
export const isVerbose = makeFlagPredicate(['--verbose'])

/**
 * Check if watch mode is enabled.
 *
 * @example
 *   ;```typescript
 *   isWatch({ watch: true }) // true
 *   isWatch(['-w']) // true
 *   ```
 */
export const isWatch = makeFlagPredicate(['--watch'], ['-w'])
