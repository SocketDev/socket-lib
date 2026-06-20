#!/usr/bin/env node
/*
 * @file Commit-time dedup gate — the code-as-law surface the
 *   `deduping-dependencies` skill cites. Parses `pnpm-lock.yaml` and reports
 *   two avoidable shapes the dedup decision tree is meant to eliminate:
 *
 *   1. CROSS-MAJOR DUPLICATES — a package resolved at more than one distinct
 *      major version in the install tree. Each extra major is dead weight
 *      (more bytes, more attack surface, bigger bundles). The skill's decision
 *      tree classifies whether a given family is collapsible; this gate just
 *      surfaces the family so it can't silently re-accumulate.
 *   2. UN-REDIRECTED DROP-INS — a package that has a known
 *      `@socketregistry/<name>` hardened drop-in (learned from the lockfile's
 *      own `overrides:` block — the fleet's curated redirect set) but is itself
 *      resolved WITHOUT that redirect. A `@socketregistry/*` drop-in is
 *      Socket-published + audited + API-transparent and soak-exempt, so an
 *      un-redirected copy is a free hardening + dedup win left on the table.
 *
 *   The judgment (which collapse is safe — format-flip vs API break, the
 *   consumer-grep) stays in the skill; this is the mechanical scan only.
 *   Reporting is informational for cross-major families (exit 0 — collapsing
 *   is a judgment call) and a hard failure for un-redirected drop-ins (exit 1
 *   — the redirect is always safe to add). No-ops when `pnpm-lock.yaml` is
 *   absent. Exit codes:
 *
 *   - 0 — no un-redirected drop-ins (cross-major families, if any, are logged)
 *   - 1 — at least one un-redirected `@socketregistry` drop-in
 */

import { readFileSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { PNPM_LOCK } from '../paths.mts'

// A `packages:` (or `snapshots:`) key: `'<name>@<version>':` where name may be
// scoped (`@scope/pkg`). Indented exactly two spaces under the section header.
const PACKAGE_KEY_RE =
  /^ {2}'?((?:@[^@/'\s]+\/)?[^@'\s]+)@([^'\s(]+)(?:\([^)]*\))*'?:\s*$/
// An `overrides:` redirect value pointing at a Socket hardened drop-in:
// `name: npm:@socketregistry/<dropin>@<version>` (quoted or bare).
const DROP_IN_OVERRIDE_RE =
  /^ {2}'?([^':\s]+)'?:\s*'?npm:@socketregistry\/([^@'\s]+)@/
// A plain (non-drop-in) override entry: `name: <value>` — used to learn which
// package names already carry SOME override (so we don't double-flag a name
// that's pinned a different way).
const ANY_OVERRIDE_RE = /^ {2}'?((?:@[^@/'\s]+\/)?[^@'\s]+)(?:@[^':]*)?'?:\s*\S/

export interface DuplicateFamily {
  name: string
  majors: string[]
}

export interface UnredirectedDropIn {
  name: string
  dropIn: string
}

export interface ScanResult {
  duplicates: DuplicateFamily[]
  unredirected: UnredirectedDropIn[]
}

// Reduce a semver-ish version string to its major component. A `0.x` package
// treats the MINOR as the breaking axis (semver's pre-1.0 rule), so
// `0.30.21` → `0.30` while `7.8.1` → `7`. Keeps a bare/odd version intact.
export function majorOf(version: string): string {
  const parts = version.split('.')
  const first = parts[0] ?? version
  if (first === '0' && parts.length > 1) {
    return `0.${parts[1]}`
  }
  return first
}

// Collect every `<name>@<version>` key under a top-level section (`packages:`
// or `snapshots:`), returning name → set of distinct versions.
function collectResolvedVersions(lines: string[]): Map<string, Set<string>> {
  const byName = new Map<string, Set<string>>()
  let inSection = false
  for (let i = 0, { length } = lines; i < length; i += 1) {
    const line = lines[i] ?? ''
    if (line === 'packages:' || line === 'snapshots:') {
      inSection = true
      continue
    }
    // A new unindented top-level key ends the section.
    if (inSection && /^[A-Za-z_]/.test(line)) {
      inSection = false
      continue
    }
    if (!inSection) {
      continue
    }
    const m = PACKAGE_KEY_RE.exec(line)
    if (!m) {
      continue
    }
    const name = m[1]!
    const version = m[2]!
    let versions = byName.get(name)
    if (!versions) {
      versions = new Set<string>()
      byName.set(name, versions)
    }
    versions.add(version)
  }
  return byName
}

