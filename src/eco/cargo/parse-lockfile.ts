/**
 * @file `parseCargoLock(content)` — parses a Rust `Cargo.lock` (v1/v2/v3/v4)
 *   into a `ParsedLockfile`. Cargo.lock uses a constrained TOML dialect: a
 *   top-level `version = N` scalar plus repeating `[[package]]` array-of-table
 *   entries. We line-scan it instead of pulling in a full TOML parser — the
 *   spec for the lockfile is stable and small (`name`, `version`, `source`,
 *   `checksum`, `dependencies = [ ... ]`), and a hand-rolled scanner is ~100×
 *   cheaper than dragging in `@iarna/toml` for one use case. `dependencies`
 *   entries come in two forms (cargo strips redundant versions when they're
 *   unambiguous):
 *
 *   - `"name 1.2.3"` — name + space-separated version
 *   - `"name"` — name only (when only one version of that crate is in the graph)
 *   - `"name 1.2.3 (registry+…)"` — name + version + source spec
 *     `parseGitUrl`-style detection here treats `source = "git+…"` as the git
 *     VCS source, with `#<rev>` as the commit pin. The parser is forgiving —
 *     unknown keys ignored, missing fields default to empty. It never throws.
 *     Source material (in lock-step order, newest → oldest):
 *
 *   1. **C++ native parser** in socket-btm/node-smol-builder:
 *      additions/source-patched/src/socketsecurity/manifest/parser_cargo.cc
 *      Same algorithm — keep the two in lock-step.
 *   2. **socket-sdxgen** — algorithm oracle, broader coverage:
 *      socket-sdxgen/src/parsers/cargo/index.mts (851 lines)
 *   3. **cdxgen** (pinned v11.11.0):
 *      https://github.com/CycloneDX/cdxgen/blob/v11.11.0/lib/parsers/rust.js
 *      (parseCargoLock)
 *   4. **Cargo's own lockfile encoder** — the source of truth for the format we're
 *      parsing:
 *      https://github.com/rust-lang/cargo/blob/0.86.0/src/cargo/core/resolver/encode.rs
 *      Lockfile format docs:
 *      https://doc.rust-lang.org/cargo/guide/cargo-toml-vs-cargo-lock.html
 *      https://doc.rust-lang.org/cargo/reference/resolver.html#lockfile-format
 *      Regression guard:
 *
 *   - `[[patch.unused]]` blocks must NOT materialize as PackageRefs. Only
 *     `[[package]]` opens an entry; any other section header (including
 *     `[[patch.unused]]`, `[metadata]`, `[patch.crates-io]`, …) closes the
 *     current entry to undefined. See the fixture under socket-btm's
 *     test/fixtures/sdxgen-bug-regressions/ cargo-patch-unused-no-leak/.
 */

import { ArrayPrototypePush } from '../../primordials/array'
import { ObjectFreeze } from '../../primordials/object'
import {
  StringPrototypeCharCodeAt,
  StringPrototypeIndexOf,
  StringPrototypeSlice,
  StringPrototypeTrim,
} from '../../primordials/string'

import type { PackageRef, ParsedLockfile } from '../manifest/types'

type PackageIndex = Record<string, number | number[]>

export interface CargoEntryState {
  name: string
  version: string
  source: string | undefined
  checksum: string | undefined
  dependencies: string[]
  inDependencies: boolean
}

export function addToCargoIndex(
  packageIndex: PackageIndex,
  name: string,
  idx: number,
): void {
  const existing = packageIndex[name]
  if (existing === undefined) {
    packageIndex[name] = idx
  } else if (typeof existing === 'number') {
    packageIndex[name] = [existing, idx]
  } else {
    ArrayPrototypePush(existing, idx)
  }
}

/**
 * Strip Cargo's `name version (source)` dependency entry down to just the crate
 * name. The version/source are advisory for cycle-breaking and not part of
 * `PackageRef.dependencies` (which is a flat list of names, matching the
 * npm/yarn/pnpm convention).
 */
