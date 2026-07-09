// Repo check — no barrel exports in @socketsecurity/lib.
//
// A "barrel" export is a package.json `exports` entry that either:
//   (a) is a single-segment namespace key whose source is an `index.*` file —
//       the classic re-export barrel pattern; or
//   (b) is a single-segment namespace key with sub-entries under the same
//       namespace (e.g. `./foo` alongside `./foo/bar`, `./foo/baz`) — a
//       convenience alias that shadows the canonical per-module paths.
//
// Both forms push tree-shaking onto bundlers, blur the API surface, and create
// a second public path for the same code. The fleet mandate: every symbol is
// reachable through exactly one canonical path; node/browser routers
// (./http-request, ./logger) are the only allowed single-segment entries because
// they perform a capability/environment swap — browser default ≠ node default.
//
// COMPAT ALLOWLIST — entries that pre-date this rule and are kept for backward
// compatibility while consumers migrate. New barrels are never allowed.
//   - ./native-messaging: index.ts barrel; consumers must migrate to the
//       per-module paths (./native-messaging/host, /install, /rate-limit, /run)
// NOTE: ./errors was removed from the allowlist — it is no longer exported.
//   Consumers must use @socketsecurity/lib/errors/message instead.
//
// Usage: node scripts/repo/check/no-barrel-exports-are-present.mts [--quiet]

import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { getDefaultLogger } from '@socketsecurity/lib-stable/logger/default'

import { REPO_ROOT } from '../../fleet/paths.mts'

const logger = getDefaultLogger()

// Capability/environment swaps: browser default differs from node default.
// These are not barrels — they route to the correct implementation per env.
function isEnvSwap(entry: Record<string, unknown>): boolean {
  const browser = entry['browser']
  if (!browser || typeof browser !== 'object') {
    return false
  }
  const browserDefault = (browser as Record<string, unknown>)['default']
  const nodeDefault = entry['default']
  return (
    typeof browserDefault === 'string' &&
    typeof nodeDefault === 'string' &&
    browserDefault !== nodeDefault
  )
}

// Exports that are known legacy compat entries — they pre-date this rule and
// are preserved for backward compat while consumers migrate.
// No new entries may be added here; the check fails on any barrel not in this set.
export const COMPAT_ALLOWLIST = new Set<string>([
  // Classic index.ts barrel. Migrate: import from the per-module subpaths
  // (./native-messaging/host, ./native-messaging/install,
  //  ./native-messaging/rate-limit, ./native-messaging/run).
  './native-messaging',
])

export interface BarrelFinding {
  readonly key: string
  readonly source: string
  readonly reason: 'index_source' | 'namespace_alias'
}

export function detectBarrels(
  exports: Record<string, unknown>,
): BarrelFinding[] {
  const findings: BarrelFinding[] = []

  const keys = Object.keys(exports)

  for (let i = 0, { length } = keys; i < length; i += 1) {
    const key = keys[i]!
    if (key === './package.json') {
      continue
    }

    const entry = exports[key]
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue
    }

    const entryRecord = entry as Record<string, unknown>

    // Only check single-segment namespace keys: './foo' (not './foo/bar').
    const stripped = key.startsWith('./') ? key.slice(2) : key
    if (stripped.includes('/')) {
      continue
    }

    // Env/capability swaps are explicitly allowed.
    if (isEnvSwap(entryRecord)) {
      continue
    }

    const source =
      typeof entryRecord['source'] === 'string' ? entryRecord['source'] : ''

    // (a) Classic barrel: source file named index.* .
    // oxlint-disable-next-line socket/no-source-sniffing -- path-name check only: matching the filename (package.json `exports.source` field) to detect index.* entry points, not inspecting file text content
    if (/\/index\.[mc]?[jt]s$/.test(source)) {
      findings.push({ key, source, reason: 'index_source' })
      continue
    }

    // (b) Namespace alias: sub-entries exist under the same namespace.
    const namespace = `${key}/`
    const hasSubs = keys.some(k => k.startsWith(namespace))
    if (hasSubs) {
      findings.push({ key, source, reason: 'namespace_alias' })
    }
  }

  return findings
}

export function main(): void {
  const isQuiet = process.argv.includes('--quiet')
  const pkgPath = path.join(REPO_ROOT, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    exports?: Record<string, unknown> | undefined
  }
  const exports = pkg.exports ?? {}

  const findings = detectBarrels(exports)

  const newBarrels = findings.filter(f => !COMPAT_ALLOWLIST.has(f.key))
  const legacyBarrels = findings.filter(f => COMPAT_ALLOWLIST.has(f.key))

  if (!isQuiet && legacyBarrels.length > 0) {
    for (let i = 0, { length } = legacyBarrels; i < length; i += 1) {
      const f = legacyBarrels[i]!
      logger.warn(
        `[no-barrel-exports] compat shim (pending migration): ${f.key} → ${f.source} (${f.reason})`,
      )
    }
  }

  if (newBarrels.length > 0) {
    for (let i = 0, { length } = newBarrels; i < length; i += 1) {
      const f = newBarrels[i]!
      logger.error(
        `[no-barrel-exports] barrel export not allowed: ${f.key} → ${f.source} (${f.reason})`,
      )
    }
    logger.error(
      `[no-barrel-exports] ${newBarrels.length} new barrel(s) found. ` +
        `Use per-module subpaths instead. Env/capability swaps (browser≠node) are exempt.`,
    )
    process.exitCode = 1
    return
  }

  if (!isQuiet) {
    logger.log('[no-barrel-exports] ok — no new barrel exports detected')
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
