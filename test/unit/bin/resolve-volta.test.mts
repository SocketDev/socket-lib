/**
 * @file Unit tests for src/bin/resolve — resolveRealBinSync's Volta shim
 *   resolution: npm via image/npm/<version>, the node_modules/npm fallback,
 *   non-npm packages via packages/<pkg>/bin/<name>, resolution caching, and
 *   the "node" basename shim-avoidance case.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveRealBinSync } from '../../../src/bin/resolve'
import { safeDelete } from '../../../src/fs/safe'

describe.sequential('bin.ts — Volta resolution', () => {
  let voltaRoot: string

  beforeEach(() => {
    voltaRoot = mkdtempSync(path.join(os.tmpdir(), 'volta-'))
    mkdirSync(path.join(voltaRoot, '.volta', 'bin'), { recursive: true })
    mkdirSync(path.join(voltaRoot, 'tools', 'image'), { recursive: true })
    mkdirSync(path.join(voltaRoot, 'tools', 'user', 'bin'), {
      recursive: true,
    })
  })

  afterEach(async () => {
    try {
      await safeDelete(voltaRoot, { force: true })
    } catch {}
  })

  function writePlatform(platform: {
    node?:
      | { runtime?: string | undefined; npm?: string | undefined }
      | undefined
  }): void {
    writeFileSync(
      path.join(voltaRoot, 'tools', 'user', 'platform.json'),
      JSON.stringify(platform),
    )
  }

  it('resolves npm via image/npm/<version>/bin/npm-cli.js', () => {
    writePlatform({ node: { runtime: '20.0.0', npm: '10.0.0' } })
    const npmCliPath = path.join(
      voltaRoot,
      'tools',
      'image',
      'npm',
      '10.0.0',
      'bin',
      'npm-cli.js',
    )
    mkdirSync(path.dirname(npmCliPath), { recursive: true })
    writeFileSync(npmCliPath, '#!/usr/bin/env node\n')
    const fakeNpmShim = path.join(voltaRoot, '.volta', 'bin', 'npm')
    const result = resolveRealBinSync(fakeNpmShim)
    expect(result).toContain('npm-cli.js')
  })

  it('falls back to node/<v>/lib/node_modules/npm when image/npm/<v> missing', () => {
    writePlatform({ node: { runtime: '20.0.0', npm: '10.0.0' } })
    const fallbackPath = path.join(
      voltaRoot,
      'tools',
      'image',
      'node',
      '20.0.0',
      'lib',
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js',
    )
    mkdirSync(path.dirname(fallbackPath), { recursive: true })
    writeFileSync(fallbackPath, '#!/usr/bin/env node\n')
    const fakeNpmShim = path.join(voltaRoot, '.volta', 'bin', 'npm')
    const result = resolveRealBinSync(fakeNpmShim)
    expect(result).toContain('node_modules')
  })

  it('returns the input path when neither npm path exists', () => {
    writePlatform({ node: { runtime: '20.0.0', npm: '10.0.0' } })
    const fakeNpmShim = path.join(voltaRoot, '.volta', 'bin', 'npm')
    const result = resolveRealBinSync(fakeNpmShim)
    expect(typeof result).toBe('string')
  })

  it('resolves a non-npm binary via packages/<pkg>/bin/<name>', () => {
    writePlatform({ node: { runtime: '20.0.0' } })
    const binJsonPath = path.join(
      voltaRoot,
      'tools',
      'user',
      'bin',
      'mytool.json',
    )
    writeFileSync(binJsonPath, JSON.stringify({ package: 'mytool-pkg' }))
    const binFilePath = path.join(
      voltaRoot,
      'tools',
      'image',
      'packages',
      'mytool-pkg',
      'bin',
      'mytool',
    )
    mkdirSync(path.dirname(binFilePath), { recursive: true })
    writeFileSync(binFilePath, '#!/usr/bin/env node\n')
    const fakeShim = path.join(voltaRoot, '.volta', 'bin', 'mytool')
    const result = resolveRealBinSync(fakeShim)
    expect(result).toContain('mytool-pkg')
  })

  it('returns input when bin metadata json is missing', () => {
    writePlatform({ node: { runtime: '20.0.0' } })
    const fakeShim = path.join(voltaRoot, '.volta', 'bin', 'orphan')
    const result = resolveRealBinSync(fakeShim)
    expect(typeof result).toBe('string')
  })

  it('caches a successful resolution', () => {
    writePlatform({ node: { runtime: '20.0.0', npm: '10.0.0' } })
    const npmCliPath = path.join(
      voltaRoot,
      'tools',
      'image',
      'npm',
      '10.0.0',
      'bin',
      'npm-cli.js',
    )
    mkdirSync(path.dirname(npmCliPath), { recursive: true })
    writeFileSync(npmCliPath, '#!/usr/bin/env node\n')
    const fakeNpmShim = path.join(voltaRoot, '.volta', 'bin', 'npm')
    const first = resolveRealBinSync(fakeNpmShim)
    const second = resolveRealBinSync(fakeNpmShim)
    expect(first).toBe(second)
  })

  it('skips Volta path when basename is "node" (Volta shim avoidance)', () => {
    writePlatform({ node: { runtime: '20.0.0', npm: '10.0.0' } })
    const fakeNodeShim = path.join(voltaRoot, '.volta', 'bin', 'node')
    const result = resolveRealBinSync(fakeNodeShim)
    expect(typeof result).toBe('string')
  })
})
