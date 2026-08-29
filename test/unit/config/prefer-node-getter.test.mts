/**
 * @file Unit test for the repo-local oxlint rule socket-repo/prefer-node-getter
 *   (`.config/repo/oxlint-plugin/rules/prefer-node-getter.mts`).
 *   The rule's decisions live in exported pure helpers, so they are tested
 *   directly rather than through a spawned oxlint run: the interesting behavior
 *   keys off the FILENAME, and a tmpdir fixture is never under this repo's
 *   `src/`.
 *   The last case is the one that does real work. It re-derives the baseline
 *   from the tree and fails when an entry no longer imports a builtin directly,
 *   which is what makes the list shrink-only: cleaning a module up is not
 *   finished until its name leaves the baseline.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  BUILTIN_TO_GETTER,
  DIRECT_IMPORT_BASELINE,
  isExemptFile,
  wrappedBuiltinOf,
} from '../../../.config/repo/oxlint-plugin/rules/prefer-node-getter.mts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..', '..')

/**
 * A builtin import that is not type-only, matching the rule's own reading of a
 * source file. Derived from BUILTIN_TO_GETTER rather than hard-coded, so a new
 * accessor is covered without editing this test.
 */
function importsBuiltinDirectly(text: string): boolean {
  const alternation = Object.keys(BUILTIN_TO_GETTER)
    .map(name => name.replace('/', '\\/'))
    .join('|')
  // `import type …` erases at build time and the rule skips it, so the negative
  // lookahead has to be here too or a type-only import would read as a live one.
  const directImport = new RegExp(
    `^import (?!type )[^\\n]*from '(?:node:)?(?:${alternation})'`,
    'm',
  )
  return directImport.test(text)
}

describe('wrappedBuiltinOf', () => {
  it('reads a prefixed and an unprefixed specifier the same', () => {
    expect(wrappedBuiltinOf('node:fs')).toBe('fs')
    expect(wrappedBuiltinOf('fs')).toBe('fs')
  })

  it('handles a slashed builtin', () => {
    expect(wrappedBuiltinOf('node:fs/promises')).toBe('fs/promises')
    expect(wrappedBuiltinOf('node:timers/promises')).toBe('timers/promises')
  })

  it('ignores a builtin with no accessor and a bare package', () => {
    expect(wrappedBuiltinOf('node:zlib')).toBe(undefined)
    expect(wrappedBuiltinOf('semver')).toBe(undefined)
    expect(wrappedBuiltinOf('./sibling.mjs')).toBe(undefined)
  })
})

describe('isExemptFile', () => {
  it('lints a fresh library module', () => {
    expect(isExemptFile('/repo/src/fs/example-leaf.mts')).toBe(false)
  })

  it('exempts the accessors themselves', () => {
    expect(isExemptFile('/repo/src/node/fs.mts')).toBe(true)
  })

  it('exempts a baselined module', () => {
    const baselined = `/repo/${DIRECT_IMPORT_BASELINE[0]!}`
    expect(isExemptFile(baselined)).toBe(true)
  })

  it('exempts anything outside a src tree', () => {
    expect(isExemptFile('/repo/scripts/repo/bundle.mts')).toBe(true)
  })

  it('exempts a nested src belonging to a tool, script, or test', () => {
    expect(isExemptFile('/repo/tools/prim/src/cli.mts')).toBe(true)
    expect(isExemptFile('/repo/scripts/thing/src/main.mts')).toBe(true)
    expect(isExemptFile('/repo/test/helper/src/util.mts')).toBe(true)
  })

  it('reads a windows path', () => {
    expect(isExemptFile('C:\\repo\\src\\fs\\example-leaf.mts')).toBe(false)
    expect(isExemptFile('C:\\repo\\src\\node\\fs.mts')).toBe(true)
  })
})

describe('DIRECT_IMPORT_BASELINE', () => {
  it('is sorted and free of duplicates', () => {
    const deduped = [...new Set(DIRECT_IMPORT_BASELINE)].toSorted()
    expect([...DIRECT_IMPORT_BASELINE]).toEqual(deduped)
  })

  it('names no accessor, which would exempt itself twice', () => {
    const inNodeDir = DIRECT_IMPORT_BASELINE.filter(entry =>
      entry.startsWith('src/node/'),
    )
    expect(inNodeDir).toEqual([])
  })

  it('shrinks only: every entry still imports a builtin directly', () => {
    const stale: string[] = []
    for (let i = 0, { length } = DIRECT_IMPORT_BASELINE; i < length; i += 1) {
      const entry = DIRECT_IMPORT_BASELINE[i]!
      const abs = path.join(REPO_ROOT, entry)
      if (!existsSync(abs)) {
        stale.push(`${entry} (gone)`)
        continue
      }
      if (!importsBuiltinDirectly(readFileSync(abs, 'utf8'))) {
        stale.push(`${entry} (clean)`)
      }
    }
    // A non-empty list means those modules were cleaned up but left in the
    // baseline. Remove them: the list shrinks only.
    expect(stale).toEqual([])
  })
})
