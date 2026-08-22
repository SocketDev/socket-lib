/*
 * @file Unit tests for the test262 runner's pure modules.
 *
 *   The classifier is the one that can hide a regression, so every
 *   pass/fail x allowed/disallowed transition is driven, plus the two states
 *   that read as green but are not: an empty run and a stale allowlist.
 */

import { describe, expect, it } from 'vitest'

import {
  classify,
  exitCodeFor,
  isAllowed,
  summarize,
} from '../scripts/test262/classifier.mts'
import {
  findUncoveredDirs,
  parseSparseCheckout,
} from '../scripts/test262/config.mts'
import { composePrelude, isFixture } from '../scripts/test262/harness.mts'
import { ASYNC_PASS_MARKER, judgeRun } from '../scripts/test262/executor.mts'
import {
  parseFlags,
  parseIncludes,
  parseTestMeta,
} from '../scripts/test262/parser.mts'
import { formatSummary } from '../scripts/test262/report.mts'

import type { FeatureConfig, TestCase } from '../scripts/test262/types.mts'

const PASS = {
  id: 'test/built-ins/Promise/try/example.js',
  output: '',
  passed: true,
}
const FAIL = {
  id: 'test/built-ins/Promise/try/example.js',
  output: 'Test262Error',
  passed: false,
}

describe('classifier', () => {
  it('an unlisted pass is an expected pass', () => {
    expect(classify(PASS, [])).toBe('expected-pass')
  })

  it('an unlisted failure is an unexpected failure', () => {
    expect(classify(FAIL, [])).toBe('unexpected-fail')
  })

  it('a listed failure is a known failure', () => {
    expect(classify(FAIL, [FAIL.id])).toBe('expected-fail')
  })

  it('a listed pass is now-passing, so the allowlist is stale', () => {
    expect(classify(PASS, [PASS.id])).toBe('now-passing')
  })

  it('matches a directory allowlist entry by prefix', () => {
    expect(isAllowed(FAIL.id, ['test/built-ins/Promise/try/'])).toBe(true)
  })

  it('does not treat a prefix without a slash as a directory', () => {
    expect(
      isAllowed('test/built-ins/PromiseOther/resolve.js', [
        'test/built-ins/Promise',
      ]),
    ).toBe(false)
  })

  it('reports an allowlist entry that matched nothing', () => {
    const summary = summarize([PASS], ['test/built-ins/Map/groupBy/gone.js'])
    expect(summary.staleAllowlist).toEqual([
      'test/built-ins/Map/groupBy/gone.js',
    ])
  })

  it('does not report an entry that matched by prefix', () => {
    const summary = summarize([FAIL], ['test/built-ins/Promise/try/'])
    expect(summary.staleAllowlist).toEqual([])
  })
})

describe('exitCodeFor', () => {
  it('is zero when every test passed and nothing is stale', () => {
    expect(exitCodeFor(summarize([PASS], []))).toBe(0)
  })

  it('is non-zero for an unexpected failure', () => {
    expect(exitCodeFor(summarize([FAIL], []))).toBe(1)
  })

  it('is non-zero for a now-passing test', () => {
    expect(exitCodeFor(summarize([PASS], [PASS.id]))).toBe(1)
  })

  it('is non-zero for a stale allowlist entry', () => {
    expect(
      exitCodeFor(summarize([PASS], ['test/built-ins/Map/groupBy/gone.js'])),
    ).toBe(1)
  })

  it('is non-zero for an empty run, which is not a pass', () => {
    // An unfetched submodule walks nothing; reporting success there would make
    // the gate green while measuring no behavior at all.
    expect(exitCodeFor(summarize([], []))).toBe(1)
  })
})

describe('async tests', () => {
  const asyncCase = {
    meta: parseTestMeta('/*---\nflags: [async]\n---*/'),
  } as TestCase

  it('reads the async flag', () => {
    expect(asyncCase.meta.async).toBe(true)
  })

  it('requires the completion marker, so a silent clean exit fails', () => {
    // An async test that never reaches $DONE exits zero having asserted
    // nothing; treating that as a pass is the trap this guards.
    expect(judgeRun(asyncCase, 0, '')).toBe(false)
  })

  it('passes when the marker is printed', () => {
    expect(judgeRun(asyncCase, 0, `${ASYNC_PASS_MARKER}\n`)).toBe(true)
  })

  it('fails when the marker is printed but the process died', () => {
    expect(judgeRun(asyncCase, 1, ASYNC_PASS_MARKER)).toBe(false)
  })
})

describe('parser', () => {
  it('reads an inline includes list', () => {
    expect(
      parseIncludes('includes: [compareArray.js, propertyHelper.js]'),
    ).toEqual(['compareArray.js', 'propertyHelper.js'])
  })

  it('reads a bulleted includes block', () => {
    expect(
      parseIncludes('includes:\n  - compareArray.js\n  - sta.js\n'),
    ).toEqual(['compareArray.js', 'sta.js'])
  })

  it('reads flags', () => {
    expect(parseFlags('flags: [onlyStrict, module]')).toEqual([
      'onlyStrict',
      'module',
    ])
  })

  it('parses a negative test with its error type', () => {
    const meta = parseTestMeta(
      '/*---\nnegative:\n  phase: parse\n  type: SyntaxError\n---*/\nvar x =',
    )
    expect(meta.negative).toBe(true)
    expect(meta.negativeType).toBe('SyntaxError')
  })

  it('treats a file with no frontmatter as a plain script', () => {
    const meta = parseTestMeta('var x = 1')
    expect(meta.negative).toBe(false)
    expect(meta.includes).toEqual([])
  })

  it('reads the strict-mode flags', () => {
    expect(parseTestMeta('/*---\nflags: [onlyStrict]\n---*/').onlyStrict).toBe(
      true,
    )
    expect(parseTestMeta('/*---\nflags: [noStrict]\n---*/').noStrict).toBe(true)
  })
})

