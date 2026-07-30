/**
 * @file Specs for scripts/repo/check/stubbed-leaves-are-fleet-unused — the
 *   dist-bytes leg that flags banner-marked stub modules missing from the
 *   committed stub list.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { findUnlistedStubs } from '../../scripts/repo/check/stubbed-leaves-are-fleet-unused.mts'
import {
  makeUnexposedModuleSource,
  STUB_BANNER,
} from '../../scripts/repo/build-stubs/unexposed.mts'

function writeFixtureRepo(): string {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'stub-check-'))
  writeFileSync(
    path.join(repoRoot, 'package.json'),
    JSON.stringify({
      exports: {
        './listed/mod': { default: './dist/listed/mod.js' },
        './real/mod': './dist/real/mod.js',
        './unlisted/mod': { default: './dist/unlisted/mod.js' },
      },
    }),
  )
  const stubsDir = path.join(repoRoot, 'scripts', 'repo', 'build-stubs')
  mkdirSync(stubsDir, { recursive: true })
  writeFileSync(
    path.join(stubsDir, 'unexposed-leaves.json'),
    JSON.stringify({ leaves: ['listed/mod'] }),
  )
  for (const leaf of ['listed', 'real', 'unlisted']) {
    mkdirSync(path.join(repoRoot, 'dist', leaf), { recursive: true })
  }
  writeFileSync(
    path.join(repoRoot, 'dist', 'listed', 'mod.js'),
    makeUnexposedModuleSource('listed/mod', ['doThing']),
  )
  writeFileSync(
    path.join(repoRoot, 'dist', 'real', 'mod.js'),
    "'use strict';\nexports.doThing = function doThing() {};\n",
  )
  writeFileSync(
    path.join(repoRoot, 'dist', 'unlisted', 'mod.js'),
    makeUnexposedModuleSource('unlisted/mod', ['doThing']),
  )
  return repoRoot
}

describe('findUnlistedStubs', () => {
  it('flags a banner-marked dist module missing from the stub list', () => {
    const repoRoot = writeFixtureRepo()
    const findings = findUnlistedStubs(repoRoot)
    expect(findings).toEqual([
      { leaf: 'unlisted/mod', target: './dist/unlisted/mod.js' },
    ])
  })

  it('passes a listed stub and a real module', () => {
    const repoRoot = writeFixtureRepo()
    const findings = findUnlistedStubs(repoRoot)
    const leaves = findings.map(f => f.leaf)
    expect(leaves).not.toContain('listed/mod')
    expect(leaves).not.toContain('real/mod')
  })

  it('keys on the exact stub banner', () => {
    const repoRoot = writeFixtureRepo()
    writeFileSync(
      path.join(repoRoot, 'dist', 'real', 'mod.js'),
      `// mentions ${STUB_BANNER} in a comment, not as the first bytes\n'use strict';\nexports.doThing = 1;\n`,
    )
    expect(findUnlistedStubs(repoRoot).map(f => f.leaf)).toEqual([
      'unlisted/mod',
    ])
  })
})
