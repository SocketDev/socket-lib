/**
 * @file Pure helpers over the standard OSV advisory schema. When a check has a
 *   machine-readable advisory (an OSV record) the affected-version set is a
 *   deterministic computation over that data — no model extraction needed.
 */

/**
 * Compare two semver versions. Returns -1, 0, or 1.
 */
export function compareSemverVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v.split('.').map(part => Number(part) || 0)
  const aParts = parse(a)
  const bParts = parse(b)
  const maxLen = Math.max(aParts.length, bParts.length)
  for (let i = 0; i < maxLen; i += 1) {
    const av = aParts[i] ?? 0
    const bv = bParts[i] ?? 0
    if (av !== bv) {
      return av < bv ? -1 : 1
    }
  }
  return 0
}

/**
 * Test whether a version is affected by one `affected` entry: either it is
 * explicitly listed in `versions`, or it falls inside any of the entry's
 * ranges.
 */
export function isVersionAffectedByEntry(
  affected: OsvAffected,
  version: string,
): boolean {
  if (affected.versions?.includes(version)) {
    return true
  }
  if (affected.ranges !== undefined) {
    for (const range of affected.ranges) {
      if (isVersionAffectedByRange(range, version)) {
        return true
      }
    }
  }
  return false
}

export interface OsvRangeEvent {
  fixed?: string | undefined
  introduced?: string | undefined
}

export interface OsvRange {
  events: OsvRangeEvent[]
  type: string
}

export interface OsvAffected {
  ranges?: OsvRange[] | undefined
  versions?: string[] | undefined
}

export interface OsvAdvisory {
  affected: OsvAffected[]
}

/**
 * Test whether a version falls inside one OSV range. Events are walked in
 * order: an `introduced` opens an affected window and a `fixed` closes it, so a
 * version is affected when it is `>= introduced` and `< fixed` for any open
 * pair. An `introduced` with no closing `fixed` leaves the window open to every
 * higher version.
 */
export function isVersionAffectedByRange(
  range: OsvRange,
  version: string,
): boolean {
  let activeIntroduced: string | undefined
  for (const event of range.events) {
    if (event.introduced !== undefined) {
      activeIntroduced = event.introduced
    }
    if (event.fixed !== undefined) {
      if (
        activeIntroduced !== undefined &&
        compareSemverVersions(version, activeIntroduced) >= 0 &&
        compareSemverVersions(version, event.fixed) < 0
      ) {
        return true
      }
      activeIntroduced = undefined
    }
  }
  return (
    activeIntroduced !== undefined &&
    compareSemverVersions(version, activeIntroduced) >= 0
  )
}

/**
 * Return the subset of `available` that the advisory marks affected, preserving
 * the input order. A version is affected when any `affected` entry names it in
 * `versions` or covers it with a range.
 */
export function osvVulnerableVersions(
  advisory: OsvAdvisory,
  available: string[],
): string[] {
  return available.filter(version =>
    advisory.affected.some(affected =>
      isVersionAffectedByEntry(affected, version),
    ),
  )
}
