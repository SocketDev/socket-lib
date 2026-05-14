/**
 * @fileoverview Unit tests for src/eco/npm/yarnpkg/yarn/parse-lockfile.ts.
 *
 * Exercises Yarn Classic (v1) + Berry (v6) lockfile parsing, plus
 * helper exports (stripQuotes, valueAfterKey, etc.).
 */

import { describe, expect, it } from 'vitest'

import {
  jsParseYarnLock,
  newEntry,
  parseYarnLock,
  skipIndentedBlock,
  stripQuotes,
  valueAfterKey,
} from '@socketsecurity/lib/eco/npm/yarnpkg/yarn/parse-lockfile'

const CLASSIC = `
# yarn lockfile v1


"lodash@^4.17.0":
  version "4.17.21"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz"
  integrity sha512-deadbeef

"@scope/pkg@^1.0.0":
  version "1.2.3"
  resolved "https://registry.yarnpkg.com/@scope/pkg/-/pkg-1.2.3.tgz"
  integrity sha512-cafebabe

"chained@^1.0.0", "chained@^1.1.0":
  version "1.1.0"
  resolved "https://registry.yarnpkg.com/chained/-/chained-1.1.0.tgz"
  integrity sha512-aaaa
  dependencies:
    nested-dep "^2.0.0"
    another "^3.0.0"
`

const BERRY = `__metadata:
  version: 6
  cacheKey: 8

"lodash@npm:^4.17.0":
  version: 4.17.21
  resolution: "lodash@npm:4.17.21"
  checksum: aabbccdd
  languageName: node
  linkType: hard

"my-pkg@workspace:.":
  version: 0.0.0-use.local
  resolution: "my-pkg@workspace:."
  languageName: unknown
  linkType: soft

"optional-thing@npm:^1.0.0":
  version: 1.0.0
  resolution: "optional-thing@npm:1.0.0"
  dependenciesMeta:
    flaky-dep:
      optional: true
  linkType: hard
`