export function extractCargoDepName(entry: string): string {
  // Strip surrounding quotes if present.
  let s = entry
  if (s.length > 0 && StringPrototypeCharCodeAt(s, 0) === 34) {
    s = StringPrototypeSlice(s, 1)
  }
  if (s.length > 0 && StringPrototypeCharCodeAt(s, s.length - 1) === 34) {
    s = StringPrototypeSlice(s, 0, -1)
  }
  const spaceIdx = StringPrototypeIndexOf(s, ' ')
  if (spaceIdx === -1) {
    return s
  }
  return StringPrototypeSlice(s, 0, spaceIdx)
}

export function freezeCargoEntry(entry: CargoEntryState): PackageRef {
  const git =
    entry.source !== undefined ? parseCargoGitSource(entry.source) : undefined
  return ObjectFreeze({
    __proto__: null,
    name: entry.name,
    version: entry.version,
    resolved: entry.source,
    integrity: entry.checksum,
    ecosystem: 'cargo',
    depType: 'prod',
    isDev: false,
    isOptional: false,
    isPeer: false,
    isBundled: false,
    vcsUrl: git?.url,
    vcsCommit: git?.commit,
    dependencies: entry.dependencies,
  }) as unknown as PackageRef
}

export function jsParseCargoLock(content: string): ParsedLockfile {
  const packages: PackageRef[] = []
  const packageIndex: PackageIndex = {
    __proto__: null,
  } as unknown as PackageIndex

  let lockVersion = '1'
  let currentEntry: CargoEntryState | undefined

  let pos = 0
  while (pos < content.length) {
    const eol = StringPrototypeIndexOf(content, '\n', pos)
    const end = eol === -1 ? content.length : eol
    const line = StringPrototypeSlice(content, pos, end)
    pos = end + 1

    const trimmed = StringPrototypeTrim(line)
    if (trimmed.length === 0 || trimmed[0] === '#') {
      continue
    }

    // Section header.
    if (trimmed[0] === '[') {
      // Flush prior entry.
      if (currentEntry?.name) {
        const ref = freezeCargoEntry(currentEntry)
        ArrayPrototypePush(packages, ref)
        addToCargoIndex(packageIndex, currentEntry.name, packages.length - 1)
      }
      if (trimmed === '[[package]]') {
        currentEntry = newCargoEntry()
      } else {
        // Some other section ([metadata], [patch.crates-io], etc.)
        currentEntry = undefined
      }
      continue
    }

    if (currentEntry) {
      // Multi-line dependencies array continues.
      if (currentEntry.inDependencies) {
        if (StringPrototypeIndexOf(trimmed, ']') !== -1) {
          currentEntry.inDependencies = false
          continue
        }
        // Drop trailing comma BEFORE name extraction so the closing
        // quote ends up adjacent to the value (lets extractCargoDepName
        // strip both quotes cleanly).
        const noComma =
          trimmed[trimmed.length - 1] === ','
            ? StringPrototypeSlice(trimmed, 0, -1)
            : trimmed
        const cleaned = extractCargoDepName(noComma)
        if (cleaned.length > 0) {
          ArrayPrototypePush(currentEntry.dependencies, cleaned)
        }
        continue
      }

      if (StringPrototypeIndexOf(trimmed, 'name') === 0) {
        currentEntry.name = stripTomlString(valueAfterEquals(trimmed))
      } else if (StringPrototypeIndexOf(trimmed, 'version') === 0) {
        currentEntry.version = stripTomlString(valueAfterEquals(trimmed))
      } else if (StringPrototypeIndexOf(trimmed, 'source') === 0) {
        currentEntry.source = stripTomlString(valueAfterEquals(trimmed))
      } else if (StringPrototypeIndexOf(trimmed, 'checksum') === 0) {
        currentEntry.checksum = stripTomlString(valueAfterEquals(trimmed))
      } else if (StringPrototypeIndexOf(trimmed, 'dependencies') === 0) {
        const value = valueAfterEquals(trimmed)
        // Inline form: `dependencies = [ "a", "b" ]` (single line).
        if (
          StringPrototypeIndexOf(value, '[') !== -1 &&
          StringPrototypeIndexOf(value, ']') !== -1
        ) {
          const raw = parseInlineArray(value)
          for (let i = 0, { length } = raw; i < length; i++) {
            ArrayPrototypePush(
              currentEntry.dependencies,
              extractCargoDepName(raw[i]!),
            )
          }
        } else {
          // Multi-line form: `dependencies = [` followed by lines.
          currentEntry.inDependencies = true
        }
      }
    } else {
      // Top-level scalars.
      if (StringPrototypeIndexOf(trimmed, 'version') === 0) {
        lockVersion = stripTomlString(valueAfterEquals(trimmed))
      }
    }
  }

  // Flush the last entry.
  if (currentEntry?.name) {
    const ref = freezeCargoEntry(currentEntry)
    ArrayPrototypePush(packages, ref)
    addToCargoIndex(packageIndex, currentEntry.name, packages.length - 1)
  }

  return ObjectFreeze({
    __proto__: null,
    type: 'lockfile',
    lockVersion,
    ecosystem: 'cargo',
    packages: ObjectFreeze(packages),
    _index: packageIndex,
  }) as unknown as ParsedLockfile
}

