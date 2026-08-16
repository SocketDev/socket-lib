/**
 * @file Deterministic lockfile redundancy detection. Grouping installed
 *   packages by base name and flagging duplicates is exact bookkeeping, so it
 *   belongs in code, not in a small model's judgment. Two shapes are flagged: a
 *   package present at more than one version, and a curated pair of functional
 *   duplicates (a package and its ESM twin) both installed at once.
 */

export interface RedundantPackageFinding {
  name: string
  reason: string
}

/**
 * Curated functional-duplicate pairs. Both members solving the same problem in
 * one install tree is redundant even when neither is version-duplicated.
 */
export const REDUNDANT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['lodash', 'lodash-es'],
]

/**
 * Find redundant packages in an npm-style lockfile. Parses the JSON, groups the
 * installed packages under `packages` by their base name (the segment after the
 * last `node_modules/`), and flags any name present at more than one version
 * plus any `REDUNDANT_PAIRS` entry whose members both appear.
 */
export function findRedundantPackages(
  lockfileText: string,
): RedundantPackageFinding[] {
  const parsed = JSON.parse(lockfileText) as {
    packages?: Record<string, { version?: string | undefined }> | undefined
  }
  const packages = parsed.packages ?? {}
  const marker = 'node_modules/'
  const versionsByName = new Map<string, Set<string>>()
  const keys = Object.keys(packages)
  for (let i = 0, { length } = keys; i < length; i += 1) {
    const key = keys[i]!
    if (key === '') {
      continue
    }
    const index = key.lastIndexOf(marker)
    const name = index === -1 ? key : key.slice(index + marker.length)
    const version = packages[key]?.version
    if (name === '' || version === undefined) {
      continue
    }
    let versions = versionsByName.get(name)
    if (versions === undefined) {
      versions = new Set<string>()
      versionsByName.set(name, versions)
    }
    versions.add(version)
  }
  const findings: RedundantPackageFinding[] = []
  const names = [...versionsByName.keys()].toSorted()
  for (let i = 0, { length } = names; i < length; i += 1) {
    const name = names[i]!
    const versions = versionsByName.get(name)!
    if (versions.size > 1) {
      const list = [...versions].toSorted().join(', ')
      findings.push({
        name,
        reason: `Installed at ${versions.size} versions (${list}); collapse to one.`,
      })
    }
  }
  for (const [first, second] of REDUNDANT_PAIRS) {
    if (versionsByName.has(first) && versionsByName.has(second)) {
      findings.push({
        name: first,
        reason: `${first} and ${second} are functional duplicates; consolidate on one.`,
      })
    }
  }
  return findings
}
