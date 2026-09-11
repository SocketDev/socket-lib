import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'
import { afterEach, describe, expect, it } from 'vitest'

import { loadPrimordialsSurface } from '../../src/surface.mts'

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
      path.join(targetRoot, 'vendored-primordials.ts'),
      'export const ArrayPrototypeMap = 1\n',
    )
    const surface = loadPrimordialsSurface(targetRoot, explicit)
    expect(Object.getPrototypeOf(surface)).toBeNull()
    expect(surface.source).toBe(explicit)
    expect(surface.exports.has('ArrayPrototypeMap')).toBe(true)
    expect(surface.exports.has('ObjectKeys')).toBe(false)
  })

  it('resolves a relative path against the target root', () => {
    const { targetRoot } = workspace()
    const explicit = writeFile(path.join(targetRoot, 'surface.ts'), LEAF)
    const relative = path.relative(targetRoot, explicit)
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

describe('repository boundaries', () => {
  it('ignores a sibling source without an installed package', () => {
    const { root, targetRoot } = workspace()
    writeFile(path.join(root, 'socket-lib', 'src', 'primordials.ts'), LEAF)
    expect(() => loadPrimordialsSurface(targetRoot)).toThrow()
  })

  it('rejects an explicit source outside the target', () => {
    const { root, targetRoot } = workspace()
    const external = writeFile(path.join(root, 'external.ts'), LEAF)
    expect(() => loadPrimordialsSurface(targetRoot, external)).toThrow()
  })
  it('rejects a contained symlink to external source', () => {
    const { root, targetRoot } = workspace()
    const external = writeFile(path.join(root, 'external.ts'), LEAF)
    const link = path.join(targetRoot, 'surface.ts')
    symlinkSync(external, link)
    expect(() => loadPrimordialsSurface(targetRoot, link)).toThrow()
  })
  it('rejects an escaping leaf within a contained explicit directory', () => {
    const { root, targetRoot } = workspace()
    const external = writeFile(path.join(root, 'external.ts'), LEAF)
    const surface = path.join(targetRoot, 'surface')
    mkdirSync(surface)
    symlinkSync(external, path.join(surface, 'leaf.ts'))
    expect(() => loadPrimordialsSurface(targetRoot, surface)).toThrow()
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
  it('throws listing installed paths and the --surface hint', () => {
    // A bare "not found" leaves the user guessing which layout prim wanted.
    const { targetRoot } = workspace()
    let message = ''
    try {
      loadPrimordialsSurface(targetRoot)
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toContain('Cannot locate @socketsecurity/lib/primordials')
    expect(message).toContain(path.join('dist', 'primordials'))
    expect(message).toContain(path.join('dist', 'primordials.js'))
    expect(message).toContain('--surface')
  })
})