export function newCargoEntry(): CargoEntryState {
  return {
    name: '',
    version: '',
    source: undefined,
    checksum: undefined,
    dependencies: [],
    inDependencies: false,
  }
}

export function parseCargoGitSource(source: string):
  | {
      url: string
      commit: string | undefined
    }
  | undefined {
  if (StringPrototypeIndexOf(source, 'git+') !== 0) {
    return undefined
  }
  const hashIdx = StringPrototypeIndexOf(source, '#')
  if (hashIdx === -1) {
    return { url: source, commit: undefined }
  }
  return {
    url: StringPrototypeSlice(source, 0, hashIdx),
    commit: StringPrototypeSlice(source, hashIdx + 1),
  }
}

/**
 * Parse a TOML array of strings on a single line: `dependencies = [ "foo 1.0",
 * "bar 2.0" ]`. Returns the strings as raw entries (each callsite runs
 * `extractCargoDepName`).
 */
export function parseInlineArray(value: string): string[] {
  const start = StringPrototypeIndexOf(value, '[')
  const end = StringPrototypeIndexOf(value, ']')
  if (start === -1 || end === -1 || end <= start) {
    return []
  }
  const inner = StringPrototypeTrim(StringPrototypeSlice(value, start + 1, end))
  if (inner.length === 0) {
    return []
  }
  const result: string[] = []
  let i = 0
  while (i < inner.length) {
    // Skip whitespace + commas.
    while (
      i < inner.length &&
      (inner[i] === '\t' || inner[i] === ' ' || inner[i] === ',')
    ) {
      i++
    }
    if (i >= inner.length) {
      break
    }
    // Read a quoted string.
    if (StringPrototypeCharCodeAt(inner, i) === 34) {
      const closeIdx = StringPrototypeIndexOf(inner, '"', i + 1)
      if (closeIdx === -1) {
        break
      }
      ArrayPrototypePush(result, StringPrototypeSlice(inner, i + 1, closeIdx))
      i = closeIdx + 1
    } else {
      // Bare entry — read until comma or end.
      const commaIdx = StringPrototypeIndexOf(inner, ',', i)
      const next = commaIdx === -1 ? inner.length : commaIdx
      ArrayPrototypePush(
        result,
        StringPrototypeTrim(StringPrototypeSlice(inner, i, next)),
      )
      i = next
    }
  }
  return result
}

/**
 * Strip outer double-quotes from a TOML string value.
 */
export function stripTomlString(value: string): string {
  let s = StringPrototypeTrim(value)
  if (s.length > 0 && StringPrototypeCharCodeAt(s, 0) === 34) {
    s = StringPrototypeSlice(s, 1)
  }
  if (s.length > 0 && StringPrototypeCharCodeAt(s, s.length - 1) === 34) {
    s = StringPrototypeSlice(s, 0, -1)
  }
  return s
}

/**
 * Read the value half of a `key = value` TOML line. Returns the raw value text
 * (no quote stripping); callers run `stripTomlString` if they want the inner
 * string.
 */
export function valueAfterEquals(line: string): string {
  const eq = StringPrototypeIndexOf(line, '=')
  if (eq === -1) {
    return ''
  }
  return StringPrototypeTrim(StringPrototypeSlice(line, eq + 1))
}

export const parseCargoLock: (content: string) => ParsedLockfile =
  jsParseCargoLock
