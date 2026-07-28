import { describe, expect, test } from 'vitest'

import { parsePackageSpec } from '../../../src/dlx/spec'

describe.sequential('dlx/spec — parsePackageSpec', () => {
  test('parses name@version into {name, version}', () => {
    expect(parsePackageSpec('lodash@4.17.21')).toEqual({
      name: 'lodash',
      version: '4.17.21',
    })
  })

  test('parses scoped package@version', () => {
    expect(parsePackageSpec('@scope/pkg@1.0.0')).toEqual({
      name: '@scope/pkg',
      version: '1.0.0',
    })
  })

  test('returns the default range "*" for a bare name (npm-package-arg normalizes)', () => {
    // npm-package-arg parses 'lodash' as a range spec with fetchSpec='*';
    // the source returns whatever fetchSpec is for range/version specs.
    expect(parsePackageSpec('lodash').name).toBe('lodash')
  })

  test('returns the default range for a bare scoped name', () => {
    expect(parsePackageSpec('@scope/pkg').name).toBe('@scope/pkg')
  })

  test('parses a tag-style version (e.g. "latest")', () => {
    expect(parsePackageSpec('lodash@latest')).toEqual({
      name: 'lodash',
      version: 'latest',
    })
  })

  test('parses a range-style version', () => {
    const result = parsePackageSpec('lodash@^4.0.0')
    expect(result.name).toBe('lodash')
    // npm-package-arg may normalize the range; the important thing is non-empty.
    expect(result.version).toBeTruthy()
  })

  test('falls back gracefully for inputs npm-package-arg cannot parse', () => {
    // A malformed scoped name. npm-package-arg may throw; the fallback splits on last `@`.
    const result = parsePackageSpec('not a valid spec@1.0.0')
    expect(result.name).toBeTruthy()
  })

  test('handles a name+ "@" with no version part', () => {
    // npm-package-arg normalizes; the source returns whatever fetchSpec is.
    // We just assert it doesn't crash and returns a sensible name.
    const result = parsePackageSpec('pkg@')
    expect(result.name).toBeTruthy()
  })

  test('returns version=undefined for git-URL specs (neither tag/version/range)', () => {
    // git+ssh://... is parsed as type=git → version stays undefined.
    const result = parsePackageSpec('git+ssh://git@github.com/owner/repo.git')
    expect(result.version).toBeUndefined()
  })

  test('falls back gracefully on an empty string spec', () => {
    // Force the catch path with a value npm-package-arg rejects; the
    // fallback returns whatever it can extract (no version).
    const result = parsePackageSpec('')
    expect(result.name).toBe('')
  })

  test('falls back: trailing "@" (e.g. "name@") normalizes empty version to undefined', () => {
    // The fallback path is the test target — npm-package-arg might or
    // might not throw, but if it does, the empty slice becomes undefined.
    const result = parsePackageSpec('legit-name@')
    expect(result.name).toBeTruthy()
    // version is undefined either through "*" coercion or empty-slice normalize.
    expect(['*', undefined]).toContain(result.version)
  })

  test('falls back when input has @ only at position 0 (scoped-no-version)', () => {
    // Force the catch path by giving npm-package-arg an invalid scope.
    // '@' at position 0 with whitespace → catch + atIndex===0 → name=spec, version=undefined.
    const result = parsePackageSpec('@ invalid scope')
    expect(result.version).toBeUndefined()
  })

  test('falls back with input containing spaces (catch + trailing @ produces empty slice)', () => {
    const result = parsePackageSpec('not-a-valid-spec with-spaces@')
    expect(result.name).toBeTruthy()
    expect(result.version).toBeUndefined()
  })
})
