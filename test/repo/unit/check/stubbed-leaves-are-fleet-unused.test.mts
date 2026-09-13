/**
 * @file Specs for scripts/repo/check/stubbed-leaves-are-fleet-unused — the
 *   dist-bytes leg that flags banner-marked stub modules missing from the
 *   committed stub list.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'

import {
  findUnlistedStubs,
  inspectFleetUsageValidation,
  main,
} from '../../../../scripts/repo/check/stubbed-leaves-are-fleet-unused.mts'
import {
  makeUnexposedModuleSource,
  STUB_BANNER,
} from '../../../../scripts/repo/build-stubs/unexposed.mts'

const state = vi.hoisted(() => ({
  root: '',
  quiet: false,
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}))
vi.mock(import('../../../../scripts/fleet/paths.mts'), async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    get REPO_ROOT() {
      return state.root || actual.REPO_ROOT
    },
  }
})
vi.mock(
  import('../../../../scripts/repo/flags/predicates.mts'),
  async importOriginal => {
    const actual = await importOriginal()
    return { ...actual, isQuiet: () => state.quiet }
  },
)
vi.mock(
  import('../../../../scripts/fleet/process/script-output.mts'),
  async importOriginal => {
    const actual = await importOriginal()
    const logger = actual.getScriptLogger()
    vi.spyOn(logger, 'error').mockImplementation(state.error)
    vi.spyOn(logger, 'log').mockImplementation(state.log)
    vi.spyOn(logger, 'warn').mockImplementation(state.warn)
    return { ...actual, getScriptLogger: () => logger }
  },
)

const fixtures: string[] = []
afterEach(() => {
  state.root = ''
  state.quiet = false
  vi.clearAllMocks()
  for (const root of fixtures.splice(0)) {
    safeDeleteSync(root)
  }
})

function writeFixtureRepo(): string {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'stub-check-'))
  fixtures.push(repoRoot)
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
  const settingsDir = path.join(repoRoot, '.config', 'repo')
  mkdirSync(settingsDir, { recursive: true })
  writeFileSync(
    path.join(settingsDir, 'socket-wheelhouse.json'),
    JSON.stringify({
      buildStubs: {
        unexposed: { leaves: ['listed/mod'], scannedRoster: [] },
      },
    }),
  )
  const rosterDir = path.join(
    repoRoot,
    '.claude',
    'skills',
    'fleet',
    'cascading-commits',
    'lib',
  )
  mkdirSync(rosterDir, { recursive: true })
  writeFileSync(
    path.join(rosterDir, 'fleet-repos.json'),
    JSON.stringify({ repos: [{ name: 'example-consumer' }] }),
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

describe('inspectFleetUsageValidation', () => {
  it('fails fleet usage validation when consumer evidence is missing', () => {
    const repoRoot = writeFixtureRepo()

    expect(inspectFleetUsageValidation(repoRoot)).toEqual({
      failed: true,
      missingEvidence: ['example-consumer'],
      stale: [],
    })
  })
  it.each([false, true])(
    'main fails without success output when quiet=%s and evidence is missing',
    quiet => {
      const repoRoot = writeFixtureRepo()
      writeFileSync(
        path.join(repoRoot, 'package.json'),
        JSON.stringify({ exports: {} }),
      )
      writeFileSync(
        path.join(repoRoot, '.config/repo/socket-wheelhouse.json'),
        JSON.stringify({
          buildStubs: {
            unexposed: { leaves: [], scannedRoster: ['example-consumer'] },
          },
        }),
      )
      safeDeleteSync(path.join(repoRoot, 'dist'))
      state.root = repoRoot
      state.quiet = quiet
      const originalExitCode = process.exitCode
      try {
        process.exitCode = 0
        main()
        expect(process.exitCode).toBe(1)
        expect(state.error).toHaveBeenCalledTimes(1)
        expect(state.log).not.toHaveBeenCalled()
      } finally {
        process.exitCode = originalExitCode
      }
    },
  )
})
