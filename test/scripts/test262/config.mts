/**
 * @file Load and validate the feature map, and the allowlist.
 *   `features.json` is the single source for which test262 subtrees run. The
 *   `.gitmodules` sparse-checkout has to carry each one, so that agreement is
 *   checked here rather than left to whoever edits one of the two files.
 */

import { existsSync, readFileSync } from 'node:fs'

import type { FeatureConfig } from './types.mts'

/**
 * The `sparse-checkout` patterns declared for the test262 submodule.
 */
export function parseSparseCheckout(gitmodules: string): string[] {
  const match = /^\s*sparse-checkout\s*=\s*(?<patterns>.+)$/m.exec(gitmodules)
  if (!match) {
    return []
  }
  const items = (match.groups?.['patterns'] ?? '').split(/\s+/)
  const out: string[] = []
  for (let i = 0, { length } = items; i < length; i += 1) {
    const pattern = items[i]!.trim()
    if (pattern) {
      out.push(pattern)
    }
  }
  return out
}

/**
 * Feature directories no sparse-checkout pattern covers.
 *
 * A pattern covers a directory when the directory sits at or beneath it, so
 * `test/built-ins/Promise/try/` covers `test/built-ins/Promise/try`.
 */
export function findUncoveredDirs(
  features: readonly FeatureConfig[],
  patterns: readonly string[],
): string[] {
  const normalized: string[] = []
  for (let i = 0, { length } = patterns; i < length; i += 1) {
    normalized.push(patterns[i]!.replace(/\/+$/, ''))
  }
  const uncovered: string[] = []
  for (let i = 0, { length } = features; i < length; i += 1) {
    const { dirs } = features[i]!
    for (let j = 0, count = dirs.length; j < count; j += 1) {
      const dir = dirs[j]!.replace(/\/+$/, '')
      let covered = false
      for (let k = 0, total = normalized.length; k < total; k += 1) {
        const pattern = normalized[k]!
        if (dir === pattern || dir.startsWith(`${pattern}/`)) {
          covered = true
          break
        }
      }
      if (!covered && !uncovered.includes(dir)) {
        uncovered.push(dir)
      }
    }
  }
  return uncovered
}

/**
 * Read the feature map. Throws with What/Where/Saw-vs-wanted/Fix when the
 * sparse-checkout does not cover every directory it names, because the runner
 * would otherwise walk a subtree git never fetched and report zero tests.
 */
export function loadFeatures(
  featuresPath: string,
  gitmodulesPath: string,
): FeatureConfig[] {
  const parsed = JSON.parse(readFileSync(featuresPath, 'utf8')) as {
    features?: FeatureConfig[] | undefined
  }
  const features = parsed.features ?? []
  if (features.length === 0) {
    throw new Error(
      `No features declared.\n  Where: ${featuresPath}\n  Saw: an empty "features" array; wanted at least one entry.\n  Fix: add the shim and the test262 directories that specify it.`,
    )
  }
  if (existsSync(gitmodulesPath)) {
    const patterns = parseSparseCheckout(readFileSync(gitmodulesPath, 'utf8'))
    const uncovered = findUncoveredDirs(features, patterns)
    if (uncovered.length > 0) {
      throw new Error(
        `test262 sparse-checkout does not cover every declared directory.\n  Where: ${gitmodulesPath}\n  Saw: no pattern covering ${uncovered.join(', ')}; wanted every "dirs" entry from ${featuresPath} covered.\n  Fix: add the missing path(s) to the submodule's sparse-checkout, then re-fetch with 'node scripts/fleet/git-partial-submodule.mts clone upstream/test262'.`,
      )
    }
  }
  return features
}

/**
 * Read an allowlist file: one test id per line, `#` comments and blanks
 * ignored. A missing file is an empty allowlist, which is the healthy state.
 */
export function loadAllowlist(allowlistPath: string): string[] {
  if (!existsSync(allowlistPath)) {
    return []
  }
  const lines = readFileSync(allowlistPath, 'utf8').split(/\r?\n/)
  const out: string[] = []
  for (let i = 0, { length } = lines; i < length; i += 1) {
    const line = lines[i]!.trim()
    if (line && !line.startsWith('#')) {
      out.push(line)
    }
  }
  return out
}
