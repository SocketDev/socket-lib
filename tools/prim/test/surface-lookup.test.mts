/**
 * @file Unit tests for `loadPrimordialsSurface`, prim's five-step search for a
 *   primordials source. The order matters more than any single step: a sibling
 *   checkout must win over an installed copy, or fleet development audits
 *   against last week's released surface and reports migrated call sites as
 *   gaps. Each test builds only the layouts it wants present, so the step under
 *   test is the first one that can match.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'
import { afterEach, describe, expect, it } from 'vitest'

import { loadPrimordialsSurface } from '../src/surface.mts'

const tmpDirs: string[] = []

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await safeDelete(dir)
  }
})

/**
 * A workspace holding a `target-pkg` directory. Sibling lookups resolve
 * relative to that target, so the extra nesting level is what makes
 * `<target>/../socket-lib` reachable without escaping the temp root.
 */
function workspace(): { root: string; targetRoot: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), 'prim-lookup-'))
  tmpDirs.push(root)
  const targetRoot = path.join(root, 'target-pkg')
  mkdirSync(targetRoot, { recursive: true })
  return { root, targetRoot }
}

function writeFile(abs: string, content: string): string {
  mkdirSync(path.dirname(abs), { recursive: true })
  writeFileSync(abs, content, 'utf8')
  return abs
}

const LEAF = 'export const ObjectKeys = 1\n'

describe('an explicit --surface path', () => {
  it('wins over every other candidate', () => {
    const { root, targetRoot } = workspace()
    writeFile(path.join(root, 'socket-lib', 'src', 'primordials.ts'), LEAF)
    const explicit = writeFile(
      path.join(root, 'vendored-primordials.ts'),
      'export const ArrayPrototypeMap = 1\n',
    )
    const surface = loadPrimordialsSurface(targetRoot, explicit)
    expect(surface.source).toBe(explicit)
    expect(surface.exports.has('ArrayPrototypeMap')).toBe(true)
    expect(surface.exports.has('ObjectKeys')).toBe(false)
  })

  it('resolves a relative path against the cwd', () => {
    const { targetRoot } = workspace()
    const explicit = writeFile(path.join(targetRoot, 'surface.ts'), LEAF)
    const relative = path.relative(process.cwd(), explicit)
    expect(loadPrimordialsSurface(targetRoot, relative).source).toBe(explicit)
  })

  it('throws naming the resolved path when the file is missing', () => {
    // The user typed a path; echoing back the resolved absolute form is what
    // makes a wrong-cwd mistake obvious.
    const { targetRoot } = workspace()
    const missing = path.join(targetRoot, 'absent.ts')
    expect(() => loadPrimordialsSurface(targetRoot, missing)).toThrow(missing)
  })
})

describe('the sibling socket-lib checkout', () => {
  it('prefers its split src/primordials/ directory', () => {
    const { root, targetRoot } = workspace()
    writeFile(
      path.join(root, 'socket-lib', 'src', 'primordials', 'object.ts'),
      LEAF,
    )
    const surface = loadPrimordialsSurface(targetRoot)
    expect(surface.source).toBe(
      path.join(root, 'socket-lib', 'src', 'primordials'),
    )
    expect(surface.exportToLeaf.get('ObjectKeys')).toBe('object')
  })

  it('falls back to the legacy single-file src/primordials.ts', () => {
    const { root, targetRoot } = workspace()
    const legacy = writeFile(
      path.join(root, 'socket-lib', 'src', 'primordials.ts'),
      LEAF,
    )
    expect(loadPrimordialsSurface(targetRoot).source).toBe(legacy)
  })

  it('beats the installed copy so unreleased exports are seen', () => {
    const { root, targetRoot } = workspace()
    const sibling = writeFile(
      path.join(root, 'socket-lib', 'src', 'primordials.ts'),
      'export const BrandNewPrimordial = 1\n',
    )
    writeFile(
      path.join(
        targetRoot,
        'node_modules',
        '@socketsecurity',
        'lib',
        'dist',
        'primordials.js',
      ),
      LEAF,
    )
    const surface = loadPrimordialsSurface(targetRoot)
    expect(surface.source).toBe(sibling)
    expect(surface.exports.has('BrandNewPrimordial')).toBe(true)
  })
})

describe('the installed @socketsecurity/lib copy', () => {
  it('prefers its split dist/primordials/ directory', () => {
    const { targetRoot } = workspace()
    const installed = path.join(
      targetRoot,
      'node_modules',
      '@socketsecurity',
      'lib',
      'dist',
      'primordials',
    )
    writeFile(path.join(installed, 'object.js'), LEAF)
    expect(loadPrimordialsSurface(targetRoot).source).toBe(installed)
  })

  it('falls back to the legacy dist/primordials.js', () => {
    const { targetRoot } = workspace()
    const legacy = writeFile(
      path.join(
        targetRoot,
        'node_modules',
        '@socketsecurity',
        'lib',
        'dist',
        'primordials.js',
      ),
      LEAF,
    )
    expect(loadPrimordialsSurface(targetRoot).source).toBe(legacy)
  })
})

describe('when nothing resolves', () => {
  it('throws listing all four probed paths and the --surface hint', () => {
    // A bare "not found" leaves the user guessing which layout prim wanted.
    const { targetRoot } = workspace()
    let message = ''
    try {
      loadPrimordialsSurface(targetRoot)
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toContain('Cannot locate @socketsecurity/lib/primordials')
    expect(message).toContain(path.join('socket-lib', 'src', 'primordials'))
    expect(message).toContain(path.join('socket-lib', 'src', 'primordials.ts'))
    expect(message).toContain(path.join('dist', 'primordials'))
    expect(message).toContain(path.join('dist', 'primordials.js'))
    expect(message).toContain('--surface')
  })
})