describe('judgeRun', () => {
  const positive = { meta: parseTestMeta('var x = 1') } as TestCase
  const negative = {
    meta: parseTestMeta('/*---\nnegative:\n  type: TypeError\n---*/'),
  } as TestCase

  it('a positive test passes on exit 0', () => {
    expect(judgeRun(positive, 0, '')).toBe(true)
  })

  it('a positive test fails on a non-zero exit', () => {
    expect(judgeRun(positive, 1, 'boom')).toBe(false)
  })

  it('a negative test passes when it throws the named error', () => {
    expect(judgeRun(negative, 1, 'TypeError: nope')).toBe(true)
  })

  it('a negative test fails when it throws the wrong error', () => {
    expect(judgeRun(negative, 1, 'RangeError: nope')).toBe(false)
  })

  it('a negative test fails when it does not throw at all', () => {
    expect(judgeRun(negative, 0, '')).toBe(false)
  })
})

describe('sparse-checkout coverage', () => {
  const features: FeatureConfig[] = [
    {
      dirs: ['test/built-ins/Promise/try'],
      install: {
        export: 'promiseTryShim',
        length: 1,
        property: 'try',
        target: 'Promise',
      },
      module: 'polyfills/promise.js',
      name: 'Promise.try',
    },
  ]

  it('reads the patterns from a .gitmodules body', () => {
    const patterns = parseSparseCheckout(
      '[submodule "upstream/test262"]\n\tsparse-checkout = harness/ test/built-ins/Promise/try/\n',
    )
    expect(patterns).toEqual(['harness/', 'test/built-ins/Promise/try/'])
  })

  it('a covering pattern leaves nothing uncovered', () => {
    expect(
      findUncoveredDirs(features, ['test/built-ins/Promise/try/']),
    ).toEqual([])
  })

  it('a parent pattern covers a nested directory', () => {
    expect(findUncoveredDirs(features, ['test/built-ins/'])).toEqual([])
  })

  it('names a directory no pattern covers', () => {
    // The failure this exists to catch: a feature added to features.json while
    // .gitmodules still fetches only the old subtree, so the run finds no tests.
    expect(findUncoveredDirs(features, ['harness/'])).toEqual([
      'test/built-ins/Promise/try',
    ])
  })
})

describe('prelude composition', () => {
  it('drops the receiver when no mode is declared', () => {
    const prelude = composePrelude(
      {
        dirs: [],
        install: {
          export: 'promiseTryShim',
          length: 1,
          property: 'try',
          target: 'Promise',
        },
        module: 'polyfills/promise.js',
        name: 'Promise.try',
      },
      '/repo/dist',
    )
    expect(prelude).toContain('promiseTryShim as shim')
    expect(prelude).toContain('value: 1')
    expect(prelude).toContain('shim(...args)')
  })

  it('uses a computed key, so a reserved word installs and cannot construct', () => {
    // `function try()` is a SyntaxError, and a plain function is constructible
    // while a spec method is not. Method shorthand fixes both.
    const prelude = composePrelude(
      {
        dirs: [],
        install: {
          export: 'promiseTrySpecShim',
          length: 1,
          property: 'try',
          receiverAs: 'this',
          target: 'Promise',
        },
        module: 'polyfills/promise.js',
        name: 'Promise.try',
      },
      '/repo/dist',
    )
    expect(prelude).toContain('{ [property](...args)')
    expect(prelude).not.toContain('function try')
    expect(prelude).toContain('shim.call(this, ...args)')
  })

  it('passes the receiver as the first argument for an array shim', () => {
    const prelude = composePrelude(
      {
        dirs: [],
        install: {
          export: 'arrayToSortedShim',
          length: 1,
          property: 'toSorted',
          receiverAs: 'argument',
          target: 'Array.prototype',
        },
        module: 'polyfills/array.js',
        name: 'Array.prototype.toSorted',
      },
      '/repo/dist',
    )
    expect(prelude).toContain('shim(this, ...args)')
    // Array.prototype additions are unscopable, and test262 checks it.
    expect(prelude).toContain('Symbol.unscopables')
  })
})

describe('report', () => {
  it('says an empty run is not a pass', () => {
    expect(formatSummary(summarize([], []))).toContain('NOT a pass')
  })

  it('leads with the failures', () => {
    const text = formatSummary(summarize([FAIL], []))
    expect(text.startsWith('FAIL ')).toBe(true)
  })

  it('names a now-passing test as an allowlist removal', () => {
    expect(formatSummary(summarize([PASS], [PASS.id]))).toContain('NOW PASSING')
  })
})

describe('isFixture', () => {
  it('excludes a _FIXTURE file, which fails on its own', () => {
    expect(isFixture('example_FIXTURE.js')).toBe(true)
    expect(isFixture('example.js')).toBe(false)
  })
})
