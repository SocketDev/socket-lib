/**
 * @file Specs for scripts/repo/build-stubs/unexposed — the static export-name
 *   collector and the stub-module generator that compile fleet-unused leaves
 *   out of the published build.
 */

import { describe, expect, it } from 'vitest'

import {
  collectRuntimeExportNames,
  makeUnexposedModuleSource,
  STUB_BANNER,
} from '../../scripts/repo/build-stubs/unexposed.mts'

describe('collectRuntimeExportNames', () => {
  it('reads literal exports assignments, deduped and sorted', () => {
    const names = collectRuntimeExportNames(
      [
        "'use strict';",
        'exports.beta = beta;',
        'exports.alpha = alpha;',
        'exports.alpha = alphaAgain;',
        'const x = { exports: 1 };',
      ].join('\n'),
    )
    expect(names).toEqual(['alpha', 'beta'])
  })

  it('returns empty for a module.exports= shaped module', () => {
    expect(collectRuntimeExportNames('module.exports = thing;')).toEqual([])
  })
})

describe('makeUnexposedModuleSource', () => {
  it('emits a banner-marked module whose named exports throw on use', () => {
    const source = makeUnexposedModuleSource('archives/extract', [
      'extractArchive',
    ])
    expect(source.startsWith(STUB_BANNER)).toBe(true)
    const moduleShim = { exports: {} as Record<string, () => unknown> }
    // oxlint-disable-next-line no-new-func -- evaluating the generated CJS module body is the test.
    new Function('exports', 'module', source)(moduleShim.exports, moduleShim)
    expect(Object.keys(moduleShim.exports)).toEqual(['extractArchive'])
    expect(() => moduleShim.exports['extractArchive']!()).toThrow(
      /extractArchive is compiled out of this @socketsecurity\/lib build/,
    )
    expect(() => moduleShim.exports['extractArchive']!()).toThrow(
      /open an issue at https:\/\/github\.com\/SocketDev\/socket-lib\/issues/,
    )
  })
})
