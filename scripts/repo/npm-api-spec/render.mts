/**
 * @file Turn a drift verdict into the lines the check prints.
 *   Split from the check entry so the wording is testable without spawning a
 *   process, and so the entry stays a thin CLI shell over pure functions.
 */

import { HELPER_DIR_LABEL } from './inventory.mts'

import type { DriftReport } from './drift.mts'

const CHECK = '[npm-registry-helpers-match-spec]'

/**
 * How the report is worded.
 */
export interface DriftRenderOptions {
  /**
   * True when a field gap is a FAILURE rather than advice. Only changes the
   * severity word in the report; the exit code is the check's own decision.
   */
  strict?: boolean | undefined
}

/**
 * One check run's whole verdict. Lives here rather than in the check entry so
 * the renderer and the entry share it without importing each other.
 *
 * `ready` is false when the generated inventory is missing: the run is then a
 * SKIP, not a pass and not a failure. `pinIsStale` is undefined when the online
 * leg did not run or could not reach GitHub, which is distinct from `false`.
 */
export interface SpecCheckResult {
  readonly drift: DriftReport | undefined
  readonly headSha: string | undefined
  readonly pinIsStale: boolean | undefined
  readonly pinnedSha: string | undefined
  readonly ready: boolean
  readonly specEndpoints: number
}

/**
 * The fix line every failure ends with.
 */
export const REFRESH_HINT = `${CHECK}   Fix: run \`node scripts/repo/sync-npm-api-spec.mts --refresh\`, then add or update the helper in ${HELPER_DIR_LABEL}/.`

/**
 * Lines describing the endpoints npm documents that no helper builds. This is
 * the leg that fails the gate.
 */
export function renderUncovered(result: SpecCheckResult): string[] {
  const uncovered = result.drift?.uncovered ?? []
  if (!uncovered.length) {
    return []
  }
  const lines = [
    `${CHECK} ${uncovered.length} spec endpoint(s) have NO helper in ${HELPER_DIR_LABEL}/:`,
  ]
  for (let i = 0, { length } = uncovered; i < length; i += 1) {
    const entry = uncovered[i]!
    const label = entry.operationId ? ` (${entry.operationId})` : ''
    lines.push(`${CHECK}   ${entry.method} ${entry.path}${label}`)
    if (entry.summary) {
      lines.push(`${CHECK}     ${entry.summary}`)
    }
  }
  lines.push(REFRESH_HINT)
  return lines
}

/**
 * Lines describing helpers whose route the spec does not carry. Advisory: npm
 * serves more than it documents, so a route here is a prompt to look, not proof
 * of a bug.
 */
export function renderUndocumented(result: SpecCheckResult): string[] {
  const undocumented = result.drift?.undocumented ?? []
  if (!undocumented.length) {
    return []
  }
  const lines = [
    `${CHECK} ${undocumented.length} helper route(s) are absent from the spec (advisory — npm serves more than it documents):`,
  ]
  for (let i = 0, { length } = undocumented; i < length; i += 1) {
    const entry = undocumented[i]!
    lines.push(
      `${CHECK}   ${entry.method} ${entry.path} — ${entry.helper}() in ${HELPER_DIR_LABEL}/${entry.file}`,
    )
  }
  return lines
}

/**
 * Lines describing spec fields the owning module never names, grouped by route
 * so a reader fixes one type at a time.
 */
export function renderMissingFields(
  result: SpecCheckResult,
  options?: DriftRenderOptions | undefined,
): string[] {
  const opts = { __proto__: null, ...options } as DriftRenderOptions
  const missing = result.drift?.missingFields ?? []
  if (!missing.length) {
    return []
  }
  const severity = opts.strict === true ? 'FAIL' : 'advisory'
  const lines = [
    `${CHECK} ${missing.length} spec field(s) are named nowhere in the owning module (${severity}):`,
  ]
  let currentRoute = ''
  for (let i = 0, { length } = missing; i < length; i += 1) {
    const entry = missing[i]!
    if (entry.route !== currentRoute) {
      currentRoute = entry.route
      lines.push(
        `${CHECK}   ${currentRoute} — ${entry.helper}() in ${HELPER_DIR_LABEL}/${entry.file}`,
      )
    }
    lines.push(`${CHECK}     ${entry.kind}: ${entry.field}`)
  }
  return lines
}

/**
 * Lines for the optional online staleness leg.
 */
export function renderStaleness(result: SpecCheckResult): string[] {
  if (result.pinIsStale === undefined) {
    return []
  }
  if (!result.pinIsStale) {
    return [`${CHECK} the pin is current with npm's main.`]
  }
  return [
    `${CHECK} npm's main has moved past the pin.`,
    `${CHECK}   Pinned: ${result.pinnedSha ?? 'none'}`,
    `${CHECK}   Head:   ${result.headSha ?? 'unknown'}`,
    REFRESH_HINT,
  ]
}

/**
 * Every line for one run, in report order: hard findings first, then advisory
 * ones, then the summary.
 */
export function renderDriftLines(
  result: SpecCheckResult,
  options?: DriftRenderOptions | undefined,
): string[] {
  if (!result.ready) {
    return [
      `${CHECK} no generated spec inventory — skipped.`,
      `${CHECK}   Fix: run \`node scripts/repo/sync-npm-api-spec.mts --refresh\` and commit the result.`,
    ]
  }
  const lines = [
    ...renderUncovered(result),
    ...renderUndocumented(result),
    ...renderMissingFields(result, options),
    ...renderStaleness(result),
  ]
  const drift = result.drift
  const matched = drift?.matchedEndpoints ?? 0
  lines.push(
    `${CHECK} ${matched}/${result.specEndpoints} spec endpoint(s) have a helper; pinned at ${result.pinnedSha ?? 'none'}.`,
  )
  return lines
}