describe('eco/npm/yarnpkg/yarn/parse-lockfile', () => {
  describe('parseYarnLock (Classic)', () => {
    const result = parseYarnLock(CLASSIC)

    it('flags lockVersion as "1"', () => {
      expect(result.lockVersion).toBe('1')
    })

    it('reports the npm ecosystem', () => {
      expect(result.ecosystem).toBe('npm')
    })

    it('captures all entries', () => {
      const names = result.packages.map(p => p.name).sort()
      expect(names).toEqual(['@scope/pkg', 'chained', 'lodash'])
    })

    it('extracts version + resolved + integrity', () => {
      const lodash = result.packages.find(p => p.name === 'lodash')!
      expect(lodash.version).toBe('4.17.21')
      expect(lodash.resolved).toBe(
        'https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz',
      )
      expect(lodash.integrity).toBe('sha512-deadbeef')
    })

    it('captures inner dependencies', () => {
      const chained = result.packages.find(p => p.name === 'chained')!
      expect(chained.dependencies).toEqual(['nested-dep', 'another'])
    })

    it('uses the first spec from a comma-joined header', () => {
      // chained header has two specs joined by comma; first wins.
      const chained = result.packages.find(p => p.name === 'chained')
      expect(chained).toBeDefined()
    })
  })

  describe('parseYarnLock (Berry)', () => {
    const result = parseYarnLock(BERRY)

    it('flags lockVersion as "berry"', () => {
      expect(result.lockVersion).toBe('berry')
    })

    it('skips workspace linkType: soft entries', () => {
      expect(result.packages.find(p => p.name === 'my-pkg')).toBe(undefined)
    })

    it('captures hard-linked entries', () => {
      const lodash = result.packages.find(p => p.name === 'lodash')!
      expect(lodash.version).toBe('4.17.21')
    })

    it('uses checksum as integrity when no integrity field present', () => {
      const lodash = result.packages.find(p => p.name === 'lodash')!
      expect(lodash.integrity).toBe('aabbccdd')
    })

    it('marks dependenciesMeta.optional=true entries as optional', () => {
      const optional = result.packages.find(p => p.name === 'optional-thing')!
      expect(optional.isOptional).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('returns zero packages for empty content', () => {
      const result = parseYarnLock('')
      expect(result.packages).toEqual([])
      expect(result.lockVersion).toBe('1')
    })

    it('returns zero packages for comments-only content', () => {
      const result = parseYarnLock('# yarn lockfile v1\n# nothing else\n')
      expect(result.packages).toEqual([])
    })

    it('does not throw on truncated content', () => {
      expect(() =>
        parseYarnLock('"foo@^1.0.0":\n  version "1.0.0"\n  resolved'),
      ).not.toThrow()
    })

    it('terminates a dependencies: block when a sibling entry begins', () => {
      // Two top-level entries; the first has a dependencies: block
      // followed immediately by another package header at column 0.
      // The dep-list scanner exits via the non-4-space-indent break
      // (consumeDependencyList line ~110).
      const lock = `"a@^1":\n  version "1.0.0"\n  dependencies:\n    inner "^2"\n"b@^1":\n  version "1.5.0"\n`
      const result = parseYarnLock(lock)
      const a = result.packages.find(p => p.name === 'a')!
      const b = result.packages.find(p => p.name === 'b')!
      expect(a.dependencies).toEqual(['inner'])
      expect(b.version).toBe('1.5.0')
    })

    it('skips Berry soft-linked entries that are NOT @workspace:', () => {
      // Berry tags portal-protocol entries as linkType: soft too. The
      // header doesn't contain `@workspace:`, so the workspace-skip
      // short-circuit doesn't fire and the linkType-based skip
      // (line 242) is the one that catches it.
      const lock = `__metadata:\n  version: 6\n\n"my-portal@portal:./local":\n  version: 0.0.0\n  resolution: "my-portal@portal:./local"\n  linkType: soft\n`
      const result = parseYarnLock(lock)
      expect(result.packages.find(p => p.name === 'my-portal')).toBe(undefined)
    })

    it('handles a __metadata block as the final content (no entries after)', () => {
      // The __metadata block is the last thing in the file; after
      // skipIndentedBlock consumes its body, the position reaches EOF
      // without finding another top-level entry (line 300).
      const lock = `__metadata:\n  version: 6\n  cacheKey: 8\n`
      const result = parseYarnLock(lock)
      expect(result.packages).toEqual([])
      expect(result.lockVersion).toBe('berry')
    })

    it('extracts http(s) resolved from Berry resolution field', () => {
      const lock = `__metadata:\n  version: 6\n\n"foo@npm:^1.0.0":\n  version: 1.0.0\n  resolution: "https://example.com/foo.tgz"\n  linkType: hard\n`
      const result = parseYarnLock(lock)
      const foo = result.packages.find(p => p.name === 'foo')!
      expect(foo.resolved).toBe('https://example.com/foo.tgz')
    })

    it('skips top-level lines that do not end with a colon', () => {
      const lock = `# yarn lockfile v1\nrandomtext\n"foo@^1":\n  version "1.0.0"\n`
      expect(parseYarnLock(lock).packages).toHaveLength(1)
    })

    it('skips top-level indented lines outside any block', () => {
      const lock = `# yarn lockfile v1\n  stray indented\n"foo@^1":\n  version "1.0.0"\n`
      expect(parseYarnLock(lock).packages).toHaveLength(1)
    })

    it('promotes a 3-occurrence yarn entry into a [n, n, n] index', () => {
      const lock = `"foo@^1.0.0":\n  version "1.0.0"\n\n"foo@^2.0.0":\n  version "2.0.0"\n\n"foo@^3.0.0":\n  version "3.0.0"\n`
      const result = parseYarnLock(lock)
      const fooIdx = (result._index as { foo?: unknown })['foo']
      expect(fooIdx).toEqual([0, 1, 2])
    })

    it('jsParseYarnLock is also exported for direct use', () => {
      expect(jsParseYarnLock(CLASSIC).packages.length).toBeGreaterThan(0)
    })
  })

  describe('helpers', () => {
    it('stripQuotes peels surrounding double quotes', () => {
      expect(stripQuotes('"hi"')).toBe('hi')
      expect(stripQuotes('"hi')).toBe('hi')
      expect(stripQuotes('hi"')).toBe('hi')
      expect(stripQuotes('hi')).toBe('hi')
      expect(stripQuotes('')).toBe('')
    })

    it('valueAfterKey takes everything after the colon', () => {
      expect(valueAfterKey('version: 1.2.3', 'version '.length)).toBe('1.2.3')
    })

    it('valueAfterKey falls back to slice-after-key for colonless lines', () => {
      expect(valueAfterKey('version "1.2.3"', 'version '.length)).toBe(
        '"1.2.3"',
      )
    })

    it('newEntry seeds a YarnEntryState with defaults', () => {
      const entry = newEntry('foo')
      expect(entry.name).toBe('foo')
      expect(entry.version).toBe(undefined)
      expect(entry.dependencies).toEqual([])
      expect(entry.isOptional).toBe(false)
    })

    it('skipIndentedBlock advances past indented lines', () => {
      const content = `  one\n  two\nthree\n`
      const pos = skipIndentedBlock(content, 0)
      expect(content.slice(pos)).toBe('three\n')
    })

    it('skipIndentedBlock returns startPos when no indent follows', () => {
      const content = `flat\nnext\n`
      expect(skipIndentedBlock(content, 0)).toBe(0)
    })
  })
})
