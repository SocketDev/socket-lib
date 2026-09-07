import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { safeDeleteSync } from '@socketsecurity/lib-stable/fs/safe'
import { afterAll, describe, expect, it } from 'vitest'

import { checkExternalExport } from '../../../scripts/repo/validate/external-exports.mts'

const fixtureDir = mkdtempSync(
  path.join(os.tmpdir(), 'external-export-results-'),
)

afterAll(() => safeDeleteSync(fixtureDir, { recursive: true }))

describe('checkExternalExport result contract', () => {
  it.each([
    {
      name: 'named',
      source: 'module.exports = { answer: 42 }',
      ok: true,
      keys: 1,
    },
    {
      name: 'primitive',
      source: 'module.exports = 42',
      ok: true,
      keys: 'primitive',
    },
    {
      name: 'wrapped',
      source: 'module.exports = { default: { answer: 42 } }',
      ok: false,
      keys: undefined,
    },
    {
      name: 'empty',
      source: 'module.exports = {}',
      ok: false,
      keys: undefined,
    },
    {
      name: 'circular',
      source:
        'module.exports = { answer: 42 }; module.exports.default = module.exports',
      ok: true,
      keys: 1,
    },
    {
      name: 'shadowed',
      source:
        'module.exports = { answer: 42, default: { first: 1, second: 2 } }',
      ok: false,
      keys: undefined,
    },
  ])('preserves the $name verdict without inherited properties', fixture => {
    const file = path.join(fixtureDir, `${fixture.name}.cjs`)
    writeFileSync(file, fixture.source)
    const result = checkExternalExport(file)
    expect(result.ok).toBe(fixture.ok)
    if (fixture.keys !== undefined) {
      expect(result).toHaveProperty('keys', fixture.keys)
    } else {
      expect(result).toHaveProperty('reason', expect.any(String))
    }
    expect(Object.getPrototypeOf(result)).toBeNull()
    expect('constructor' in result).toBe(false)
  })

  it('reports a missing module without inheriting object methods', () => {
    const result = checkExternalExport(path.join(fixtureDir, 'missing.cjs'))
    expect(result.ok).toBe(false)
    expect(result).toHaveProperty('reason', expect.any(String))
    expect(Object.getPrototypeOf(result)).toBeNull()
  })
})
