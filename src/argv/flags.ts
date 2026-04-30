/**
 * @fileoverview Common flag utilities for Socket CLI applications.
 * Provides consistent flag checking (quiet, silent, verbose, debug, dry-run,
 * etc.) across Socket projects, accepting either parsed flag objects or raw
 * argv arrays.
 */

import process from 'node:process'

import { ArrayIsArray } from '../primordials'

/**
 * Flag values object from parsed arguments.
 */
export interface FlagValues {
  [key: string]: unknown
  quiet?: boolean
  silent?: boolean
  verbose?: boolean
  help?: boolean
  all?: boolean
  fix?: boolean
  force?: boolean
  'dry-run'?: boolean
  json?: boolean
  debug?: boolean
  watch?: boolean
  coverage?: boolean
  cover?: boolean
  update?: boolean
  staged?: boolean
  changed?: boolean
}

const processArg = [...process.argv]

/**
 * Accepted input types for flag checking functions.
 * Can be parsed flag values, process.argv array, or undefined (uses process.argv).
 */
export type FlagInput = FlagValues | string[] | readonly string[] | undefined

/**
 * Common flag definitions for parseArgs configuration.
 * Can be spread into parseArgs options for consistency.
 */
export const COMMON_FLAGS = {
  all: {
    type: 'boolean' as const,
    default: false,
    description: 'Target all files',
  },
  changed: {
    type: 'boolean' as const,
    default: false,
    description: 'Target changed files',
  },
  coverage: {
    type: 'boolean' as const,
    default: false,
    description: 'Run with coverage',
  },
  cover: {
    type: 'boolean' as const,
    default: false,
    description: 'Run with coverage (alias)',
  },
  debug: {
    type: 'boolean' as const,
    default: false,
    description: 'Enable debug output',
  },
  'dry-run': {
    type: 'boolean' as const,
    default: false,
    description: 'Perform a dry run',
  },
  fix: {
    type: 'boolean' as const,
    default: false,
    description: 'Automatically fix issues',
  },
  force: {
    type: 'boolean' as const,
    default: false,
    description: 'Force the operation',
  },
  help: {
    type: 'boolean' as const,
    default: false,
    short: 'h',
    description: 'Show help',
  },
  json: {
    type: 'boolean' as const,
    default: false,
    description: 'Output as JSON',
  },
  quiet: {
    type: 'boolean' as const,
    default: false,
    short: 'q',
    description: 'Suppress output',
  },
  silent: {
    type: 'boolean' as const,
    default: false,
    description: 'Suppress all output',
  },
  staged: {
    type: 'boolean' as const,
    default: false,
    description: 'Target staged files',
  },
  update: {
    type: 'boolean' as const,
    default: false,
    short: 'u',
    description: 'Update snapshots/deps',
  },
  verbose: {
    type: 'boolean' as const,
    default: false,
    short: 'v',
    description: 'Verbose output',
  },
  watch: {
    type: 'boolean' as const,
    default: false,
    short: 'w',
    description: 'Watch mode',
  },
}

/**
 * Get the appropriate log level based on flags.
 * Returns 'silent', 'error', 'warn', 'info', 'verbose', or 'debug'.
 * Accepts FlagValues object, process.argv array, or undefined (uses process.argv).
 *
 * @example
 * ```typescript
 * getLogLevel()  // 'info' (default)
 * getLogLevel({ quiet: true })  // 'silent'
 * getLogLevel(['--debug'])  // 'debug'
 * ```
 */
