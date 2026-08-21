/**
 * @file Specs for scripts/repo/check/docs-imports-resolve — the gate that keeps
 *   a documented `@socketsecurity/lib` import resolvable. The pure halves are
 *   what the tests drive: the exports-map target reader, the counterexample
 *   classifier, and the per-file scan.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  distTargetOf,
  isCounterexample,
  scanDocFile,
} from '../../scripts/repo/check/docs-imports-resolve.mts'

function writeDoc(body: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'docs-imports-'))
  mkdirSync(path.join(dir, 'docs'), { recursive: true })
  const file = path.join(dir, 'docs', 'example.md')
  writeFileSync(file, body)
  return file
}

describe('distTargetOf', () => {
  it('reads a bare string target', () => {
    expect(distTargetOf('./dist/thing.js')).toBe('./dist/thing.js')
  })

  it('prefers the node condition', () => {
    expect(
      distTargetOf({
        node: { import: './dist/node.js' },
        default: './dist/browser.js',
      }),
    ).toBe('./dist/node.js')
  })

  it('answers undefined for a shape it cannot read', () => {
    expect(distTargetOf(undefined)).toBe(undefined)
    expect(distTargetOf({ types: './dist/example.d.ts' })).toBe(undefined)
  })
})

describe('isCounterexample', () => {
  it('treats a commented-out import as a counterexample', () => {
    const text = "// import { Spinner } from '@socketsecurity/lib'"
    expect(isCounterexample(text, text.indexOf('import'))).toBe(true)
  })

  it('treats an import under a Wrong marker as a counterexample', () => {
    const text = "// Wrong\nimport { Spinner } from '@socketsecurity/lib'"
    expect(isCounterexample(text, text.lastIndexOf('import'))).toBe(true)
  })

  it('treats a plain example as real', () => {
    const text =
      "Use it like this:\n\nimport { Spinner } from '@socketsecurity/lib/spinner/spinner'"
    expect(isCounterexample(text, text.lastIndexOf('import'))).toBe(false)
  })
})

describe('scanDocFile', () => {
  const exportsMap = {
    './logger/default': { node: { import: './dist/logger/default.js' } },
  }

  it('flags a subpath that is not in the exports map', async () => {
    const file = writeDoc(
      "import { getDefaultLogger } from '@socketsecurity/lib/logger'\n",
    )
    const findings = await scanDocFile(file, exportsMap)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.detail).toMatch(/not in the exports map/)
  })

  it('flags a name the target module does not export', async () => {
    const file = writeDoc(
      "import { getDefaultLogger } from '@socketsecurity/lib/logger/default'\n",
    )
    const root = path.dirname(path.dirname(file))
    mkdirSync(path.join(root, 'dist', 'logger'), { recursive: true })
    writeFileSync(
      path.join(root, 'dist', 'logger', 'default.js'),
      'export const somethingElse = 1\n',
    )
    const findings = await scanDocFile(file, exportsMap, root)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.detail).toMatch(/does not export getDefaultLogger/)
  })

  it('passes a name the target module does export', async () => {
    const file = writeDoc(
      "import { getDefaultLogger } from '@socketsecurity/lib/logger/default'\n",
    )
    const root = path.dirname(path.dirname(file))
    mkdirSync(path.join(root, 'dist', 'logger'), { recursive: true })
    writeFileSync(
      path.join(root, 'dist', 'logger', 'default.js'),
      'export function getDefaultLogger() {}\n',
    )
    expect(await scanDocFile(file, exportsMap, root)).toEqual([])
  })

  it('passes a counterexample', async () => {
    const file = writeDoc(
      "// Wrong\nimport { getDefaultLogger } from '@socketsecurity/lib/logger'\n",
    )
    expect(await scanDocFile(file, exportsMap)).toEqual([])
  })
})
