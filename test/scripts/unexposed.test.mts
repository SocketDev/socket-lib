/**
 * @file Specs for scripts/repo/build-stubs/unexposed — the static export-name
 *   collector, the stub-module generator that compiles fleet-unused leaves out
 *   of the published build, and the roster-coverage record that says which
 *   fleet the stub list was actually judged against.
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  collectRuntimeExportNames,
  makeUnexposedModuleSource,
  rosterCoverageGap,
  STUB_BANNER,
} from '../../scripts/repo/build-stubs/unexposed.mts'

const requireHere = createRequire(import.meta.url)

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
    const stubDir = mkdtempSync(path.join(os.tmpdir(), 'unexposed-stub-'))
    const stubPath = path.join(stubDir, 'extract.js')
    writeFileSync(stubPath, source)
    const stub = requireHere(stubPath) as Record<string, () => unknown>
    expect(Object.keys(stub)).toEqual(['extractArchive'])
    expect(() => stub['extractArchive']!()).toThrow(
      /extractArchive is compiled out of this @socketsecurity\/lib build/,
    )
    // The error is the whole detection mechanism, so it has to name the
    // remediation for the leaf it fired on — not a generic link someone then
    // has to translate into an edit.
    expect(() => stub['extractArchive']!()).toThrow(
      /node scripts\/repo\/expose-leaf\.mts archives\/extract/,
    )
    // The issue link survives as the fallback for anyone without a checkout.
    expect(() => stub['extractArchive']!()).toThrow(
      /https:\/\/github\.com\/SocketDev\/socket-lib\/issues/,
    )
  })
})

// The stub list is a claim about the WHOLE fleet: "no member imports this leaf,
// so it is safe to compile out". That claim is only as good as the set of
// consumers actually scanned, and the list historically stored the conclusion
// without the evidence — so a list computed against a smaller fleet was
// indistinguishable from a correct one. A leaf only one member imports stayed
// stubbed after that member joined, and shipped as a module that throws when
// that member calls it. These cover the pure comparison; the writer's own
// refusal to write a list while a roster checkout is absent needs a filesystem
// and is asserted separately.
describe('rosterCoverageGap', () => {
  it('reports no gap when the recorded roster matches', () => {
    expect(rosterCoverageGap(['alpha', 'beta'], ['alpha', 'beta'])).toEqual({
      missing: [],
      stale: [],
    })
  })

  it('order does not matter', () => {
    expect(rosterCoverageGap(['beta', 'alpha'], ['alpha', 'beta'])).toEqual({
      missing: [],
      stale: [],
    })
  })

  it('catches a member the list was never judged against', () => {
    // The shape of the real incident: a member joins, the list predates it,
    // and every leaf only that member imports still reads as fleet-unused.
    expect(rosterCoverageGap(['alpha', 'beta'], ['alpha'])).toEqual({
      missing: ['beta'],
      stale: [],
    })
  })

  it('catches a departed member the list still records', () => {
    expect(rosterCoverageGap(['alpha'], ['alpha', 'gamma'])).toEqual({
      missing: [],
      stale: ['gamma'],
    })
  })

  it('reports both directions at once', () => {
    expect(rosterCoverageGap(['alpha', 'beta'], ['alpha', 'gamma'])).toEqual({
      missing: ['beta'],
      stale: ['gamma'],
    })
  })

  it('a list with NO recorded roster is fully uncovered, never a pass', () => {
    // The pre-record state. An empty record must read as "judged against
    // nothing", not as "nothing to check".
    expect(rosterCoverageGap(['alpha', 'beta'], [])).toEqual({
      missing: ['alpha', 'beta'],
      stale: [],
    })
  })

  it('sorts both lists so the message is stable', () => {
    const gap = rosterCoverageGap(['delta', 'beta', 'alpha'], [])
    expect(gap.missing).toEqual(['alpha', 'beta', 'delta'])
  })
})
