/*
 * @file Assert each shim's recorded Node floor still matches upstream.
 *
 *   A floor written from memory is wrong invisibly: the shim keeps working, so
 *   nothing fails until someone drops a feature believing the engine already has
 *   it. `@mdn/browser-compat-data` is the record, so the number is checked
 *   against it rather than against a comment.
 *
 *   Dev-only dependency. If a future upstream release moves a number, this test
 *   fails and the table below is updated in one place.
 */

import { createRequire } from 'node:module'

import { describe, expect, it } from 'vitest'

const load = createRequire(import.meta.url)

/**
 * The Node major each shimmed built-in first shipped in.
 */
const RECORDED_FLOORS: ReadonlyArray<readonly [string, number]> = [
  ['Map.groupBy', 21],
  ['Object.groupBy', 21],
  ['Promise.try', 23],
  ['Promise.withResolvers', 22],
]

/**
 * The nodejs `version_added` major upstream records for a builtin path.
 */
function upstreamMajor(dotted: string): number | undefined {
  const bcd = load('@mdn/browser-compat-data') as {
    javascript: { builtins: Record<string, unknown> }
  }
  let node: unknown = bcd.javascript.builtins
  const parts = dotted.split('.')
  for (let i = 0, { length } = parts; i < length; i += 1) {
    const part = parts[i]!
    if (!node || typeof node !== 'object' || !(part in node)) {
      return undefined
    }
    node = Reflect.get(node, part)
  }
  const compat =
    node !== null && typeof node === 'object'
      ? Reflect.get(node, '__compat')
      : undefined
  const support =
    compat !== null && typeof compat === 'object'
      ? Reflect.get(compat, 'support')
      : undefined
  const nodejs =
    support !== null && typeof support === 'object'
      ? Reflect.get(support, 'nodejs')
      : undefined
  const first = Array.isArray(nodejs) ? nodejs[0] : nodejs
  const added =
    first !== null && typeof first === 'object'
      ? Reflect.get(first, 'version_added')
      : undefined
  return typeof added === 'string' ? Number(added.split('.')[0]) : undefined
}

describe('recorded shim floors', () => {
  for (const [dotted, major] of RECORDED_FLOORS) {
    it(`${dotted} landed in Node ${major}`, () => {
      expect(upstreamMajor(dotted)).toBe(major)
    })
  }

  it('every recorded floor is above the supported engine floor', () => {
    // A feature at or below the floor needs no shim, so its presence here would
    // mean shipping code that can never run.
    for (const [, major] of RECORDED_FLOORS) {
      expect(major).toBeGreaterThan(18)
    }
  })

  it('reports undefined for a path upstream does not carry', () => {
    expect(upstreamMajor('Promise.definitelyNotAMethod')).toBe(undefined)
  })
})
