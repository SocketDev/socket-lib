import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { checkEsmNamedExports } from '../../../scripts/validate/esm-named-exports.mts'
import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'esm-named-exports-'))
afterAll(async () => {
  await safeDelete(fixtureRoot)
})

describe('checkEsmNamedExports consumer verdicts', () => {
  it.each([
    { name: 'named.cjs', source: 'module.exports = { answer: 42 }', ok: true },
    { name: 'primitive.cjs', source: 'module.exports = 42', ok: false },
    {
      name: 'wrapped.cjs',
      source: 'module.exports = { default: 42 }',
      ok: false,
    },
    {
      name: 'interop.cjs',
      source: 'const named = { answer: 42 }; module.exports = named',
      ok: true,
    },
    {
      name: 'mixed-default.cjs',
      source: 'module.exports.default = 42; module.exports.answer = 7',
      ok: false,
    },
    { name: 'empty.cjs', source: 'module.exports = {}', ok: false },
    { name: 'example-types.js', source: 'module.exports = {}', ok: true },
    { name: 'types.js', source: 'module.exports = {}', ok: true },
    {
      name: 'throws.cjs',
      source: 'throw new Error("fixture failure")',
      ok: false,
    },
    {
      name: 'cli.cjs',
      source: '#!/usr/bin/env node\nthrow new Error("must not load")',
      ok: true,
    },
  ])('reports $name', fixture => {
    const file = path.join(fixtureRoot, fixture.name)
    writeFileSync(file, fixture.source)
    const result = checkEsmNamedExports(file)
    expect(result.ok).toBe(fixture.ok)
    expect(result.path).toBe(file)
    expect(Object.getPrototypeOf(result)).toBeNull()
    if (!fixture.ok) {
      expect(result).toHaveProperty('reason', expect.any(String))
    }
  })

  it('reports missing files without throwing', () => {
    const result = checkEsmNamedExports(path.join(fixtureRoot, 'missing.cjs'))
    expect(result.ok).toBe(false)
    expect(Object.getPrototypeOf(result)).toBeNull()
  })
})
