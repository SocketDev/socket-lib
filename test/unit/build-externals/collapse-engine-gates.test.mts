/**
 * @file Unit tests for the collapse-engine-gates externals-build transform.
 *   The transform's contract: vendored `node.satisfies('<range>')` engine
 *   gates collapse to `true` only when the whole engines.node range is a
 *   subset of the gate range, the helper require is dropped once unused, and
 *   the supported range is derived from package.json engines.node with the
 *   fleet floor asserted — never hardcoded twice.
 */

import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'
import { afterEach, describe, expect, it } from 'vitest'

import {
  collapseEngineGates,
  readSupportedNodeRange,
} from '../../../scripts/repo/build-externals/collapse-engine-gates.mts'

const GATED_MODULE = `const fs = require('fs/promises')
const getOptions = require('../common/get-options.js')
const node = require('../common/node.js')
const polyfill = require('./polyfill.js')

const useNative = node.satisfies('>=16.7.0')

const cp = async (src, dest, opts) => {
  const options = getOptions(opts, {})
  return useNative ? fs.cp(src, dest, options) : polyfill(src, dest, options)
}

module.exports = cp
`

describe('collapseEngineGates', () => {
  it('collapses a below-floor gate to true and drops the helper require', () => {
    const out = collapseEngineGates(GATED_MODULE, '>=22')
    expect(out).toBeDefined()
    expect(out).toContain('const useNative = true')
    expect(out).not.toContain('node.satisfies')
    expect(out).not.toContain("require('../common/node.js')")
  })

  it('leaves an above-floor gate and its helper require intact', () => {
    const aboveFloor = GATED_MODULE.replace('>=16.7.0', '>=99.0.0')
    expect(collapseEngineGates(aboveFloor, '>=22')).toBeUndefined()
  })

  it('keeps the helper require when another node. use survives', () => {
    const mixed = GATED_MODULE.replace(
      'module.exports = cp',
      "const other = node.satisfies('>=99.0.0')\nmodule.exports = cp",
    )
    const out = collapseEngineGates(mixed, '>=22')
    expect(out).toBeDefined()
    expect(out).toContain('const useNative = true')
    expect(out).toContain("node.satisfies('>=99.0.0')")
    expect(out).toContain("require('../common/node.js')")
  })

  it('ignores modules without the common/node.js helper binding', () => {
    const unrelated = "const node = ast.node\nnode.satisfies('>=1.0.0')\n"
    expect(collapseEngineGates(unrelated, '>=22')).toBeUndefined()
  })

  it('leaves invalid gate ranges untouched', () => {
    const invalid = GATED_MODULE.replace('>=16.7.0', 'not-a-range')
    expect(collapseEngineGates(invalid, '>=22')).toBeUndefined()
  })
})

describe('readSupportedNodeRange', () => {
  let tmpDir: string | undefined

  afterEach(() => {
    if (tmpDir) {
      safeDeleteSync(tmpDir)
      tmpDir = undefined
    }
  })

  const writePkg = (engines: unknown): string => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'collapse-gates-'))
    writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ engines, name: 'fixture', version: '0.0.0' }),
    )
    return tmpDir
  }

  it('returns engines.node when its floor meets the fleet floor', () => {
    expect(readSupportedNodeRange(writePkg({ node: '>=18' }))).toBe('>=18')
    expect(readSupportedNodeRange(writePkg({ node: '>=22' }))).toBe('>=22')
  })

  it('throws when engines.node dips below the fleet floor', () => {
    expect(() => readSupportedNodeRange(writePkg({ node: '>=16' }))).toThrow(
      /below the fleet support floor/,
    )
  })

  it('throws when engines.node is missing or invalid', () => {
    expect(() => readSupportedNodeRange(writePkg(undefined))).toThrow(
      /missing or not a valid semver range/,
    )
    expect(() => readSupportedNodeRange(writePkg({ node: 'lol' }))).toThrow(
      /missing or not a valid semver range/,
    )
  })

  it('matches this repo: the real engines.node clears the floor', () => {
    // Behavioral tie between the transform and the shipped package.json —
    // if engines.node ever drops below the fleet floor this throws and the
    // externals build fails with it.
    const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..')
    expect(() => readSupportedNodeRange(repoRoot)).not.toThrow()
  })
})
