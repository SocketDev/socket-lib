import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { checkExport } from '../../../scripts/validate/dist-exports.mts'
import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

let tmpDir: string | undefined

afterEach(async () => {
  if (tmpDir) {
    await safeDelete(tmpDir)
    tmpDir = undefined
  }
})

describe('checkExport', () => {
  it('skips a node shebang entrypoint without loading its side effects', () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'dist-exports-test-'))
    const entrypoint = path.join(tmpDir, 'native-host.js')
    writeFileSync(
      entrypoint,
      '#!/usr/bin/env node\nthrow new Error("entrypoint was loaded")\n',
    )

    const result = checkExport(entrypoint)
    expect(Object.getPrototypeOf(result)).toBeNull()
    expect(result).toMatchObject({
      ok: true,
      skipped: true,
    })
  })

  it.each([
    { name: 'named', source: 'module.exports = { answer: 42 }', ok: true },
    { name: 'primitive', source: 'module.exports = 42', ok: true },
    { name: 'wrapped', source: 'module.exports = { default: 42 }', ok: false },
  ])('preserves the $name verdict in a prototype-free result', fixture => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'dist-exports-result-'))
    const file = path.join(tmpDir, `${fixture.name}.cjs`)
    writeFileSync(file, fixture.source)
    const result = checkExport(file)
    expect(result.ok).toBe(fixture.ok)
    expect(result.path).toBe(file)
    expect(Object.getPrototypeOf(result)).toBeNull()
    expect('constructor' in result).toBe(false)
  })

  it('reports a missing export in a prototype-free result', () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'dist-exports-missing-'))
    const result = checkExport(path.join(tmpDir, 'missing.cjs'))
    expect(result.ok).toBe(false)
    expect(result).toHaveProperty('reason', expect.any(String))
    expect(Object.getPrototypeOf(result)).toBeNull()
  })
})
