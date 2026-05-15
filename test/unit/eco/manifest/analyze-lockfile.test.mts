/**
 * @fileoverview Unit tests for analyzeLockfile.
 */

import { describe, expect, it } from 'vitest'

import { analyzeLockfile } from '@socketsecurity/lib-stable/eco/manifest/analyze-lockfile'
import { parsePackageLock } from '@socketsecurity/lib-stable/eco/npm/npm/parse-lockfile'

const LOCK = parsePackageLock(
  JSON.stringify({
    lockfileVersion: 3,
    packages: {
      'node_modules/a': { version: '1.0.0' },
      'node_modules/b': { version: '1.0.0', dev: true },
      'node_modules/c': { version: '1.0.0', optional: true },
      'node_modules/d': { version: '1.0.0', peer: true },
    },
  }),
)

describe('eco/manifest/analyze-lockfile', () => {
  const stats = analyzeLockfile(LOCK)

  it('counts totalPackages', () => {
    expect(stats.totalPackages).toBe(4)
  })

  it('counts prodDeps', () => {
    expect(stats.prodDeps).toBe(1)
  })

  it('counts devDeps', () => {
    expect(stats.devDeps).toBe(1)
  })

  it('counts optionalDeps', () => {
    expect(stats.optionalDeps).toBe(1)
  })

  it('reports byEcosystem total', () => {
    expect(stats.byEcosystem['npm']).toBe(4)
  })

  it('returns 0 for maxDepth/avgDepth (flat shape)', () => {
    expect(stats.maxDepth).toBe(0)
    expect(stats.avgDepth).toBe(0)
  })
})
