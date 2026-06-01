/**
 * @file Types + `COMMON_FLAGS` table for argv flag parsing. Split out of
 *   `argv/flags.ts` for size hygiene. Pure values + types only; no I/O or
 *   runtime side effects so this module stays cheap to import everywhere.
 */

/**
 * Flag values object from parsed arguments.
 */
export interface FlagValues {
  [key: string]: unknown
  quiet?: boolean | undefined
  silent?: boolean | undefined
  verbose?: boolean | undefined
  help?: boolean | undefined
  all?: boolean | undefined
  fix?: boolean | undefined
  force?: boolean | undefined
  'dry-run'?: boolean | undefined
  json?: boolean | undefined
  debug?: boolean | undefined
  watch?: boolean | undefined
  coverage?: boolean | undefined
  cover?: boolean | undefined
  update?: boolean | undefined
  staged?: boolean | undefined
  changed?: boolean | undefined
}

/**
 * Accepted input types for flag checking functions. Can be parsed flag values,
 * process.argv array, or undefined (uses process.argv).
 */
export type FlagInput = FlagValues | string[] | readonly string[] | undefined

/**
 * Common flag definitions for parseArgs configuration. Can be spread into
 * parseArgs options for consistency.
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
  cover: {
    type: 'boolean' as const,
    default: false,
    description: 'Run with coverage (alias)',
  },
  coverage: {
    type: 'boolean' as const,
    default: false,
    description: 'Run with coverage',
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
