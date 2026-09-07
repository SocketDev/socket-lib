import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'
import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

import {
  checkModuleExports,
  inquirerExportIssues,
} from '../../../scripts/repo/validate/external-esm-cjs.mts'

const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'external-interop-'))
afterAll(async () => {
  await safeDelete(fixtureRoot)
})

describe('external module interop validation', () => {
  it.each([
    { name: 'named', source: 'module.exports = { answer: 42 }', ok: true },
    {
      name: 'function',
      source: 'module.exports = function example() {}',
      ok: true,
    },
    { name: 'primitive', source: 'module.exports = 42', ok: true },
    { name: 'wrapped', source: 'module.exports = { default: 42 }', ok: false },
    { name: 'empty', source: 'module.exports = {}', ok: false },
    {
      name: 'circular',
      source:
        'module.exports = { answer: 42 }; module.exports.default = module.exports',
      ok: true,
    },
    {
      name: 'mixed',
      source: 'module.exports = { answer: 42, default: function example() {} }',
      ok: true,
    },
    { name: 'throws', source: 'throw new Error("fixture failure")', ok: false },
  ])('validates $name exports through require and import', async fixture => {
    const file = path.join(fixtureRoot, `${fixture.name}.cjs`)
    writeFileSync(file, fixture.source)
    const result = await checkModuleExports(file)
    expect(result.ok).toBe(fixture.ok)
    expect(result.issues.length === 0).toBe(fixture.ok)
    expect(Object.getPrototypeOf(result)).toBeNull()
  })

  it('reports missing modules as structured failures', async () => {
    const result = await checkModuleExports(
      path.join(fixtureRoot, 'missing.cjs'),
    )
    expect(result.ok).toBe(false)
    expect(result.issues).toHaveLength(1)
    expect(Object.getPrototypeOf(result)).toBeNull()
  })
})

describe('inquirer bundle export contracts', () => {
  it.each(['select', 'checkbox', 'search'])(
    'checks %s.js bundle names',
    moduleName => {
      const issues = inquirerExportIssues(
        `@inquirer/${moduleName}.js`,
        {},
        [],
        { default: {} },
      )
      expect(issues).toHaveLength(4)
    },
  )

  it('accepts a default prompt function and a named Separator', () => {
    function prompt() {}
    function Separator() {}
    const cjs = { default: prompt, Separator }
    expect(
      inquirerExportIssues('@inquirer/select.js', cjs, Object.keys(cjs), {
        default: cjs,
        Separator,
      }),
    ).toEqual([])
  })

  it('reports primitive exports without throwing during package validation', () => {
    expect(
      inquirerExportIssues('@inquirer/search.js', 42, [], { default: 42 }),
    ).toHaveLength(4)
  })

  it('does not impose prompt contracts on unrelated bundles', () => {
    expect(inquirerExportIssues('example/select.js', {}, [], {})).toEqual([])
  })
})
