/**
 * @file Lazy-loader for socket-btm's `node:smol-versions`. `node:smol-versions`
 *   is the multi-ecosystem version helper exposed by socket-btm's smol Node
 *   binary. It supports npm/maven/pypi/nuget/ gem version comparison + range
 *   satisfies with internal C++ acceleration on the npm hot path. Returns
 *   `undefined` on stock Node + non-Node runtimes. Result is cached across
 *   calls.
 *
 * @internal — used by `src/versions.ts` to resolve smol-aware version
 *   ops. Most callers should use the standard `versions` exports,
 *   which already route through this when smol is present.
 */

import { isNodeBuiltin, requireBuiltin } from '../node/module'

/**
 * Surface of `node:smol-versions`. See socket-btm's
 * additions/source-patched/lib/smol-versions.js for the canonical shape. Each
 * entry takes an optional `ecosystem` (default `'npm'`) — pass it for non-npm
 * versions; npm callers can omit.
 */
export interface SmolVersionsBinding {
  compare(a: string, b: string, ecosystem?: string): -1 | 0 | 1
  eq(a: string, b: string, ecosystem?: string): boolean
  gt(a: string, b: string, ecosystem?: string): boolean
  gte(a: string, b: string, ecosystem?: string): boolean
  inc(
    version: string,
    release: 'major' | 'minor' | 'patch' | 'prerelease',
    ecosystem?: string,
    identifier?: string,
  ): string | undefined
  lt(a: string, b: string, ecosystem?: string): boolean
  lte(a: string, b: string, ecosystem?: string): boolean
  max(versions: readonly string[], ecosystem?: string): string | undefined
  maxSatisfying(
    versions: readonly string[],
    range: string,
    ecosystem?: string,
  ): string | undefined
  min(versions: readonly string[], ecosystem?: string): string | undefined
  minSatisfying(
    versions: readonly string[],
    range: string,
    ecosystem?: string,
  ): string | undefined
  neq(a: string, b: string, ecosystem?: string): boolean
  rsort(versions: readonly string[], ecosystem?: string): string[]
  satisfies(version: string, range: string, ecosystem?: string): boolean
  sort(versions: readonly string[], ecosystem?: string): string[]
  valid(version: string, ecosystem?: string): string | undefined
  filter(
    versions: readonly string[],
    range: string,
    ecosystem?: string,
  ): string[]
  coerce(version: string, ecosystem?: string): string | undefined
}

let smolVersions: SmolVersionsBinding | undefined
let smolVersionsProbed = false

/**
 * Returns `node:smol-versions` when running on the smol Node binary, otherwise
 * `undefined`. Result is cached across calls.
 */
export function getSmolVersions(): SmolVersionsBinding | undefined {
  if (!smolVersionsProbed) {
    smolVersionsProbed = true
    /* c8 ignore start - smol Node binary only. */
    if (isNodeBuiltin('node:smol-versions')) {
      // requireBuiltin passes a non-literal specifier so AOT bundlers and
      // compilers keep this optional binding external; unreached on stock Node.
      smolVersions = requireBuiltin('node:smol-versions') as SmolVersionsBinding
    }
    /* c8 ignore stop */
  }
  return smolVersions
}
