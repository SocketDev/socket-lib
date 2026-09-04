/**
 * @file Unit tests for the text `bun.lock` parser. Fixtures are trimmed from
 *   real lockfiles, including the trailing commas bun emits.
 */

import { describe, expect, test } from 'vitest'

import {
  jsParseBunLock,
  parseBunDescriptor,
  stripTrailingCommas,
} from '../../src/eco/npm/bun/lockfile/parse.mts'

const REGISTRY_LOCK = `{
  "lockfileVersion": 1,
  "configVersion": 0,
  "workspaces": {
    "": {
      "name": "nub",
      "dependencies": {
        "@js-temporal/polyfill": "^0.5.1",
        "lodash": "^4.18.1",
      },
    },
  },
  "packages": {
    "@js-temporal/polyfill": ["@js-temporal/polyfill@0.5.1", "", { "dependencies": { "jsbi": "^4.3.0" } }, "sha512-hloP58zRVCRSpg=="],

    "jsbi": ["jsbi@4.3.2", "", {}, "sha512-9fqMSQbhJykSeii=="],

    "lodash": ["lodash@4.18.1", "", {}, "sha512-dMInicTPVE8d1e5=="],
  }
}`

const WORKSPACE_LOCK = `{
  "lockfileVersion": 1,
  "packages": {
    "@opentui/core": ["@opentui/core@workspace:packages/core"],
    "lodash": ["lodash@4.18.1", "", {}, "sha512-abc=="],
  }
}`

describe('stripTrailingCommas', () => {
  test('removes commas that close an object or array', () => {
    expect(stripTrailingCommas('{"a": 1,}')).toBe('{"a": 1}')
    expect(stripTrailingCommas('[1, 2,]')).toBe('[1, 2]')
  })

  test('keeps separating commas', () => {
    expect(stripTrailingCommas('{"a": 1, "b": 2}')).toBe('{"a": 1, "b": 2}')
  })

  test('leaves commas inside strings alone', () => {
    // A blind regex would eat this one and corrupt the value.
    const input = '{"range": ">=1, <2" }'
    expect(stripTrailingCommas(input)).toBe(input)
  })

  test('respects escaped quotes when tracking string state', () => {
    const input = '{"a": "he said \\"hi\\", ok" }'
    expect(stripTrailingCommas(input)).toBe(input)
  })
})

describe('parseBunDescriptor', () => {
  test.each([
    ['lodash@4.18.1', 'lodash', '4.18.1'],
    ['@js-temporal/polyfill@0.5.1', '@js-temporal/polyfill', '0.5.1'],
    [
      '@opentui/core@workspace:packages/core',
      '@opentui/core',
      'workspace:packages/core',
    ],
  ])('splits %s on the last @', (input, name, version) => {
    expect(parseBunDescriptor(input)).toEqual({ name, version })
  })

  test('a bare name yields an empty version', () => {
    expect(parseBunDescriptor('lodash')).toEqual({
      name: 'lodash',
      version: '',
    })
  })
})

describe('jsParseBunLock', () => {
  test('parses a registry lockfile despite trailing commas', () => {
    const result = jsParseBunLock(REGISTRY_LOCK)
    expect(result.type).toBe('lockfile')
    expect(result.ecosystem).toBe('npm')
    expect(result.lockVersion).toBe('1')
    expect(result.packages).toHaveLength(3)
  })

  test('carries name, version, and integrity through', () => {
    const result = jsParseBunLock(REGISTRY_LOCK)
    const scoped = result.packages.find(
      p => p.name === '@js-temporal/polyfill',
    )!
    expect(scoped.version).toBe('0.5.1')
    expect(scoped.integrity).toBe('sha512-hloP58zRVCRSpg==')
    expect(scoped.dependencies).toEqual(['jsbi'])
  })

  test('indexes every package by name', () => {
    const result = jsParseBunLock(REGISTRY_LOCK)
    expect(result._index['lodash']).toBe(2)
  })

  test('a workspace member has no version or integrity', () => {
    const result = jsParseBunLock(WORKSPACE_LOCK)
    const member = result.packages.find(p => p.name === '@opentui/core')!
    expect(member.version).toBe('')
    expect(member.integrity).toBeUndefined()
  })

  // Copied from a real bun.lock: a git entry has NO registry slot, so its meta
  // sits at index 1 and a fixed positional read takes the wrong one.
  test('a git entry carries vcsUrl and vcsCommit', () => {
    const result = jsParseBunLock(
      `{"lockfileVersion":1,"packages":{
        "bun-tracestrings": ["bun-tracestrings@github:oven-sh/bun.report#912ca63", { "dependencies": { "marked": "^12.0.1" } }, "oven-sh-bun.report-912ca63"]
      }}`,
    )
    const git = result.packages[0]!
    expect(git.name).toBe('bun-tracestrings')
    expect(git.vcsUrl).toBe('github:oven-sh/bun.report')
    expect(git.vcsCommit).toBe('912ca63')
    expect(git.version).toBe('')
    expect(git.dependencies).toEqual(['marked'])
  })

  test('a git entry never mistakes its resolved id for an integrity', () => {
    const result = jsParseBunLock(
      `{"lockfileVersion":1,"packages":{
        "zig-build": ["zig-build@github:solarwinds/zig-build#fa7428c", {}, "solarwinds-zig-build-fa7428c"]
      }}`,
    )
    expect(result.packages[0]!.integrity).toBeUndefined()
  })

  test('unparseable content yields an empty lockfile, not a throw', () => {
    const result = jsParseBunLock('{ this is not json')
    expect(result.packages).toHaveLength(0)
    expect(result.type).toBe('lockfile')
  })

  test('a malformed tuple is skipped rather than crashing the parse', () => {
    const result = jsParseBunLock(
      '{"lockfileVersion":1,"packages":{"a":[],"b":["b@1.0.0","",{},"sha512-x=="]}}',
    )
    expect(result.packages).toHaveLength(1)
    expect(result.packages[0]!.name).toBe('b')
  })
})
