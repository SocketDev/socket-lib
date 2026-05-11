/**
 * @fileoverview Common flag utilities for Socket CLI applications.
 * Re-export barrel for the split flag types + predicates so existing
 * `argv/flags` importers keep working unchanged.
 *
 *   - types + COMMON_FLAGS — `./flag-types`
 *   - is* predicates + getLogLevel — `./flag-predicates`
 */

export { COMMON_FLAGS } from './flag-types'
export type { FlagInput, FlagValues } from './flag-types'
export {
  getLogLevel,
  isAll,
  isChanged,
  isCoverage,
  isDebug,
  isDryRun,
  isFix,
  isForce,
  isHelp,
  isJson,
  isQuiet,
  isStaged,
  isUpdate,
  isVerbose,
  isWatch,
} from './flag-predicates'
