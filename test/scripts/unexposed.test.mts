/**
 * @file Specs for scripts/repo/build-stubs/unexposed — the static export-name
 *   collector and the stub-module generator that compile fleet-unused leaves
 *   out of the published build.
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  collectRuntimeExportNames,
  makeUnexposedModuleSource,
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