export function getLogLevel(input?: FlagInput): string {
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
 * Check if all flag is set.
 * Accepts FlagValues object, process.argv array, or undefined (uses process.argv).
 *
 * @example
 * ```typescript
 * isAll({ all: true })  // true
 * isAll(['--all'])  // true
 * ```
 */
export function isAll(input?: FlagInput): boolean {
  if (!input) {
    return processArg.includes('--all')
  }
  if (ArrayIsArray(input)) {
    return input.includes('--all')
  }
  return !!(input as FlagValues).all
}

/**
 * Check if changed files mode is enabled.
 * Accepts FlagValues object, process.argv array, or undefined (uses process.argv).
 *
 * @example
 * ```typescript
 * isChanged({ changed: true })  // true
 * isChanged(['--changed'])  // true
 * ```
 */
export function isChanged(input?: FlagInput): boolean {
  if (!input) {
    return processArg.includes('--changed')
  }
  if (ArrayIsArray(input)) {
    return input.includes('--changed')
  }
  return !!(input as FlagValues).changed
}

/**
 * Check if coverage mode is enabled.
 * Checks both 'coverage' and 'cover' flags.
 * Accepts FlagValues object, process.argv array, or undefined (uses process.argv).
 *
 * @example
 * ```typescript
 * isCoverage({ coverage: true })  // true
 * isCoverage(['--cover'])  // true
 * ```
 */
export function isCoverage(input?: FlagInput): boolean {
  if (!input) {
    return processArg.includes('--coverage') || processArg.includes('--cover')
  }
  if (ArrayIsArray(input)) {
    return input.includes('--coverage') || input.includes('--cover')
  }
  return !!((input as FlagValues).coverage || (input as FlagValues).cover)
}

/**
 * Check if debug mode is enabled.
 * Accepts FlagValues object, process.argv array, or undefined (uses process.argv).
 *
 * @example
 * ```typescript
 * isDebug({ debug: true })  // true
 * isDebug(['--debug'])  // true
 * ```
 */
export function isDebug(input?: FlagInput): boolean {
  if (!input) {
    return processArg.includes('--debug')
  }
  if (ArrayIsArray(input)) {
    return input.includes('--debug')
  }
  return !!(input as FlagValues).debug
}

/**
 * Check if dry-run mode is enabled.
 * Accepts FlagValues object, process.argv array, or undefined (uses process.argv).
 *
 * @example
 * ```typescript
 * isDryRun({ 'dry-run': true })  // true
 * isDryRun(['--dry-run'])  // true
 * ```
 */
export function isDryRun(input?: FlagInput): boolean {
  if (!input) {
    return processArg.includes('--dry-run')
  }
  if (ArrayIsArray(input)) {
    return input.includes('--dry-run')
  }
  return !!(input as FlagValues)['dry-run']
}

/**
 * Check if fix/autofix mode is enabled.
 * Accepts FlagValues object, process.argv array, or undefined (uses process.argv).
 *
 * @example
 * ```typescript
 * isFix({ fix: true })  // true
 * isFix(['--fix'])  // true
 * ```
 */
export function isFix(input?: FlagInput): boolean {
  if (!input) {
    return processArg.includes('--fix')
  }
  if (ArrayIsArray(input)) {
    return input.includes('--fix')
  }
  return !!(input as FlagValues).fix
}

/**
 * Check if force mode is enabled.
 * Accepts FlagValues object, process.argv array, or undefined (uses process.argv).
 *
 * @example
 * ```typescript
 * isForce({ force: true })  // true
 * isForce(['--force'])  // true
 * ```
 */
export function isForce(input?: FlagInput): boolean {
  if (!input) {
    return processArg.includes('--force')
  }
  if (ArrayIsArray(input)) {
    return input.includes('--force')
  }
  return !!(input as FlagValues).force
}

/**
 * Check if help flag is set.
 * Accepts FlagValues object, process.argv array, or undefined (uses process.argv).
 *
 * @example
 * ```typescript
 * isHelp({ help: true })  // true
 * isHelp(['-h'])  // true
 * ```
 */
export function isHelp(input?: FlagInput): boolean {
  if (!input) {
    return processArg.includes('--help') || processArg.includes('-h')
  }
  if (ArrayIsArray(input)) {
    return input.includes('--help') || input.includes('-h')
  }
  return !!(input as FlagValues).help
}

/**
 * Check if JSON output is requested.
 * Accepts FlagValues object, process.argv array, or undefined (uses process.argv).
 *
 * @example
 * ```typescript
 * isJson({ json: true })  // true
 * isJson(['--json'])  // true
 * ```
 */
export function isJson(input?: FlagInput): boolean {
  if (!input) {
    return processArg.includes('--json')
  }
  if (ArrayIsArray(input)) {
    return input.includes('--json')
  }
  return !!(input as FlagValues).json
}

/**
 * Check if quiet/silent mode is enabled.
 * Accepts FlagValues object, process.argv array, or undefined (uses process.argv).
 *
 * @example
 * ```typescript
 * isQuiet({ quiet: true })  // true
 * isQuiet(['--silent'])  // true
 * ```
 */
export function isQuiet(input?: FlagInput): boolean {
  if (!input) {
    return processArg.includes('--quiet') || processArg.includes('--silent')
  }
  if (ArrayIsArray(input)) {
    return input.includes('--quiet') || input.includes('--silent')
  }
  return !!((input as FlagValues).quiet || (input as FlagValues).silent)
}

/**
 * Check if staged files mode is enabled.
 * Accepts FlagValues object, process.argv array, or undefined (uses process.argv).
 *
 * @example
 * ```typescript
 * isStaged({ staged: true })  // true
 * isStaged(['--staged'])  // true
 * ```
 */
export function isStaged(input?: FlagInput): boolean {
  if (!input) {
    return processArg.includes('--staged')
  }
  if (ArrayIsArray(input)) {
    return input.includes('--staged')
  }
  return !!(input as FlagValues).staged
}

/**
 * Check if update mode is enabled (for snapshots, dependencies, etc).
 * Accepts FlagValues object, process.argv array, or undefined (uses process.argv).
 *
 * @example
 * ```typescript
 * isUpdate({ update: true })  // true
 * isUpdate(['-u'])  // true
 * ```
 */
export function isUpdate(input?: FlagInput): boolean {
  if (!input) {
    return processArg.includes('--update') || processArg.includes('-u')
  }
  if (ArrayIsArray(input)) {
    return input.includes('--update') || input.includes('-u')
  }
  return !!(input as FlagValues).update
}

/**
 * Check if verbose mode is enabled.
 * Accepts FlagValues object, process.argv array, or undefined (uses process.argv).
 *
 * @example
 * ```typescript
 * isVerbose({ verbose: true })  // true
 * isVerbose(['--verbose'])  // true
 * ```
 */
export function isVerbose(input?: FlagInput): boolean {
  if (!input) {
    return processArg.includes('--verbose')
  }
  if (ArrayIsArray(input)) {
    return input.includes('--verbose')
  }
  return !!(input as FlagValues).verbose
}

/**
 * Check if watch mode is enabled.
 * Accepts FlagValues object, process.argv array, or undefined (uses process.argv).
 *
 * @example
 * ```typescript
 * isWatch({ watch: true })  // true
 * isWatch(['-w'])  // true
 * ```
 */
export function isWatch(input?: FlagInput): boolean {
  if (!input) {
    return processArg.includes('--watch') || processArg.includes('-w')
  }
  if (ArrayIsArray(input)) {
    return input.includes('--watch') || input.includes('-w')
  }
  return !!(input as FlagValues).watch
}
