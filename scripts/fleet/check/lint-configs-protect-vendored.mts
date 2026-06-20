#!/usr/bin/env node
// check --all gate: a lint/format config's vendored exclusions must never be
// overridable by a later re-include. Why this exists: the wheelhouse dogfood
// oxlint config re-includes 'template/' so oxlint lints the fleet SOURCE — but
// a broad '!**/template/**' placed AFTER the vendored excludes silently
// re-exposes the verbatim third-party files (the acorn wasm-bindgen glue, the
// wasm blob, vendor/ trees). An 'oxlint --fix' over that scope then rewrites
// them — the export-top-level-functions autofix has turned the vendored CJS
// glue into invalid ESM before, breaking require(). The ignore paths were
// applied; they were just wrong. Invariant: in any oxlint config whose
// ignorePatterns contains a ! negation, each protected-vendored glob must
// appear AFTER the last negation (gitignore last-match wins, so the protection
// holds even inside a re-included tree).
//
// Usage: node scripts/fleet/check/lint-configs-protect-vendored.mts [--quiet]

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import { REPO_ROOT } from '../paths.mts'

const logger = getDefaultLogger()

// Verbatim third-party / generated files that lint AND --fix must never touch,
// no matter what a re-include says. Globs as they appear in oxlint
// ignorePatterns.
export const PROTECTED_VENDORED_GLOBS: readonly string[] = [
  '**/acorn-bindgen.cjs',
  '**/acorn.wasm',
  '**/external/**',
  '**/vendor/**',
  '**/wasm_exec.js',
]

// oxlint configs that carry an ignorePatterns array (fleet canonical + repo
// overlays, including the wheelhouse-only dogfood config that re-includes
// template/).
const OXLINT_CONFIGS: readonly string[] = [
  '.config/fleet/oxlintrc.json',
  '.config/repo/oxlintrc.dogfood.json',
  '.config/repo/oxlintrc.json',
]

interface OxlintConfigShape {
  ignorePatterns?: string[] | undefined
}

/**
 * The protected-vendored globs a `!` re-include leaves re-exposed in one
 * ignorePatterns array: present in the list but last-seen BEFORE the last
 * negation (so the negation re-includes them). Empty = safe. Pure.
 */
export function reexposedVendored(patterns: readonly string[]): string[] {
  let lastNeg = -1
  for (let i = 0, { length } = patterns; i < length; i += 1) {
    if (patterns[i]!.startsWith('!')) {
      lastNeg = i
    }
  }
  if (lastNeg === -1) {
    return []
  }
  const out: string[] = []
  for (let i = 0, { length } = PROTECTED_VENDORED_GLOBS; i < length; i += 1) {
    const glob = PROTECTED_VENDORED_GLOBS[i]!
    const lastIdx = patterns.lastIndexOf(glob)
    if (lastIdx !== -1 && lastIdx < lastNeg) {
      out.push(glob)
    }
  }
  return out
}

/**
 * Offending `<config>: <re-exposed globs>` lines across the wheelhouse oxlint
 * configs. Empty when every config keeps its vendored excludes un-overridable.
 */
export function findReexposedVendored(repoRoot: string): string[] {
  const offenders: string[] = []
  for (let i = 0, { length } = OXLINT_CONFIGS; i < length; i += 1) {
    const rel = OXLINT_CONFIGS[i]!
    const abs = path.join(repoRoot, rel)
    if (!existsSync(abs)) {
      continue
    }
    let cfg: OxlintConfigShape
    try {
      cfg = JSON.parse(readFileSync(abs, 'utf8')) as OxlintConfigShape
    } catch {
      continue
    }
    const patterns = Array.isArray(cfg.ignorePatterns) ? cfg.ignorePatterns : []
    const exposed = reexposedVendored(patterns)
    if (exposed.length) {
      offenders.push(`${rel}: ${exposed.join(', ')}`)
    }
  }
  return offenders
}

function main(): number {
  const offenders = findReexposedVendored(REPO_ROOT)
  if (offenders.length) {
    logger.fail(
      '[lint-configs-protect-vendored] a `!` re-include re-exposes vendored files to lint/--fix:',
    )
    for (let i = 0, { length } = offenders; i < length; i += 1) {
      logger.error(`  ✗ ${offenders[i]!}`)
    }
    logger.error(
      '  Move the protected-vendored globs AFTER the last `!` negation so the',
    )
    logger.error('  gitignore last-match keeps them excluded from lint + --fix.')
    process.exitCode = 1
    return 1
  }
  if (!process.argv.includes('--quiet')) {
    logger.success(
      '[lint-configs-protect-vendored] vendored exclusions are not re-includable.',
    )
  }
  return 0
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main()
}
