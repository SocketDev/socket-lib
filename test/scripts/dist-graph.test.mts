/**
 * @file Specs for scripts/repo/build-stubs/dist-graph — the reachability leg
 *   that flags a throwing stub sitting in the require graph of shipped code.
 *   The first fixture reproduces the exact shape that shipped a dead browser
 *   transport: a leaf the fleet imports whose `browser` condition resolves to
 *   a DIFFERENT, stub-listed leaf that no specifier ever names.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  collectConditionTargets,
  findStubsReachableFromShippedCode,
  leafTargetMap,
  reachableStubErrorMessage,
} from '../../scripts/repo/build-stubs/dist-graph.mts'
import { makeUnexposedModuleSource } from '../../scripts/repo/build-stubs/unexposed.mts'

interface FixtureSpec {
  // package.json "exports".
  exports: Record<string, unknown>
  // Leaves in the buildStubs.unexposed section.
  leaves: string[]
  // dist-relative path -> file body. A body of undefined means "stub it".
  files: Record<string, string | undefined>
}

function writeFixtureRepo(spec: FixtureSpec): string {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'dist-graph-'))
  writeFileSync(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({ exports: spec.exports }),
  )
  const settingsDir = path.join(repoRoot, '.config', 'repo')
  mkdirSync(settingsDir, { recursive: true })
  writeFileSync(
    path.join(settingsDir, 'socket-wheelhouse.json'),
    JSON.stringify({
      buildStubs: { unexposed: { leaves: spec.leaves, scannedRoster: [] } },
    }),
  )
  const entries = Object.entries(spec.files)
  for (let i = 0, { length } = entries; i < length; i += 1) {
    const [rel, body] = entries[i]!
    const absPath = path.join(repoRoot, rel)
    mkdirSync(path.dirname(absPath), { recursive: true })
    writeFileSync(absPath, body ?? makeUnexposedModuleSource(rel, ['doThing']))
  }
  return repoRoot
}

describe('collectConditionTargets', () => {
  it('collects a target from every condition, not just default', () => {
    expect(
      collectConditionTargets(
        {
          browser: {
            default: './dist/example/browser.js',
            types: './dist/example/beta.d.ts',
          },
          default: './dist/example/node.js',
          source: './src/example/node.ts',
        },
        [],
      ),
    ).toEqual(['dist/example/browser.js', 'dist/example/node.js'])
  })

  it('reads a bare string entry and skips non-js targets', () => {
    expect(collectConditionTargets('./dist/example.js', [])).toEqual([
      'dist/example.js',
    ])
    expect(collectConditionTargets('./data/example.json', [])).toEqual([])
  })
})

describe('leafTargetMap', () => {
  it('skips pattern entries and package.json', () => {
    const repoRoot = writeFixtureRepo({
      exports: {
        './package.json': './package.json',
        './real': './dist/real.js',
        './wild/*': './dist/wild/*.js',
      },
      files: { 'dist/real.js': "'use strict';\n" },
      leaves: [],
    })
    expect([...leafTargetMap(repoRoot).keys()]).toEqual(['real'])
  })
})

describe('findStubsReachableFromShippedCode', () => {
  it('flags a stub reached through a browser condition of a real leaf', () => {
    const repoRoot = writeFixtureRepo({
      exports: {
        // The leaf a consumer imports. Its browser condition resolves to the
        // stub-listed twin below, which no specifier names.
        './http-request': {
          browser: { default: './dist/http-request/browser.js' },
          default: './dist/http-request/node.js',
        },
        './http-request/browser': {
          browser: { default: './dist/http-request/browser.js' },
          default: './dist/http-request/browser.js',
        },
      },
      files: {
        'dist/http-request/browser.js': undefined,
        'dist/http-request/node.js':
          "'use strict';\nexports.httpRequest = 1;\n",
      },
      leaves: ['http-request/browser'],
    })
    const findings = findStubsReachableFromShippedCode(repoRoot)
    expect(findings).toEqual([
      {
        chain: ['http-request'],
        file: 'dist/http-request/browser.js',
        leaves: ['http-request/browser'],
      },
    ])
  })

  it('flags a stub reached transitively through a require hop', () => {
    const repoRoot = writeFixtureRepo({
      exports: {
        './entry': './dist/entry.js',
        './leaf/deep': './dist/leaf/deep.js',
      },
      files: {
        'dist/entry.js': "'use strict';\nrequire('./leaf/deep.js');\n",
        'dist/leaf/deep.js': undefined,
      },
      leaves: ['leaf/deep'],
    })
    const findings = findStubsReachableFromShippedCode(repoRoot)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.chain).toEqual(['entry', 'dist/leaf/deep.js'])
  })

  it('resolves an extensionless require and a directory index', () => {
    const repoRoot = writeFixtureRepo({
      exports: {
        './entry': './dist/entry.js',
        './pkg': './dist/pkg/index.js',
      },
      files: {
        'dist/entry.js': "'use strict';\nrequire('./pkg');\n",
        'dist/pkg/index.js': undefined,
      },
      leaves: ['pkg'],
    })
    expect(findStubsReachableFromShippedCode(repoRoot)).toHaveLength(1)
  })

  it('passes when every stub is unreachable from shipped code', () => {
    const repoRoot = writeFixtureRepo({
      exports: {
        './entry': './dist/entry.js',
        './orphan': './dist/orphan.js',
      },
      files: {
        'dist/entry.js': "'use strict';\nexports.doThing = 1;\n",
        'dist/orphan.js': undefined,
      },
      leaves: ['orphan'],
    })
    expect(findStubsReachableFromShippedCode(repoRoot)).toEqual([])
  })

  it('does not walk out of a stub, so a stub-only chain stays clean', () => {
    const repoRoot = writeFixtureRepo({
      exports: {
        './entry': './dist/entry.js',
        './stub/one': './dist/stub/one.js',
        './stub/two': './dist/stub/two.js',
      },
      files: {
        'dist/entry.js': "'use strict';\nexports.doThing = 1;\n",
        // one would require two if it were real, but its body is generated.
        'dist/stub/one.js': undefined,
        'dist/stub/two.js': undefined,
      },
      leaves: ['stub/one', 'stub/two'],
    })
    expect(findStubsReachableFromShippedCode(repoRoot)).toEqual([])
  })

  it('returns nothing for an unbuilt tree', () => {
    const repoRoot = writeFixtureRepo({
      exports: { './entry': './dist/entry.js' },
      files: {},
      leaves: [],
    })
    expect(findStubsReachableFromShippedCode(repoRoot)).toEqual([])
  })
})

describe('reachableStubErrorMessage', () => {
  it('names the expose command with every reachable leaf', () => {
    const message = reachableStubErrorMessage([
      {
        chain: ['http-request', 'dist/http-request/fetch/browser.js'],
        file: 'dist/http-request/fetch/browser.js',
        leaves: ['http-request/fetch/browser'],
      },
      {
        chain: ['http-request', 'dist/primordials/headers.js'],
        file: 'dist/primordials/headers.js',
        leaves: ['primordials/headers'],
      },
    ])
    expect(message).toContain('Where: the built dist require graph.')
    expect(message).toContain(
      'node scripts/repo/expose-leaf.mts http-request/fetch/browser primordials/headers',
    )
  })
})
