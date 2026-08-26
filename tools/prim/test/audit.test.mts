/**
 * @file Unit tests for `auditDirectory`, the walk that produces every `prim
 *   audit` finding. Two things matter here and neither is visible from the
 *   visitor tests: which files the walk decides to read at all, and what it
 *   does with a file it cannot read. A silently skipped file makes an audit
 *   report "surface complete" while call sites go unexamined, so the
 *   skipped-file bookkeeping is asserted as carefully as the findings.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'
import { afterEach, describe, expect, it } from 'vitest'

import { auditDirectory } from '../src/audit.mts'

const tmpDirs: string[] = []

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await safeDelete(dir)
  }
})

/**
 * Build a target tree whose `src/` holds the given files, and hand back the
 * root plus the scan directory the audit walks.
 */
function target(files: Record<string, string>): {
  scanDir: string
  targetRoot: string
} {
  const targetRoot = mkdtempSync(path.join(os.tmpdir(), 'prim-audit-'))
  tmpDirs.push(targetRoot)
  const scanDir = path.join(targetRoot, 'src')
  mkdirSync(scanDir, { recursive: true })
  for (const [name, content] of Object.entries(files)) {
    const abs = path.join(scanDir, name)
    mkdirSync(path.dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf8')
  }
  return { scanDir, targetRoot }
}

function audit(files: Record<string, string>, exported: string[] = []) {
  const { scanDir, targetRoot } = target(files)
  return auditDirectory({ exported: new Set(exported), scanDir, targetRoot })
}

const SRC = 'src'

describe('classifying a call site', () => {
  it('marks a site covered when the primordial is already exported', async () => {
    const findings = await audit(
      { 'example.mjs': 'const keys = Object.keys(o)\n' },
      ['ObjectKeys'],
    )
    expect(findings).toContainEqual(
      expect.objectContaining({
        file: path.join(SRC, 'example.mjs'),
        kind: 'covered',
        primordial: 'ObjectKeys',
      }),
    )
  })

  it('marks the same site a gap when the surface lacks it', async () => {
    // Same input, empty surface: the classification is the ONLY difference,
    // and it decides whether the user migrates or extends primordials.
    const findings = await audit({
      'example.mjs': 'const keys = Object.keys(o)\n',
    })
    expect(findings).toContainEqual(
      expect.objectContaining({ kind: 'gap', primordial: 'ObjectKeys' }),
    )
  })

  it('records a one-based line and a target-root-relative path', async () => {
    const findings = await audit({
      'nested/example.mjs': '\n\nconst keys = Object.keys(o)\n',
    })
    const hit = findings.find(f => f.primordial === 'ObjectKeys')
    expect(hit?.line).toBe(3)
    expect(hit?.file).toBe(path.join(SRC, 'nested', 'example.mjs'))
  })

  it('reports one finding per site, not one per name occurrence', async () => {
    const findings = await audit({
      'example.mjs': 'const keys = Object.keys(o)\n',
    })
    expect(findings.filter(f => f.primordial === 'ObjectKeys')).toHaveLength(1)
  })

  it('flags a hand-rolled local alias as a redeclaration', async () => {
    // The bigger win than rewriting the call site is deleting the alias and
    // importing the primordial, so this kind is reported separately.
    const findings = await audit(
      { 'example.mjs': 'const ObjectKeys = Object.keys\n' },
      ['ObjectKeys'],
    )
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: 'redeclaration',
        pattern: 'const ObjectKeys = Object.keys',
        primordial: 'ObjectKeys',
      }),
    )
  })

  it('reports each redeclaration once even when the file repeats it', async () => {
    const findings = await audit(
      {
        'example.mjs':
          'const ObjectKeys = Object.keys\nconst ErrorCtor = Error\n',
      },
      ['ErrorCtor', 'ObjectKeys'],
    )
    expect(findings.filter(f => f.kind === 'redeclaration')).toHaveLength(2)
  })
})

describe('which files the walk reads', () => {
  it('descends into subdirectories', async () => {
    const findings = await audit({
      'deep/nested/example.mjs': 'Object.keys(o)\n',
    })
    expect(findings.length).toBeGreaterThan(0)
  })

  it('skips node_modules, external and .cache by default', async () => {
    // Vendored code is not the user's to migrate, and node_modules would
    // dominate every audit.
    const findings = await audit({
      '.cache/cached.mjs': 'Object.keys(o)\n',
      'external/vendored.mjs': 'Object.keys(o)\n',
      'node_modules/pkg/installed.mjs': 'Object.keys(o)\n',
    })
    expect(findings).toEqual([])
  })

  it('skips a primordials source file, which is the surface itself', async () => {
    const findings = await audit({ 'primordials.mts': 'Object.keys(o)\n' })
    expect(findings).toEqual([])
  })

  it('ignores files that are not JavaScript or TypeScript source', async () => {
    const findings = await audit({
      'data.json': '{"a": 1}',
      'notes.md': 'Object.keys(o)\n',
      'types.d.ts': 'export declare const a: number\n',
    })
    expect(findings).toEqual([])
  })

  it('honours a caller-supplied skip list instead of the defaults', async () => {
    const { scanDir, targetRoot } = target({
      'generated/emitted.mjs': 'Object.keys(o)\n',
      'keep.mjs': 'Object.keys(o)\n',
    })
    const findings = await auditDirectory({
      exported: new Set<string>(),
      scanDir,
      skipDirs: ['generated'],
      skipFiles: [],
      targetRoot,
    })
    expect(findings.map(f => f.file)).toEqual([path.join(SRC, 'keep.mjs')])
  })
})

describe('files the walk cannot audit', () => {
  it('records a TypeScript file that fails to type-strip', async () => {
    const findings = await audit({
      'broken.mts': 'const a: = = 1\n',
      'fine.mjs': 'Object.keys(o)\n',
    })
    expect(findings.stripFailureFiles).toEqual([path.join(SRC, 'broken.mts')])
    expect(findings.stripFailures).toBe(1)
    expect(findings.parseFailures).toBe(0)
  })

  it('records a JavaScript file the parser rejects', async () => {
    const findings = await audit({ 'broken.mjs': 'const = = =\n' })
    expect(findings.parseFailureFiles).toEqual([path.join(SRC, 'broken.mjs')])
    expect(findings.parseFailures).toBe(1)
    expect(findings.stripFailures).toBe(0)
  })

  it('keeps auditing the files around a broken one', async () => {
    // One unparseable file must not cost the whole run; the report says the
    // audit is incomplete instead.
    const findings = await audit({
      'broken.mjs': 'const = = =\n',
      'fine.mjs': 'Object.keys(o)\n',
    })
    expect(findings.length).toBe(1)
    expect(findings.parseFailures).toBe(1)
  })

  it('hides the bookkeeping from array consumers', async () => {
    // The findings value is passed straight to JSON.stringify and to the
    // human formatter, both of which treat it as a plain array.
    const findings = await audit({ 'example.mjs': 'Object.keys(o)\n' })
    expect(Object.keys(findings)).toEqual(['0'])
    expect(JSON.parse(JSON.stringify(findings))).toHaveLength(1)
  })

  it('reports empty skip lists for a clean tree', async () => {
    const findings = await audit({ 'example.mjs': 'Object.keys(o)\n' })
    expect(findings.parseFailureFiles).toEqual([])
    expect(findings.stripFailureFiles).toEqual([])
  })
})

describe('an empty tree', () => {
  it('produces no findings and no failures', async () => {
    const findings = await audit({})
    expect(findings).toEqual([])
    expect(findings.parseFailures).toBe(0)
  })
})
