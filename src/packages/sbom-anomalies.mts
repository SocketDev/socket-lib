/**
 * @file Deterministic SBOM anomaly detection. Scanning a component list for
 *   duplicate-version components, deprecated markers, and untagged git
 *   dependencies is exact pattern work, so it belongs in code, not in a small
 *   model's judgment. Each component line is expected to carry a package URL
 *   (`pkg:<type>/<name>@<version>`) optionally annotated with markers.
 */

// Matches a package URL: `pkg:<type>/` then capture 1 = the package name (up to
// the version `@`), then capture 2 = the version (starts with a digit, runs to
// the next space or paren so trailing annotations like "(deprecated)" are left
// out).
const PURL_PATTERN = /pkg:[^/\s]+\/(.+?)@([0-9][^\s()]*)/

/**
 * Find anomalies in an SBOM component list. Flags any component name present at
 * more than one version, any line marked deprecated, and any git dependency
 * with no pinned tag. Duplicate-version findings come first (sorted by name),
 * then the per-line marker findings in list order.
 */
export function findSbomAnomalies(componentsText: string): string[] {
  const lines = componentsText.split(/\r?\n/)
  const versionsByName = new Map<string, Set<string>>()
  for (let i = 0, { length } = lines; i < length; i += 1) {
    const line = lines[i]!
    const match = PURL_PATTERN.exec(line)
    if (match === null) {
      continue
    }
    const name = match[1]!
    const version = match[2]!
    let versions = versionsByName.get(name)
    if (versions === undefined) {
      versions = new Set<string>()
      versionsByName.set(name, versions)
    }
    versions.add(version)
  }
  const anomalies: string[] = []
  const names = [...versionsByName.keys()].toSorted()
  for (let i = 0, { length } = names; i < length; i += 1) {
    const name = names[i]!
    const versions = versionsByName.get(name)!
    if (versions.size > 1) {
      const list = [...versions].toSorted().join(', ')
      anomalies.push(`Duplicate versions of ${name}: ${list}.`)
    }
  }
  for (let i2 = 0, { length } = lines; i2 < length; i2 += 1) {
    const line = lines[i2]!
    const match = PURL_PATTERN.exec(line)
    if (match === null) {
      continue
    }
    const name = match[1]!
    if (/deprecated/i.test(line)) {
      anomalies.push(`${name} is marked deprecated.`)
    }
    if (/git dependency/i.test(line) && /no tag/i.test(line)) {
      anomalies.push(`${name} is a git dependency with no pinned tag.`)
    }
  }
  return anomalies
}