// Learn the fleet's curated drop-in set + which names already carry an override
// from the lockfile's own `overrides:` block (pnpm mirrors pnpm-workspace.yaml
// here). Returns the redirect map (name → drop-in) and the set of names that
// already have ANY override entry.
function collectOverrides(lines: string[]): {
  dropIns: Map<string, string>
  overridden: Set<string>
} {
  const dropIns = new Map<string, string>()
  const overridden = new Set<string>()
  let inOverrides = false
  for (let i = 0, { length } = lines; i < length; i += 1) {
    const line = lines[i] ?? ''
    if (line === 'overrides:') {
      inOverrides = true
      continue
    }
    if (inOverrides && /^[A-Za-z_]/.test(line)) {
      inOverrides = false
      continue
    }
    if (!inOverrides) {
      continue
    }
    const dropIn = DROP_IN_OVERRIDE_RE.exec(line)
    if (dropIn) {
      dropIns.set(dropIn[1]!, dropIn[2]!)
    }
    const any = ANY_OVERRIDE_RE.exec(line)
    if (any) {
      overridden.add(any[1]!)
    }
  }
  return { dropIns, overridden }
}

export function scan(text: string): ScanResult {
  const lines = text.split('\n')
  const byName = collectResolvedVersions(lines)
  const { dropIns, overridden } = collectOverrides(lines)

  const duplicates: DuplicateFamily[] = []
  for (const [name, versions] of byName) {
    const majors = [...new Set([...versions].map(majorOf))].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    )
    if (majors.length > 1) {
      duplicates.push({ majors, name })
    }
  }
  duplicates.sort((a, b) => a.name.localeCompare(b.name))

  // The drop-in set learned from `overrides:` is the fleet's curated redirect
  // list. A package is un-redirected when it resolves in the tree, a drop-in
  // exists for its bare name, yet its name carries no override at all (so the
  // hardened copy was never wired in). A name already in `overridden` is
  // covered — even a scoped or version-pinned override counts.
  const unredirected: UnredirectedDropIn[] = []
  for (const [name, dropIn] of dropIns) {
    if (!byName.has(name)) {
      continue
    }
    if (overridden.has(name)) {
      continue
    }
    unredirected.push({ dropIn, name })
  }
  unredirected.sort((a, b) => a.name.localeCompare(b.name))

  return { duplicates, unredirected }
}

function main(): void {
  let content: string
  try {
    content = readFileSync(PNPM_LOCK, 'utf8')
  } catch {
    // No pnpm-lock.yaml — not an installed workspace, nothing to check.
    process.exit(0)
  }
  const { duplicates, unredirected } = scan(content)

  if (duplicates.length > 0) {
    process.stderr.write(
      `[check-dependencies-are-deduped] ${duplicates.length} package` +
        `${duplicates.length === 1 ? '' : 's'} resolved at >1 major ` +
        `(collapse candidates — classify with the dedup decision tree):\n`,
    )
    for (let i = 0, { length } = duplicates; i < length; i += 1) {
      const f = duplicates[i]!
      process.stderr.write(`  ${f.name}: majors ${f.majors.join(', ')}\n`)
    }
    process.stderr.write(
      `\nNot every duplicate is collapsible (format-flip vs API break) — see\n` +
        `.claude/skills/fleet/deduping-dependencies/SKILL.md before forcing.\n\n`,
    )
  }

  if (unredirected.length > 0) {
    process.stderr.write(
      `[check-dependencies-are-deduped] ${unredirected.length} package` +
        `${unredirected.length === 1 ? '' : 's'} with a @socketregistry ` +
        `drop-in but no redirect:\n`,
    )
    for (let i = 0, { length } = unredirected; i < length; i += 1) {
      const f = unredirected[i]!
      process.stderr.write(`  ${f.name} → @socketregistry/${f.dropIn}\n`)
    }
    process.stderr.write(
      `\nAdd the redirect to overrides: in pnpm-workspace.yaml (fleet-canonical\n` +
        `via FLEET_CANONICAL_OVERRIDES). A @socketregistry drop-in is audited +\n` +
        `soak-exempt — the redirect is always safe. See\n` +
        `.claude/skills/fleet/deduping-dependencies/SKILL.md.\n`,
    )
    process.exit(1)
  }

  process.exit(0)
}

// Run only when invoked directly (CLI / CI), not when imported by the unit
// tests for `scan` — `main()` calls `process.exit`, which would tear down the
// test runner mid-suite.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
