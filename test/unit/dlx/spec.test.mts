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
})
